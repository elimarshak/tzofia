// OPENEYE service worker: shows the phone alerts the server sends (Web Push) and opens the site when one is tapped.
// It does not cache anything.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'OPENEYE', {
    body: d.body || '', tag: d.tag || undefined, icon: 'icon-192.png', dir: 'auto', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const url = e.notification.data && e.notification.data.url ? e.notification.data.url : './';
    for (const w of wins) if ('focus' in w) return ('navigate' in w ? w.navigate(url) : Promise.resolve()).then(() => w.focus());
    return self.clients.openWindow(url);
  }));
});
