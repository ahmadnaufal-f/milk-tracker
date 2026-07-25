import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

/**
 * Runs every Monday at 00:00 UTC.
 * Deletes anonymous users who have been inactive for 30+ days,
 * along with their sessions subcollection.
 */
export const cleanupAnonymousUsers = onSchedule("every monday 00:00", async () => {
  const db = getFirestore();
  const auth = getAuth();
  const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const snapshot = await db
    .collection("users")
    .where("isAnonymous", "==", true)
    .where("lastActive", "<=", cutoff)
    .get();

  for (const userDoc of snapshot.docs) {
    const uid = userDoc.id;

    // Delete subcollection users/{uid}/sessions before the parent doc
    const sessionRefs = await db
      .collection("users")
      .doc(uid)
      .collection("sessions")
      .listDocuments();

    const batch = db.batch();
    sessionRefs.forEach((ref) => batch.delete(ref));
    batch.delete(userDoc.ref);
    await batch.commit();

    // Delete the Auth account (may already be auto-deleted by Firebase after 30 days)
    try {
      await auth.deleteUser(uid);
    } catch {
      // Safe to ignore — account already gone
    }
  }
});
