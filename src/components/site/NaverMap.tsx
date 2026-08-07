"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

type NaverMaps = {
  maps: {
    LatLng: new (lat: number, lng: number) => unknown;
    Map: new (el: HTMLElement, options: { center: unknown; zoom: number }) => unknown;
    Marker: new (options: { position: unknown; map: unknown }) => unknown;
  };
};

declare global {
  interface Window {
    naver: NaverMaps;
  }
}

const LAT = 35.1733891;
const LNG = 129.09475;
const CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;

export default function NaverMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded || !mapRef.current || !window.naver) return;
    const center = new window.naver.maps.LatLng(LAT, LNG);
    const map = new window.naver.maps.Map(mapRef.current, {
      center,
      zoom: 16,
    });
    new window.naver.maps.Marker({ position: center, map });
  }, [loaded]);

  if (!CLIENT_ID) {
    return (
      <div className="map-box">
        지도 영역 (네이버 지도 API 키 설정 필요)
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`}
        onLoad={() => setLoaded(true)}
        strategy="afterInteractive"
      />
      <div
        ref={mapRef}
        className="map-box"
        style={{
          padding: 0,
          background: "var(--paper-deep)",
        }}
      />
    </>
  );
}
