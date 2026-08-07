import "server-only";
import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";

const LIST_URL =
  "https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do?mode=list";
const BASE_URL = "https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do";
const UA = "Mozilla/5.0 (compatible; OsamNewsBot/1.0)";

// 어르신 재가/장기요양 돌봄 센터와 관련 있는 보도자료만 골라옵니다.
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

export type NhisArticle = {
  articleNo: string;
  title: string;
  dept: string;
  date: string; // YYYY.MM.DD
  pdfAttachNo: string | null;
  sourceUrl: string;
};

export async function fetchRelevantNhisArticles(): Promise<NhisArticle[]> {
  const res = await fetch(LIST_URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`NHIS 목록 조회 실패: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const articles: NhisArticle[] = [];

  $("tr").each((_, tr) => {
    const $tr = $(tr);
    const titleLink = $tr.find("td.a-l a.a-link");
    if (!titleLink.length) return;

    const href = titleLink.attr("href") || "";
    const articleNo = href.match(/articleNo=(\d+)/)?.[1];
    if (!articleNo) return;

    const title = titleLink.text().trim();
    const tds = $tr.find("> td");
    const dept = $(tds[2]).text().trim();
    const date = $(tds[3]).text().trim();

    const pdfHref = $tr.find("a.file-down-btn.pdf").attr("href") || "";
    const pdfAttachNo = pdfHref.match(/attachNo=(\d+)/)?.[1] ?? null;

    articles.push({
      articleNo,
      title,
      dept,
      date,
      pdfAttachNo,
      sourceUrl: `${BASE_URL}?mode=view&articleNo=${articleNo}`,
    });
  });

  return articles.filter((a) =>
    RELEVANT_KEYWORDS.some((kw) => a.title.includes(kw))
  );
}

function cleanExtractedText(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^-\s*\d+\s*-$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractArticleBody(
  articleNo: string,
  pdfAttachNo: string
): Promise<string | null> {
  const url = `${BASE_URL}?mode=download&articleNo=${articleNo}&attachNo=${pdfAttachNo}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;

  const buf = new Uint8Array(await res.arrayBuffer());
  try {
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = cleanExtractedText(text);
    return cleaned || null;
  } catch (err) {
    console.error("PDF 텍스트 추출 실패", articleNo, err);
    return null;
  }
}

export function estimateReadMinutes(text: string) {
  // 한국어 성인 평균 분당 500자 내외로 어림잡습니다.
  return Math.max(1, Math.round(text.length / 500));
}
