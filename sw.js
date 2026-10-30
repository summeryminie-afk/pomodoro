const CACHE = 'focusflash-v5';
const ASSETS = ['/', '/index.html', '/icon.svg', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 페이지(HTML)는 네트워크 우선: 새 배포가 한 번에 반영되고, 오프라인이면 캐시로 대체
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put('/index.html', copy)));
        }
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 아이콘, 매니페스트 등 나머지는 캐시 우선
  e.respondWith(
    caches.match(req).then(r => r || fetch(req))
  );
});

// 페이지에서 postMessage로 알림 요청 수신
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'SHOW_NOTIFICATION') return;
  e.waitUntil(
    self.registration.showNotification(e.data.title, {
      ...e.data.options,
      icon: '/icon.svg',
      badge: '/icon.svg',
    })
  );
});

// 알림 클릭 시 PWA 창으로 포커스
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});
