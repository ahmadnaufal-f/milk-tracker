import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

interface PumpingSession {
  volume: number;
  duration: number;
  startedAt: string;
  createdAt: admin.firestore.Timestamp;
}

interface UserSettings {
  targetVolume?: string;
  targetDuration?: string;
  reminderHours?: string;
}

/**
 * Cloud Function triggered when a new pumping session is saved.
 * Creates a reminder document that will be picked up by the scheduled function.
 */
export const createReminderWhenNewSessionIsSaved = onDocumentCreated(
  {
    document: "users/{userId}/sessions/{sessionId}",
    region: "asia-southeast1",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("No data associated with the event");
      return;
    }

    const sessionData = snapshot.data() as PumpingSession;
    const userId = event.params.userId;
    const sessionId = event.params.sessionId;

    console.log(`New session created for user ${userId}:`, {
      sessionId,
      volume: sessionData.volume,
      duration: sessionData.duration,
      startedAt: sessionData.startedAt,
    });

    // Fetch user settings to get reminderHours
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    const userSettings = userDoc.data() as UserSettings | undefined;
    const reminderHours = parseInt(userSettings?.reminderHours || "4", 10);

    // Invalidate any pending (unsent) reminders since user has started a new session
    const pendingReminders = await admin.firestore()
      .collection("users")
      .doc(userId)
      .collection("reminders")
      .where("sent", "==", false)
      .get();

    if (!pendingReminders.empty) {
      const batch = admin.firestore().batch();
      pendingReminders.docs.forEach((doc) => {
        batch.update(doc.ref, {
          sent: true,
          invalidated: true,
          invalidatedAt: admin.firestore.FieldValue.serverTimestamp(),
          invalidatedReason: "User started new session before reminder was sent"
        });
      });
      await batch.commit();
      console.log(`Invalidated ${pendingReminders.size} pending reminder(s) for user ${userId}`);
    }

    // Calculate reminder time based on user's setting (from when session is saved, not started)
    const reminderTime = new Date();
    reminderTime.setHours(reminderTime.getHours() + reminderHours);

    // Create a reminder document
    const reminderRef = await admin.firestore()
      .collection("users")
      .doc(userId)
      .collection("reminders")
      .add({
        sessionId,
        scheduledFor: reminderTime.toISOString(),
        message: `Time to pump again! Your last session was at ${new Date().toLocaleString()}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sent: false,
      });

    console.log(`Reminder created: ${reminderRef.id} for user ${userId}, scheduled for ${reminderTime.toISOString()} (${reminderHours} hours after session)`);
  }
);
