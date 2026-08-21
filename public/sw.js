// 방문 현장에서 신호가 없을 때를 위한 캐시.
//
// 화면을 그리는 데 필요한 파일(자바스크립트·CSS·글꼴)만 담아 둡니다.
// 어르신 개인정보가 담긴 페이지나 조회 결과는 담지 않습니다.
// 여러 직원이 함께 쓰는 기기에서 남의 어르신 기록이 남아 있으면 안 되기 때문입니다.

const CACHE = "osam-shell-v2";
const OFFLINE_URL = "/offline.html";

// 신호가 없어도 열려야 하는 화면.
// 신규 어르신 욕구사정은 서버에서 불러올 어르신 정보가 없어(빈 서식) 통째로 담아 둬도
// 개인정보가 남지 않습니다. 작성한 내용은 캐시가 아니라 별도 저장소에 들어갑니다.
const OFFLINE_PAGES = ["/assessment/offline"];

// 화면을 그리는 데 쓰는 정적 파일인지 판단합니다.
function isShellAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/offline.html"
  );
}

function isOfflinePage(url) {
  return OFFLINE_PAGES.includes(url.pathname.replace(/\/$/, ""));
}

// 받아 온 화면과 그 화면이 쓰는 파일까지 함께 담아 둡니다.
// 페이지 HTML만 담으면 자바스크립트가 없어 입력이 되지 않기 때문입니다.
async function cachePageWithAssets(path, response) {
  const cache = await caches.open(CACHE);
  await cache.put(path, response.clone());
  let html = "";
  try {
    html = await response.clone().text();
  } catch (e) {
    return;
  }
  const assets = new Set();
  const re = /"(\/_next\/static\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    assets.add(m[1].replace(/\u002F/g, "/"));
  }
  await Promise.all(
    Array.from(assets).map((href) =>
      cache.add(href).catch(() => {
        /* 한 파일이 없어도 나머지는 담습니다. */
      })
    )
  );
}

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.add(OFFLINE_URL).catch(() => {});
  for (const path of OFFLINE_PAGES) {
    try {
      const res = await fetch(path, { credentials: "same-origin" });
      // 로그인 화면으로 넘어간 응답을 담으면 안 되므로 실제 그 화면일 때만 담습니다.
      if (res.ok && !res.redirected) await cachePageWithAssets(path, res);
    } catch (e) {
      /* 설치 시점에 연결이 없으면 나중에 방문할 때 담깁니다. */
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

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

  if (request.mode !== "navigate") return;

  // 신규 어르신 작성 화면: 연결되면 최신본으로 갱신하고, 없으면 담아 둔 화면을 엽니다.
  if (isOfflinePage(url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected) {
            event.waitUntil(cachePageWithAssets(url.pathname, res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(url.pathname)
            .then((hit) => hit || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // 그 밖의 페이지 이동: 항상 서버에서 받아오되, 연결이 없으면 안내 화면을 보여 줍니다.
  // 개인정보가 담긴 페이지는 캐시하지 않습니다.
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});
