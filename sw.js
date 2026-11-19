// Service worker: deixa o app abrir rápido e offline; nunca guarda dados do Google/Outlook.
const VERSION = 'agenda-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/bridge.js',
  'js/conflicts.js',
  'js/data.js',
  'js/dates.js',
  'js/demo.js',
  'js/google.js',
  'js/notify.js',
  'js/outlook.js',
  'js/store.js',
  'js/ui.js',
  'js/vendor/ical.min.js',
  'js/views/forms.js',
  'js/views/list.js',
  'js/views/month.js',
  'js/views/settings.js',
  'js/views/tasks.js',
  'js/views/timeline.js',
  'js/views/today.js',
  'icons/icon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Rede primeiro (sempre a versão mais nova), cache como reserva offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !url.search) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./#/hoje');
    }),
  );
});
