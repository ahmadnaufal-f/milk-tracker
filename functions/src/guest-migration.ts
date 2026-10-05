import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { defineBoolean, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  confirmGuestMigrationCore,
  createGuestMigrationCore,
  GuestMigrationConfig,
  GuestMigrationGrant,
  GuestMigrationStore,
  guestMigrationConstants,
  parseSourceOriginAllowlist,
  redeemGuestMigrationCore,
} from "./guest-migration-core";

const isMigrationTestEmulator = process.env.FUNCTIONS_EMULATOR === "true" &&
  process.env.GCLOUD_PROJECT === "demo-milk-tracker-migration";
const migrationEnabled = isMigrationTestEmulator ? null : defineBoolean("GUEST_MIGRATION_ENABLED", { default: false });
const migrationCampaignId = isMigrationTestEmulator ? null : defineString("GUEST_MIGRATION_CAMPAIGN_ID", { default: "milk-tracker-domain-2026" });
const migrationSourceOrigins = isMigrationTestEmulator ? null : defineString("GUEST_MIGRATION_SOURCE_ORIGINS", { default: "https://pump.a-naufal.dev" });
const migrationDestinationOrigin = isMigrationTestEmulator
  ? null
  : defineString("GUEST_MIGRATION_DESTINATION_ORIGIN", { default: "https://pump.arkaes.dev" });

const REGION = "asia-southeast1";
const ISSUE_LIMIT = 3;
const ISSUE_WINDOW_MS = 60 * 60 * 1000;
const REDEEM_LIMIT = 20;
const REDEEM_WINDOW_MS = 10 * 60 * 1000;
const CLAIMED_RECEIPT_TTL_MS = guestMigrationConstants.CLAIMED_GRANT_RETENTION_MS;
const CONFIRMED_RECEIPT_TTL_MS = 60 * 60 * 1000;

type RateState = { windowStartedAt?: Timestamp; count?: number };

function readConfig(): GuestMigrationConfig {
  if (isMigrationTestEmulator) {
    return {
      enabled: process.env.GUEST_MIGRATION_TEST_ENABLED === "true",
      campaignId: process.env.GUEST_MIGRATION_TEST_CAMPAIGN_ID?.trim() ?? "",
      sourceOriginAllowlist: parseSourceOriginAllowlist(process.env.GUEST_MIGRATION_TEST_SOURCE_ORIGINS ?? ""),
      destinationOrigin: process.env.GUEST_MIGRATION_TEST_DESTINATION_ORIGIN?.trim() || "https://pump.arkaes.dev",
    };
  }
  return {
    enabled: migrationEnabled!.value(),
    campaignId: migrationCampaignId!.value().trim(),
    sourceOriginAllowlist: parseSourceOriginAllowlist(migrationSourceOrigins!.value()),
    destinationOrigin: migrationDestinationOrigin!.value().trim(),
  };
}

function getActualOrigin(request: { rawRequest: { headers: Record<string, string | string[] | undefined> } }): string | undefined {
  const origin = request.rawRequest.headers.origin;
  return typeof origin === "string" ? origin : undefined;
}

function requireOnlyKeys(data: unknown, expectedKeys: string[]): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Request data is not valid.");
  }
  const record = data as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => !expectedKeys.includes(key)) || expectedKeys.some((key) => !keys.includes(key))) {
    throw new HttpsError("invalid-argument", "Request data has unexpected fields.");
  }
  return record;
}

function readIdentity(request: { auth?: { uid: string; token: Record<string, unknown> } }): {
  uid: string | null;
  isGuest: boolean;
  migrationId?: string;
} {
  const auth = request.auth;
  if (!auth) return { uid: null, isGuest: false };
  const token = auth.token;
  const migrationId = typeof token.migrationId === "string" ? token.migrationId : undefined;
  const provider = (token.firebase as { sign_in_provider?: unknown } | undefined)?.sign_in_provider;
  return {
    uid: auth.uid,
    isGuest: provider === "anonymous" || (token.guestMigration === true && !!migrationId),
    migrationId,
  };
}

function rateWindowNext(state: RateState | undefined, now: number, maxCount: number, windowMs: number): RateState {
  const start = state?.windowStartedAt?.toMillis();
  if (start === undefined || now - start >= windowMs) return { windowStartedAt: Timestamp.fromMillis(now), count: 1 };
  if (!state || (state.count ?? 0) >= maxCount) throw new HttpsError("resource-exhausted", "Please wait before trying another transfer.");
  return { windowStartedAt: state.windowStartedAt, count: (state.count ?? 0) + 1 };
}

function firestoreStore(): GuestMigrationStore {
  const db = getFirestore();
  const grantCollection = db.collection("guestMigrations");
  const rateCollection = db.collection("guestMigrationRateLimits");

  return {
    async issueGrant(grant: GuestMigrationGrant, now: number): Promise<void> {
      const grantRef = grantCollection.doc(grant.transferId);
      const rateRef = rateCollection.doc(`issue_${createHash("sha256").update(grant.sourceUid).digest("hex")}`);
      const userRef = db.collection("users").doc(grant.sourceUid);
      await db.runTransaction(async (transaction) => {
        const [grantSnapshot, rateSnapshot, userSnapshot] = await Promise.all([
          transaction.get(grantRef),
          transaction.get(rateRef),
          transaction.get(userRef),
        ]);
        if (grantSnapshot.exists) throw new HttpsError("internal", "Could not create a transfer.");
        if (!userSnapshot.exists || userSnapshot.get("isAnonymous") !== true) {
          throw new HttpsError("permission-denied", "Only an existing guest profile can create a transfer.");
        }
        const cleanupLeaseExpiry = userSnapshot.get("guestCleanupLeaseExpiresAt");
        if (cleanupLeaseExpiry instanceof Timestamp && cleanupLeaseExpiry.toMillis() > now) {
          throw new HttpsError("failed-precondition", "This guest profile is being cleaned up. Try again shortly.");
        }
        const nextRate = rateWindowNext(rateSnapshot.data() as RateState | undefined, now, ISSUE_LIMIT, ISSUE_WINDOW_MS);
        transaction.create(grantRef, {
          ...grant,
          createdAt: Timestamp.fromMillis(grant.createdAt),
          codeExpiresAt: Timestamp.fromMillis(grant.expiresAt),
          expiresAt: Timestamp.fromMillis(grant.expiresAt),
        });
        transaction.set(rateRef, nextRate);
        transaction.update(userRef, {
          lastActive: Timestamp.fromMillis(now),
          ...(cleanupLeaseExpiry !== undefined && cleanupLeaseExpiry !== null
            ? { guestCleanupStartedAt: FieldValue.delete(), guestCleanupLeaseExpiresAt: FieldValue.delete(), guestCleanupId: FieldValue.delete() }
            : {}),
        });
      });
    },

    async consumeRedemptionAttempt(rateLimitKey: string, now: number): Promise<void> {
      const rateRef = rateCollection.doc(`redeem_${rateLimitKey}`);
      await db.runTransaction(async (transaction) => {
        const rateSnapshot = await transaction.get(rateRef);
        const nextRate = rateWindowNext(rateSnapshot.data() as RateState | undefined, now, REDEEM_LIMIT, REDEEM_WINDOW_MS);
        transaction.set(rateRef, nextRate);
      });
    },

    async lookupGrantForRedemption(codeDigest: string): Promise<GuestMigrationGrant> {
      const snapshot = await grantCollection.where("codeDigest", "==", codeDigest).limit(1).get();
      const data = snapshot.docs[0]?.data();
      if (!data || typeof data.transferId !== "string" || typeof data.sourceUid !== "string" ||
        typeof data.campaignId !== "string" || typeof data.sourceOrigin !== "string" ||
        typeof data.destinationOrigin !== "string" || typeof data.codeDigest !== "string" ||
        !(data.createdAt instanceof Timestamp) || !(data.codeExpiresAt instanceof Timestamp) ||
        !["issued", "claimed", "confirmed"].includes(data.status)) {
        throw new HttpsError("not-found", "This transfer link is not valid. Create a fresh link in the old app.");
      }
      return {
        transferId: data.transferId,
        codeDigest: data.codeDigest,
        sourceUid: data.sourceUid,
        campaignId: data.campaignId,
        sourceOrigin: data.sourceOrigin,
        destinationOrigin: data.destinationOrigin,
        createdAt: data.createdAt.toMillis(),
        expiresAt: data.codeExpiresAt.toMillis(),
        status: data.status,
      };
    },

    async claimGrant(codeDigest: string, now: number, campaignId: string, destinationOrigin: string): Promise<GuestMigrationGrant> {
      const grantQuery = grantCollection.where("codeDigest", "==", codeDigest).limit(1);
      return db.runTransaction(async (transaction) => {
        const grantSnapshot = await transaction.get(grantQuery);
        const grantDoc = grantSnapshot.docs[0];
        if (!grantDoc) throw new HttpsError("not-found", "This transfer link is not valid. Create a fresh link in the old app.");
        const grantRef = grantDoc.ref;
        const grantData = await transaction.get(grantRef);
        const data = grantData.data();
        if (!data) throw new HttpsError("not-found", "This transfer link is not valid. Create a fresh link in the old app.");
        if (typeof data.sourceUid !== "string" || !data.sourceUid || data.sourceUid.includes("/")) {
          throw new HttpsError("failed-precondition", "This transfer is not valid for the current campaign.");
        }
        const sourceUserRef = db.collection("users").doc(data.sourceUid);
        const sourceUserSnapshot = await transaction.get(sourceUserRef);
        const sourceCleanupLeaseExpiry = sourceUserSnapshot.get("guestCleanupLeaseExpiresAt");
        if (!sourceUserSnapshot.exists || sourceUserSnapshot.get("isAnonymous") !== true ||
          (sourceCleanupLeaseExpiry instanceof Timestamp && sourceCleanupLeaseExpiry.toMillis() > now)) {
          throw new HttpsError("permission-denied", "This guest account is no longer eligible for transfer.");
        }
        const codeExpiresAt = data.codeExpiresAt instanceof Timestamp
          ? data.codeExpiresAt.toMillis()
          : data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : Number.NaN;
        if (!Number.isFinite(codeExpiresAt) || codeExpiresAt <= now) {
          throw new HttpsError("deadline-exceeded", "This transfer link has expired. Create a fresh link in the old app.");
        }
        if (data.status !== "issued") {
          throw new HttpsError("failed-precondition", "This transfer link has already been used. Create a fresh link in the old app.");
        }
        if (data.campaignId !== campaignId || data.destinationOrigin !== destinationOrigin) {
          throw new HttpsError("failed-precondition", "This transfer is not valid for the current campaign.");
        }
        transaction.update(grantRef, {
          status: "claimed",
          claimedAt: Timestamp.fromMillis(now),
          expiresAt: Timestamp.fromMillis(now + CLAIMED_RECEIPT_TTL_MS),
        });
        return {
          transferId: String(data.transferId),
          codeDigest: String(data.codeDigest),
          sourceUid: String(data.sourceUid),
          campaignId: String(data.campaignId),
          sourceOrigin: String(data.sourceOrigin),
          destinationOrigin: String(data.destinationOrigin),
          createdAt: (data.createdAt as Timestamp).toMillis(),
          expiresAt: codeExpiresAt,
          status: "claimed",
          claimedAt: now,
        };
      });
    },

    async confirmGrant(transferId: string, uid: string, now: number): Promise<void> {
      const grantRef = grantCollection.doc(transferId);
      const userRef = db.collection("users").doc(uid);
      await db.runTransaction(async (transaction) => {
        const [grantSnapshot, userSnapshot] = await Promise.all([transaction.get(grantRef), transaction.get(userRef)]);
        const data = grantSnapshot.data();
        const cleanupLeaseExpiry = userSnapshot.get("guestCleanupLeaseExpiresAt");
        if (!data || data.sourceUid !== uid || (data.status !== "claimed" && data.status !== "confirmed") ||
          !userSnapshot.exists || userSnapshot.get("isAnonymous") !== true ||
          (cleanupLeaseExpiry instanceof Timestamp && cleanupLeaseExpiry.toMillis() > now)) {
          throw new HttpsError("permission-denied", "This transfer cannot be confirmed by this account.");
        }
        const receiptExpiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : Number.NaN;
        if (!Number.isFinite(receiptExpiresAt) || receiptExpiresAt <= now) {
          throw new HttpsError("deadline-exceeded", "This transfer confirmation window has ended. Create a fresh link in the old app.");
        }
        if (data.status === "claimed") {
          transaction.update(grantRef, {
            status: "confirmed",
            confirmedAt: Timestamp.fromMillis(now),
            expiresAt: Timestamp.fromMillis(now + CONFIRMED_RECEIPT_TTL_MS),
          });
        }
        transaction.update(userRef, {
          lastActive: Timestamp.fromMillis(now),
          ...(cleanupLeaseExpiry !== undefined && cleanupLeaseExpiry !== null
            ? { guestCleanupStartedAt: FieldValue.delete(), guestCleanupLeaseExpiresAt: FieldValue.delete(), guestCleanupId: FieldValue.delete() }
            : {}),
        });
      });
    },
  };
}

function dependencies() {
  const auth = getAuth();
  const db = getFirestore();
  return {
    store: firestoreStore(),
    createCustomToken: (uid: string, claims: Record<string, unknown>) => auth.createCustomToken(uid, claims),
    verifyGuestSource: async (uid: string) => {
      try {
        const [authUser, profile] = await Promise.all([
          auth.getUser(uid),
          db.collection("users").doc(uid).get(),
        ]);
        return authUser.providerData.length === 0 && profile.exists && profile.get("isAnonymous") === true;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") return false;
        throw error;
      }
    },
    now: () => Date.now(),
  };
}

export const createGuestMigration = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const data = requireOnlyKeys(request.data, ["campaignId", "destinationOrigin"]);
    return createGuestMigrationCore(
      { campaignId: data.campaignId, destinationOrigin: data.destinationOrigin },
      readIdentity(request),
      getActualOrigin(request),
      readConfig(),
      dependencies()
    );
  }
);

export const redeemGuestMigration = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const data = requireOnlyKeys(request.data, ["code"]);
    return redeemGuestMigrationCore(
      data.code,
      getActualOrigin(request),
      request.rawRequest.ip,
      readConfig(),
      dependencies()
    );
  }
);

export const confirmGuestMigration = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const data = requireOnlyKeys(request.data, ["transferId"]);
    return confirmGuestMigrationCore(
      data.transferId,
      readIdentity(request),
      getActualOrigin(request),
      readConfig(),
      dependencies()
    );
  }
);
