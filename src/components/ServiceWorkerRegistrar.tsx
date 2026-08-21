"use client";

import { useEffect } from "react";

// 방문 현장에서 신호가 없을 때 흰 화면 대신 안내가 뜨도록,
// 화면을 그리는 데 필요한 파일을 미리 받아 둡니다.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // 개발 중에는 캐시가 수정 사항을 가려 혼란스러우므로 켜지 않습니다.
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 등록에 실패해도 앱 사용에는 지장이 없습니다.
    });
  }, []);
  return null;
}
