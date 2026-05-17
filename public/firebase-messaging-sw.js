// Firebase Cloud Messaging Service Worker
// This handles background push notifications

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
// Note: Firebase config is intentionally hardcoded here because service workers
// run in an isolated context with no access to Vite's import.meta.env or any
// runtime-injected globals. These are public client-side identifiers, not secrets.
firebase.initializeApp({
    apiKey: "AIzaSyBp-SvbZVQp_pyRGP1G6qZXsppKfbWLJRQ",
    authDomain: "track-milk-pump.firebaseapp.com",
    projectId: "track-milk-pump",
    storageBucket: "track-milk-pump.firebasestorage.app",
    messagingSenderId: "943832676310",
    appId: "1:943832676310:web:443266a7f502cfabe05677",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);

    const notificationTitle = payload.notification?.title || 'Milk Pump Tracker';
    const notificationOptions = {
        body: payload.notification?.body || 'Time to pump!',
        icon: '/milk-100.webp',
        badge: '/milk-100.webp',
        tag: 'pump-reminder',
        requireInteraction: true,
        actions: [
            { action: 'open', title: 'Open App' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification click:', event.action);
    event.notification.close();

    const urlToOpen = 'https://pump.a-naufal.dev/';

    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                // Check if the app is already open
                for (const client of clientList) {
                    if (client.url.includes('pump.a-naufal.dev') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If not open, open a new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
        );
    }
});
