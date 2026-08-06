// 대한민국은 연중 UTC+9 고정(서머타임 없음)이므로 고정 오프셋으로 변환합니다.
const KST_OFFSET = "+09:00";

function kstParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function formatKst(iso: string) {
  const { year, month, day, hour, minute } = kstParts(iso);
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

// datetime-local <input>에 채워 넣을 "YYYY-MM-DDTHH:mm" (KST 기준) 값
export function toKstInputValue(iso: string) {
  const { year, month, day, hour, minute } = kstParts(iso);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

// datetime-local <input>이 돌려주는 "YYYY-MM-DDTHH:mm" (KST 기준 사용자가 입력한 값) -> UTC ISO 문자열
export function kstInputValueToIso(value: string) {
  return new Date(`${value}:00${KST_OFFSET}`).toISOString();
}
