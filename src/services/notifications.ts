import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

let messaging: ReturnType<typeof getMessaging> | null = null;

/**
 * Initialize Firebase Cloud Messaging
 */
export const initializeMessaging = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
        console.log("This browser does not support notifications");
        return null;
    }

    try {
        const { getMessaging } = await import("firebase/messaging");
        const { app } = await import("../firebase");
        messaging = getMessaging(app);
        return messaging;
    } catch (error) {
        console.error("Failed to initialize messaging:", error);
        return null;
    }
};

/**
 * Request notification permission from the user
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
    if (!("Notification" in window)) {
        console.log("This browser does not support notifications");
        return "denied";
    }

    const permission = await Notification.requestPermission();
    console.log("Notification permission:", permission);
    return permission;
};

/**
 * Get FCM token for the current device.
 * Manually registers the service worker and passes it to getToken() to avoid
 * Firebase's built-in 10-second auto-registration timeout.
 */
export const getFCMToken = async (vapidKey: string): Promise<string | null> => {
    if (!messaging) {
        await initializeMessaging();
    }

    if (!messaging) {
        console.error("Messaging not initialized");
        return null;
    }

    if (!("serviceWorker" in navigator)) {
        console.error("Service workers are not supported in this browser");
        return null;
    }

    try {
        // Register the SW (idempotent — returns existing registration if already registered).
        await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });

        // navigator.serviceWorker.ready resolves only when a SW is fully *activated* in
        // this scope. This is critical: register() returns while the SW is still
        // "installing", and PushManager refuses to subscribe until it reaches "activated".
        const swRegistration = await navigator.serviceWorker.ready;

        const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
        console.log("FCM Token:", token);
        return token;
    } catch (error) {
        console.error("Failed to get FCM token:", error);
        return null;
    }
};

/**
 * Save FCM token to Firestore for the user
 */
export const saveFCMToken = async (userId: string, token: string): Promise<void> => {
    try {
        await setDoc(
            doc(db, "users", userId),
            { fcmToken: token },
            { merge: true }
        );
        console.log("FCM token saved for user:", userId);
    } catch (error) {
        console.error("Failed to save FCM token:", error);
        throw error;
    }
};

/**
 * Setup foreground message handler
 */
export const onForegroundMessage = (callback: (payload: any) => void) => {
    if (!messaging) {
        console.error("Messaging not initialized");
        return () => { };
    }

    return onMessage(messaging, (payload) => {
        console.log("Foreground message received:", payload);
        callback(payload);
    });
};

/**
 * Request permission and save token (convenience function)
 */
export const setupPushNotifications = async (userId: string, vapidKey: string): Promise<boolean> => {
    try {
        const permission = await requestNotificationPermission();
        if (permission !== "granted") {
            console.log("Notification permission not granted");
            return false;
        }

        const token = await getFCMToken(vapidKey);
        if (!token) {
            console.error("Failed to get FCM token");
            return false;
        }

        await saveFCMToken(userId, token);
        return true;
    } catch (error) {
        console.error("Failed to setup push notifications:", error);
        return false;
    }
};
