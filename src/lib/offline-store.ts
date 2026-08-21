"use client";

// 방문 현장은 신호가 약하거나 없는 경우가 많습니다.
// 작성 중인 내용을 기기에 계속 저장해 두고, 저장이 실패하면 대기열에 넣었다가
// 연결이 돌아왔을 때 자동으로 보냅니다. 어르신 댁에서 한참 작성한 내용이
// 통신 문제로 사라지는 일이 없도록 하기 위한 것입니다.
//
// 브라우저 localStorage 를 씁니다. 한 건이 수십 KB 수준이라 용량은 충분하고,
// 앱을 껐다 켜도 남아 있습니다.

const DRAFT_PREFIX = "osam.draft.";
const QUEUE_KEY = "osam.queue";

export type QueuedSave = {
  id: string;
  /** 기존 기록 수정이면 그 id, 새 기록이면 null */
  assessmentId: string | null;
  recipientId: string;
  recipientName: string;
  payload: unknown;
  queuedAt: string;
  lastError: string | null;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function available(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

/* ── 작성 중 임시 저장 ─────────────────────────────────────── */

export function draftKey(recipientId: string, assessmentId?: string | null) {
  return `${DRAFT_PREFIX}${recipientId}.${assessmentId ?? "new"}`;
}

export function saveDraft(key: string, value: unknown) {
  if (!available()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ value, savedAt: new Date().toISOString() }));
  } catch {
    // 저장 공간이 가득 찼거나 사생활 보호 모드인 경우. 화면 동작은 막지 않습니다.
  }
}

export function loadDraft<T>(key: string): { value: T; savedAt: string } | null {
  if (!available()) return null;
  return safeParse<{ value: T; savedAt: string } | null>(window.localStorage.getItem(key), null);
}

export function clearDraft(key: string) {
  if (!available()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 무시 */
  }
}

/* ── 전송 대기열 ───────────────────────────────────────────── */

export function readQueue(): QueuedSave[] {
  if (!available()) return [];
  return safeParse<QueuedSave[]>(window.localStorage.getItem(QUEUE_KEY), []);
}

function writeQueue(items: QueuedSave[]) {
  if (!available()) return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* 무시 */
  }
}

export function enqueueSave(item: Omit<QueuedSave, "id" | "queuedAt" | "lastError">): QueuedSave {
  const queued: QueuedSave = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
    lastError: null,
  };
  const items = readQueue();
  // 같은 기록을 여러 번 저장했다면 마지막 내용만 보내면 됩니다.
  const rest = items.filter(
    (q) => !(q.recipientId === item.recipientId && q.assessmentId === item.assessmentId)
  );
  writeQueue([...rest, queued]);
  return queued;
}

export function removeFromQueue(id: string) {
  writeQueue(readQueue().filter((q) => q.id !== id));
}

function markQueueError(id: string, message: string) {
  writeQueue(readQueue().map((q) => (q.id === id ? { ...q, lastError: message } : q)));
}

export type FlushResult = { sent: number; failed: number; remaining: number };

/** 대기 중인 저장을 서버로 보냅니다. 실패한 건은 대기열에 남겨 둡니다. */
export async function flushQueue(): Promise<FlushResult> {
  const items = readQueue();
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const res = item.assessmentId
        ? await fetch(`/api/assessment/assessments/${item.assessmentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
          })
        : await fetch("/api/assessment/assessments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
          });

      if (res.ok) {
        removeFromQueue(item.id);
        clearDraft(draftKey(item.recipientId, item.assessmentId));
        sent++;
      } else {
        const json = await res.json().catch(() => ({}));
        // 서버가 거절한 내용(권한 없음 등)은 다시 보내도 같으므로 이유를 남깁니다.
        markQueueError(item.id, json.error || `서버 오류 (${res.status})`);
        failed++;
      }
    } catch (e) {
      // 아직 연결이 안 된 상태. 다음 기회에 다시 시도합니다.
      markQueueError(item.id, e instanceof Error ? e.message : "연결할 수 없습니다");
      failed++;
    }
  }

  return { sent, failed, remaining: readQueue().length };
}
