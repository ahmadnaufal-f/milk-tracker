import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  AnonymousCleanupRepository,
  CleanupLeaseLostError,
  cleanupInactiveAnonymousUsers,
} from "./cleanup-anonymous-users-core";

const CLEANUP_LEASE_MS = 10 * 60 * 1000;

function firestoreRepository(): AnonymousCleanupRepository {
  const db = getFirestore();
  const auth = getAuth();

  async function isAuthUnlinked(uid: string): Promise<boolean> {
    try {
      const user = await auth.getUser(uid);
      return user.providerData.length === 0;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") return true;
      // Fail closed if Auth cannot confirm that the account is unlinked.
      return false;
    }
  }

  function hasLiveGrant(grants: FirebaseFirestore.QueryDocumentSnapshot[], now: number): boolean {
    return grants.some((grant) => {
      const data = grant.data();
      const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : 0;
      return (data.status === "issued" || data.status === "claimed") && expiresAt > now;
    });
  }

  async function refreshCleanupLease(
    userRef: FirebaseFirestore.DocumentReference,
    leaseId: string,
    cutoff: number
  ): Promise<void> {
    const grantsQuery = db.collection("guestMigrations").where("sourceUid", "==", userRef.id);
    const now = Date.now();
    const renewed = await db.runTransaction(async (transaction) => {
      const [userSnapshot, grantsSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(grantsQuery),
      ]);
      const data = userSnapshot.data();
      const lastActive = data?.lastActive;
      if (!userSnapshot.exists || data?.guestCleanupId !== leaseId || data?.isAnonymous !== true ||
        !(lastActive instanceof Timestamp) || lastActive.toMillis() > cutoff || hasLiveGrant(grantsSnapshot.docs, now)) return false;
      transaction.update(userRef, { guestCleanupLeaseExpiresAt: Timestamp.fromMillis(now + CLEANUP_LEASE_MS) });
      return true;
    });
    if (!renewed) throw new CleanupLeaseLostError("Guest eligibility changed during cleanup.");
  }

  return {
    async findInactiveAnonymousUsers(cutoff) {
      const snapshot = await db
        .collection("users")
        .where("isAnonymous", "==", true)
        .where("lastActive", "<=", Timestamp.fromMillis(cutoff))
        .get();
      return snapshot.docs.map((doc) => doc.id);
    },

    async getUser(uid) {
      const snapshot = await db.collection("users").doc(uid).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data();
      const lastActive = data?.lastActive;
      return {
        uid,
        isAnonymous: data?.isAnonymous === true,
        lastActive: lastActive instanceof Timestamp ? lastActive.toMillis() : null,
      };
    },

    isAuthUserUnlinked: isAuthUnlinked,

    async claimCleanup(uid, cutoff, now) {
      const userRef = db.collection("users").doc(uid);
      const grantsQuery = db.collection("guestMigrations").where("sourceUid", "==", uid);
      const leaseId = randomUUID();
      return db.runTransaction(async (transaction) => {
        const [userSnapshot, grantsSnapshot] = await Promise.all([
          transaction.get(userRef),
          transaction.get(grantsQuery),
        ]);
        const data = userSnapshot.data();
        const lastActive = data?.lastActive;
        const existingLeaseExpiry = data?.guestCleanupLeaseExpiresAt;
        const activeLease = existingLeaseExpiry instanceof Timestamp && existingLeaseExpiry.toMillis() > now;
        if (!userSnapshot.exists || data?.isAnonymous !== true || !(lastActive instanceof Timestamp) ||
          lastActive.toMillis() > cutoff || activeLease || hasLiveGrant(grantsSnapshot.docs, now)) return null;
        transaction.update(userRef, {
          guestCleanupStartedAt: Timestamp.fromMillis(now),
          guestCleanupLeaseExpiresAt: Timestamp.fromMillis(now + CLEANUP_LEASE_MS),
          guestCleanupId: leaseId,
        });
        return leaseId;
      });
    },

    async releaseCleanup(uid, leaseId) {
      const userRef = db.collection("users").doc(uid);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists || snapshot.get("guestCleanupId") !== leaseId) return;
        transaction.update(userRef, {
          guestCleanupStartedAt: FieldValue.delete(),
          guestCleanupLeaseExpiresAt: FieldValue.delete(),
          guestCleanupId: FieldValue.delete(),
        });
      });
    },

    async deleteUserData(uid, leaseId, cutoff) {
      const userRef = db.collection("users").doc(uid);
      const sessionRefs = await userRef.collection("sessions").listDocuments();
      // Firestore batches are limited to 500 writes; renew before every chunk.
      for (let offset = 0; offset < sessionRefs.length; offset += 450) {
        if (!(await isAuthUnlinked(uid))) throw new CleanupLeaseLostError("Auth account became linked during cleanup.");
        await refreshCleanupLease(userRef, leaseId, cutoff);
        const batch = db.batch();
        sessionRefs.slice(offset, offset + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      if (!(await isAuthUnlinked(uid))) throw new CleanupLeaseLostError("Auth account became linked during cleanup.");
      await refreshCleanupLease(userRef, leaseId, cutoff);
      await userRef.delete();
    },

    async deleteAuthUser(uid) {
      try {
        const user = await auth.getUser(uid);
        if (user.providerData.length !== 0) return;
        await auth.deleteUser(uid);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") return;
        throw error;
      }
    },
  };
}

/** Deletes guests inactive for the existing 30-day retention period. */
export const cleanupAnonymousUsers = onSchedule(
  { schedule: "every monday 00:00", timeZone: "UTC", region: "asia-southeast1" },
  async () => {
    await cleanupInactiveAnonymousUsers(firestoreRepository(), Date.now());
  }
);
