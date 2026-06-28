import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineString } from "firebase-functions/params";
import * as admin from "firebase-admin";

const appUrl = defineString("APP_URL");

/**
 * Scheduled function that runs every 5 minutes to send due notifications.
 * Checks all reminders where scheduledFor <= now and sent = false.
 */
export const sendDueNotifications = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "asia-southeast1",
    timeoutSeconds: 60,
  },
  async () => {
    const now = new Date().toISOString();
    console.log(`Checking for due reminders at ${now}`);

    // Get all users
    const usersSnapshot = await admin.firestore().collection("users").get();

    let totalSent = 0;
    let totalErrors = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const fcmToken = userData?.fcmToken;

      // Get due reminders for this user
      const remindersSnapshot = await admin.firestore()
        .collection("users")
        .doc(userId)
        .collection("reminders")
        .where("scheduledFor", "<=", now)
        .where("sent", "==", false)
        .get();

      if (remindersSnapshot.empty) {
        continue;
      }

      console.log(`Found ${remindersSnapshot.size} due reminders for user ${userId}`);

      for (const reminderDoc of remindersSnapshot.docs) {
        const reminder = reminderDoc.data();

        if (!fcmToken) {
          console.log(`No FCM token for user ${userId}, marking reminder as sent`);
          await reminderDoc.ref.update({
            sent: true,
            error: "No FCM token",
            processedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          continue;
        }

        try {
          // Send the notification
          await admin.messaging().send({
            token: fcmToken,
            notification: {
              title: "🍼 Time to Pump!",
              body: reminder.message,
            },
            webpush: {
              notification: {
                icon: "/milk-100.webp",
                badge: "/milk-100.webp",
                requireInteraction: true,
              },
              fcmOptions: {
                link: appUrl.value(),
              },
            },
          });

          // Mark as sent
          await reminderDoc.ref.update({
            sent: true,
            sentAt: admin.firestore.FieldValue.serverTimestamp()
          });

          totalSent++;
          console.log(`Notification sent to user ${userId} for reminder ${reminderDoc.id}`);
        } catch (error) {
          totalErrors++;
          console.error(`Failed to send notification to user ${userId}:`, error);

          // Mark with error but don't retry indefinitely
          await reminderDoc.ref.update({
            sent: true,
            error: String(error),
            processedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }

    console.log(`Finished processing. Sent: ${totalSent}, Errors: ${totalErrors}`);
  }
);
