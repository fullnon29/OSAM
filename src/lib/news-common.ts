import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { extractHwpText } from "./documents/extract-text";

// 소식 자동 수집에서 여러 기관이 함께 쓰는 것들.
//
// 공단·복지부가 낸 글만 가져옵니다. 둘 다 공공저작물이라 그대로 실어도 됩니다.
// 민간 업체 게시판은 저작권이 글쓴이에게 있고 약관이 가공·상업적 사용을 막고 있어
// 쓰지 않습니다. 그런 곳에 올라오는 자료도 원본은 거의 여기 두 곳에 있습니다.

export const UA = "Mozilla/5.0 (compatible; OsamNewsBot/1.0)";

/** 이 날짜보다 오래된 글은 가져오지 않습니다. 처음 돌릴 때 몇 해치가 쏟아지지 않게 합니다. */
export const SINCE = "2026-09-01";

/** 한 번에 새로 들일 수 있는 글 수. 첫 수집 때 제한 시간(60초)을 넘기지 않게 끊습니다. */
export const MAX_PER_RUN = 8;

/** 어르신 재가·장기요양과 관련 있는 글만 고릅니다. */
const RELEVANT_KEYWORDS = [
  "장기요양",
  "요양보호사",
  "어르신",
  "노인",
  "방문요양",
  "재가급여",
  "치매",
  "돌봄",
];

export function isRelevant(title: string) {
  return RELEVANT_KEYWORDS.some((kw) => title.includes(kw));
}

/** 기관마다 목록 생김새가 달라, route 가 쓰기 좋게 이 모양으로 맞춰 돌려줍니다. */
export type NewsArticle = {
  source: "nhis" | "mohw" | "ltc";
  sourceId: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  sourceUrl: string;
  /** 본문은 새 글일 때만 받아옵니다. 이미 있는 글까지 내려받으면 느립니다. */
  loadBody: () => Promise<LoadedBody>;
};

/**
 * 상세 쪽을 받아 보고 알게 된 것.
 *
 * 복지부는 목록 제목이 뒤가 잘려 있어 상세에서 온전한 제목을 가져옵니다.
 * 그래서 본문과 제목을 함께 돌려줍니다.
 */
export type LoadedBody = { body: string | null; title?: string };

export async function getHtml(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} 조회 실패: ${res.status}`);
  return res.text();
}

export function cleanExtractedText(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    // 쪽 번호(- 3 -)만 있는 줄은 버립니다.
    .filter((line) => line && !/^-\s*\d+\s*-$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 붙임 PDF 에서 글을 꺼냅니다. 공단·복지부 보도자료는 본문이 PDF 안에만 있습니다. */
export async function pdfText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return cleanExtractedText(text) || null;
  } catch (err) {
    console.error("PDF 글 꺼내기 실패", url, err);
    return null;
  }
}

/**
 * 붙임 hwp 에서 글을 꺼냅니다.
 *
 * 공단 법령자료실은 pdf 없이 hwp 만 올리는 글이 많습니다.
 * 서류 읽기에 쓰던 것을 그대로 씁니다(hwp 5.0 / CFB).
 */
export async function hwpText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return cleanExtractedText(extractHwpText(buf).text) || null;
  } catch (err) {
    console.error("hwp 글 꺼내기 실패", url, err);
    return null;
  }
}

/**
 * 글 하나가 지나치게 길어지지 않게 자릅니다.
 *
 * 고시 전문에는 품목표·지역 목록이 통째로 들어 있어 수만 자가 되기도 합니다.
 * 읽는 분께는 앞부분이면 충분하고, 전체는 원문 링크로 보시면 됩니다.
 */
export const MAX_CONTENT = 20000;

export function capContent(text: string, sourceUrl: string) {
  if (text.length <= MAX_CONTENT) return text;
  return `${text.slice(0, MAX_CONTENT).trimEnd()}

…(이하 줄임) 전체 내용은 원문을 참고해 주세요: ${sourceUrl}`;
}

export function estimateReadMinutes(text: string) {
  // 한국어 성인 평균 분당 500자 내외로 어림잡습니다.
  return Math.max(1, Math.round(text.length / 500));
}

/** "2026.10.02" · "2026-10-02" · "2026/10/02" 를 모두 YYYY-MM-DD 로 맞춥니다. */
export function normalizeDate(raw: string): string | null {
  const m = raw.trim().match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** 글 날짜를 한국 시각 오전 9시로 봅니다. 날짜만 있는 글이라 시각은 정해 줘야 합니다. */
export function toIso(date: string) {
  return new Date(`${date}T09:00:00+09:00`).toISOString();
}
