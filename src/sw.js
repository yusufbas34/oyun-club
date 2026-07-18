import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Backend API — network only, never cache
registerRoute(
  ({ url }) => url.hostname === 'oyun-club-backend-production.up.railway.app',
  new NetworkOnly()
);

// Periodic Background Sync — daily reminder
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-reminder') {
    event.waitUntil(sendDailyReminder());
  }
});

async function sendDailyReminder() {
  const messages = [
    { title: '🎮 Bugün oynadın mı?', body: 'Günlük serinı koru! oyun.club\'da seni bekliyoruz.' },
    { title: '🔥 Seri devam ediyor!', body: 'Günlük hedefe ulaşmak için bir oyun oyna.' },
    { title: '⚡ Yeni meydan okuma!', body: 'Arkadaşların seni bekliyor. Hemen oyna!' },
    { title: '🏆 Sıralamanı yükselt!', body: 'Bugünkü XP\'ini kazan. oyun.club\'a gel.' },
    { title: '🎯 Günlük görevin var!', body: '3 farklı oyun oyna, bonus XP kazan!' },
  ];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  return self.registration.showNotification(msg.title, {
    body: msg.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'daily-reminder',
    renotify: false,
    data: { url: '/?source=notification' },
    actions: [
      { action: 'open', title: 'Oyna!' },
      { action: 'dismiss', title: 'Kapat' },
    ],
  });
}

// Push notifications from server
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'oyun.club', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'oyun.club', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || 'push',
      data: payload.data || {},
    })
  );
});

// Notification click — open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
