// Shared FCM handlers imported by the Workbox worker and legacy entrypoint.
// Handle clicks before the Firebase SDK registers its own listener.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.stopImmediatePropagation();
    if (event.action === 'dismiss') return;
    const candidate = event.notification.data?.link
        || event.notification.data?.FCM_MSG?.fcmOptions?.link;
    let url = new URL('/', self.location.origin);
    try {
        const requested = new URL(candidate || '/', self.location.origin);
        if (requested.origin === self.location.origin) url = requested;
    } catch { /* Fall back to this installation's app. */ }
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
        for (const client of windows) {
            if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
                if ('navigate' in client) await client.navigate(url.href);
                return client.focus();
            }
        }
        return self.clients.openWindow?.(url.href);
    }));
});

try {
    importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');
firebase.initializeApp({
    apiKey: "AIzaSyBp-SvbZVQp_pyRGP1G6qZXsppKfbWLJRQ",
    authDomain: "track-milk-pump.firebaseapp.com",
    projectId: "track-milk-pump",
    storageBucket: "track-milk-pump.firebasestorage.app",
    messagingSenderId: "943832676310",
    appId: "1:943832676310:web:443266a7f502cfabe05677",
});


    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
        // Firebase displays notification payloads itself; avoid duplicate reminders.
        if (payload.notification) return;
        return self.registration.showNotification(payload.data?.title || 'Milk Pump Tracker', {
            body: payload.data?.body || 'Your pumping reminder is ready.',
            icon: '/milk-100.webp',
            badge: '/milk-100.webp',
            tag: 'pump-reminder',
            data: { link: payload.data?.link || '/' },
            actions: [{ action: 'open', title: 'Open app' }, { action: 'dismiss', title: 'Dismiss' }],
        });
    });
} catch {
    // Offline caching must remain available when push libraries cannot be loaded.
}
