/**
 * sw.js — Service Worker
 *
 * 策略：
 *   - 导航请求：网络优先，失败回退缓存（保证离线还能打开壳）
 *   - /vendor/ 与 /css/、/js/：缓存优先（带版本号，改了文件名就自动更新）
 *   - /api/*：从不缓存（数据必须实时）
 *   - 静态图片/图标：缓存优先 + 后台更新
 */

const CACHE = 'kayhs-v3';
const PRECACHE = [
  '/',
  '/css/base.css',
  '/css/components.css',
  '/js/core.js',
  '/js/app.js',
  '/js/views/home.js',
  '/js/views/drive.js',
  '/js/views/tools.js',
  '/js/views/collections.js',
  '/js/views/blog.js',
  '/js/views/settings.js',
  '/favicon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // API 与短链跳转绝不缓存
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/s/') || url.pathname.startsWith('/f/') || url.pathname === '/feed.xml') return;

  // 导航请求：网络优先，离线回退到壳
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  // 其余静态资源：缓存优先 + 后台更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
