"use client";

import { useCallback, useEffect, useState } from "react";
import { flushQueue, readQueue } from "@/lib/offline-store";

/**
 * 기기에 남아 있는 전송 대기 기록을 신호가 잡히는 대로 보냅니다.
 *
 * 방문 현장에서 저장한 내용을 사무실에 돌아와 어느 화면을 열든 자동으로
 * 보내기 위해, 앱 전체에 얹어 둡니다. 대기 중인 기록이 없으면 아무것도
 * 보이지 않습니다.
 */
export default function PendingUploads() {
  const [pending, setPending] = useState(0);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const flush = useCallback(async () => {
    if (readQueue().length === 0) {
      setPending(0);
      return;
    }
    setSending(true);
    const result = await flushQueue();
    setSending(false);
    setPending(result.remaining);
    if (result.sent > 0) {
      setNote(`${result.sent}건을 전송했습니다.`);
      window.setTimeout(() => setNote(null), 6000);
    }
  }, []);

  useEffect(() => {
    // 화면이 다 그려진 뒤에 확인합니다. 대기열은 기기 저장소에 있어
    // 서버 렌더링 때는 읽을 수 없습니다.
    const timer = window.setTimeout(() => void flush(), 0);
    window.addEventListener("online", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", flush);
    };
  }, [flush]);

  if (pending === 0 && !note) return null;

  return (
    <div className="pending-uploads">
      {note ? (
        <span>{note}</span>
      ) : (
        <>
          <span>전송 대기 {pending}건</span>
          <button type="button" onClick={() => void flush()} disabled={sending}>
            {sending ? "전송 중…" : "지금 보내기"}
          </button>
        </>
      )}
    </div>
  );
}
