// Studio service worker — minimal by design.
//
// The Studio is a *live* dashboard: an offline snapshot is worse than useless — it
// shows yesterday's state and a dead WebSocket. So this worker caches NONE of the
// app; every request goes to the network. It exists only to (a) make the Studio
// installable to the home screen (the install criteria want a fetch handler), and
// (b) hand a navigation a clean "you're offline" page — never a stale real page —
// when the network is genuinely gone.
//
// On activate it deletes every other cache, so an old worker's cached shell can't
// strand anyone on a stale view. skipWaiting + clients.claim make a new version take
// over immediately on the next load.

const SHELL = "studio-shell-v1";
const OFFLINE_URL = "/studio-offline.html";

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then(c => c.add(OFFLINE_URL)));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  // Only intervene on top-level navigations. Try the live network first; fall back to
  // the offline page ONLY when the fetch truly fails (no network). A 401/redirect to
  // /login is a *successful* response and passes straight through, so login works.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE_URL)));
  }
  // Everything else (JS modules, icons, voice API, the WS handshake): left untouched,
  // so the browser does its default network fetch and nothing of the app is cached.
});
