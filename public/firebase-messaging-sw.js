// Firebase Cloud Messaging Service Worker
// This handles background push notifications

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
    apiKey: self.__FIREBASE_CONFIG__.apiKey,
    authDomain: self.__FIREBASE_CONFIG__.authDomain,
    projectId: self.__FIREBASE_CONFIG__.projectId,
    storageBucket: self.__FIREBASE_CONFIG__.storageBucket,
    messagingSenderId: self.__FIREBASE_CONFIG__.messagingSenderId,
    appId: self.__FIREBASE_CONFIG__.appId,
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
