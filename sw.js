// 서비스 워커: 앱 파일을 캐시해 오프라인에서도 열리게 한다.
// 파일을 고쳐 다시 배포할 때는 CACHE 이름의 숫자를 올린다.
const CACHE = 'lunch-notebook-v4';
const ASSETS = [
  './',
  'index.html',
  'app.css',
  'js/app.js',
  'js/store.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 온라인이면 최신 파일을 받아 캐시를 갱신하고, 느리거나 오프라인이면 캐시로 연다.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    // 브라우저의 10분짜리 임시 저장을 건너뛰고 서버에 새 파일이 있는지 매번 확인한다.
    const network = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });

    if (!cached) {
      try {
        return await network;
      } catch (err) {
        if (req.mode === 'navigate') {
          const shell = await cache.match('index.html');
          if (shell) return shell;
        }
        throw err;
      }
    }

    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
    const fresh = await Promise.race([network.catch(() => null), timeout]);
    return fresh && fresh.ok ? fresh : cached;
  })());
});
