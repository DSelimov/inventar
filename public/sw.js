/*
 * Service worker на мобилния режим. Мрежата е първа; без връзка — кешираната страница /m и статичните
 * файлове на Next. API заявките не се кешират (синхронизацията сама опитва отново).
 */
const CACHE = "inventar-m-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/m"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
  if (isStatic) {
    // неизменими файлове: кеш първо
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => (res.ok && caches.open(CACHE).then((c) => c.put(req, res.clone())), res))));
    return;
  }
  if (req.mode === "navigate" && url.pathname === "/m") {
    event.respondWith(
      fetch(req)
        .then((res) => (res.ok && caches.open(CACHE).then((c) => c.put("/m", res.clone())), res))
        .catch(() => caches.match("/m")),
    );
  }
});
