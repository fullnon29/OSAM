// 방문 현장에서 신호가 없을 때를 위한 캐시.
//
// 화면을 그리는 데 필요한 파일(자바스크립트·CSS·글꼴)만 담아 둡니다.
// 어르신 개인정보가 담긴 페이지나 조회 결과는 담지 않습니다.
// 여러 직원이 함께 쓰는 기기에서 남의 어르신 기록이 남아 있으면 안 되기 때문입니다.

const CACHE = "osam-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 화면을 그리는 데 쓰는 정적 파일인지 판단합니다.
function isShellAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/offline.html"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 정적 파일: 캐시에 있으면 바로 주고, 없으면 받아서 담아 둡니다.
  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  // 페이지 이동: 항상 서버에서 받아오되, 연결이 없으면 안내 화면을 보여 줍니다.
  // 개인정보가 담긴 페이지는 캐시하지 않습니다.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
