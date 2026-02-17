import * as admin from "firebase-admin";
import { createReminderWhenNewSessionIsSaved } from "./create-reminder";
import { sendDueNotifications } from "./send-notifications";

// Initialize Firebase Admin (only once)
admin.initializeApp();

// Export all functions
export {
  createReminderWhenNewSessionIsSaved,
  sendDueNotifications
};
