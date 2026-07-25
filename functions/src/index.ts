import * as admin from "firebase-admin";
// [DISABLED] import { createReminderWhenNewSessionIsSaved } from "./create-reminder";
// [DISABLED] import { sendDueNotifications } from "./send-notifications";
import { generateAiSummary, answerAiFollowUp } from "./ai-summarizer";
import { cleanupAnonymousUsers } from "./cleanup-anonymous-users";

// Initialize Firebase Admin (only once)
admin.initializeApp();

// Export all functions
export {
  // [DISABLED] createReminderWhenNewSessionIsSaved,
  // [DISABLED] sendDueNotifications,
  generateAiSummary,
  answerAiFollowUp,
  cleanupAnonymousUsers,
};
