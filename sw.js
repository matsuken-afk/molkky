/**
 * sw.js — Service Worker
 * Cache-first 戦略でオフライン動作を実現する
 */

const CACHE_NAME = 'molkky-v1';

// キャッシュ対象ファイル
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './gameLogic.js',
  './manifest.json',
];

// ── インストール：事前キャッシュ ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // 即座にアクティブ化
  );
});

// ── アクティベート：古いキャッシュ削除 ───────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // 既存クライアントを即掌握
  );
});

// ── フェッチ：Cache-first ─────────────────────────────
self.addEventListener('fetch', event => {
  // GET リクエストのみ対象
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached; // キャッシュヒット

        // キャッシュなし → ネットワーク取得 & キャッシュ更新
        return fetch(event.request)
          .then(response => {
            // 正常なレスポンスのみキャッシュ
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const toCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, toCache));
            return response;
          })
          .catch(() => {
            // オフライン時：index.html をフォールバック
            return caches.match('./index.html');
          });
      })
  );
});
