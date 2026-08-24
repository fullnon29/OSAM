// 과거 욕구사정 서류에서 '서술형 문장'만 골라냅니다.
//
// 체크박스는 서식이 해마다 바뀌어 AI 없이 읽기 어렵지만, 서술 부분은
// "판단근거 및 종합의견", "총평" 같은 표현이 해마다 그대로 쓰이고 있어
// 규칙만으로 잘라낼 수 있습니다. 비용이 들지 않고 결과가 늘 같습니다.
//
// 이렇게 모은 문장이 우리 센터의 글투 자료가 됩니다. 새 기록을 쓸 때
// 이 글투를 따라가도록 해서, 어느 어르신의 기록이든 같은 형식으로 나옵니다.

/** 우리 서식 영역에 대응하는 갈래. 공단 세부내용 8개 항목과 맞춰 두었습니다. */
export type NarrativeSection =
  | "신체상태"
  | "질병상태"
  | "인지상태"
  | "의사소통"
  | "영양상태"
  | "가족환경"
  | "주관적욕구"
  | "자원이용"
  | "총평";

export type Narrative = {
  section: NarrativeSection;
  /** 서류에 적혀 있던 원래 항목 제목 (어느 자리에서 나왔는지 되짚기 위함) */
  heading: string;
  text: string;
};

/** 서술이 시작되는 표현. 긴 것부터 찾아야 "판단근거 및 종합의견"이 쪼개지지 않습니다. */
const MARKER_RE =
  /(판단근거\s*(?:및|,|\/)?\s*종합의견|기타\s*내용\s*(?:및|,)?\s*종합의견|판단\s*근거|종합\s*의견|총\s*평|(?:어르신|수급자|보호자)(?:과|와)?\s*보호자?의?\s*욕구|욕구\s*및\s*의견)\s*[:：]?\s*/g;

/** 다음 항목이 시작되면 서술이 끝난 것으로 봅니다. */
const NEXT_HEADING_RE = /\n\s*(?:\d{1,2}\s*[.)]\s*\S|[IVX]+\s*\.\s*\S|※)/;

/**
 * 항목 제목에서 갈래를 정합니다.
 *
 * 제목이 해마다 조금씩 달라(예: "어르신의 환경과 욕구" / "어르신의 환경")
 * 번호나 정확한 문구로는 맞출 수 없어 낱말로 판단합니다.
 */
function classifyHeading(heading: string, marker: string): NarrativeSection {
  const h = heading.replace(/\s+/g, "");

  if (/총평/.test(marker.replace(/\s+/g, ""))) return "총평";

  if (/질병|진단|투약|복약|의료기관|간호처치/.test(h)) return "질병상태";
  if (/인지|치매|정신|기억|지남력|행동변화/.test(h)) return "인지상태";
  if (/의사소통|청력|시력|발음|언어/.test(h)) return "의사소통";
  if (/영양|식사|구강|치아|배설|배뇨|배변/.test(h)) return "영양상태";
  if (/환경|가족|주거|수발|보호자상황|거주/.test(h)) return "가족환경";
  if (/개별욕구|주관적욕구|욕구/.test(h)) return "주관적욕구";
  if (/자원|지역사회|복지용구|서비스제공방향|연계/.test(h)) return "자원이용";
  if (/신체|일상생활|재활|일반상태|보행|이동|위생/.test(h)) return "신체상태";

  // 제목으로 못 정하면 표현을 봅니다. 마지막에 오는 종합의견은 대개 총평입니다.
  if (/종합의견/.test(marker.replace(/\s+/g, ""))) return "총평";
  if (/욕구/.test(marker)) return "주관적욕구";
  return "신체상태";
}

/** 표시 문자·서식 찌꺼기를 걷어냅니다. */
function clean(text: string): string {
  return text
    .replace(/[☑☐□■◻◼✔✓]/g, " ")
    .replace(/※[^\n]*/g, " ")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/^\s*\(\s*서술형[^)]*\)\s*/, "")
    .replace(/^\s*에\s*상세기술\s*/, "")
    .trim();
}

/** 서식의 보기 목록에서만 나오는 말들. 두 번 이상 보이면 표가 딸려 온 것입니다. */
const TABLE_WORDS = /(해당사항\s*없음|질\s*병\s*명|질병\s*분류|보\s*기|표\s*기|확\s*인|미해당)/g;

/** 서술이라고 볼 수 있는 문장인지 봅니다. 체크 목록이 딸려 온 경우를 걸러냅니다. */
function looksLikeProse(text: string): boolean {
  if (text.length < 20) return false;

  // 한글 비중이 낮으면 표가 섞여 들어온 것입니다.
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  if (hangul / text.length < 0.55) return false;

  // 서식의 보기 목록이 딸려 온 경우.
  if ((text.match(TABLE_WORDS) ?? []).length >= 2) return false;

  // 채우지 않은 괄호가 여럿이면 고르는 칸을 그대로 읽어 온 것입니다.
  if ((text.match(/\(\s*\)/g) ?? []).length >= 2) return false;

  // 서술이면 종결어미로 끝나는 문장이 있습니다.
  return (
    /(함|음|임|됨|심|다|요|니다)\s*[.。]?\s*$/.test(text) ||
    /(함|음|임|됨|심)\s*[.。]\s/.test(text)
  );
}

/** 서술 바로 앞에 있는 항목 제목을 찾습니다. */
function headingBefore(text: string, at: number): string {
  const before = text.slice(Math.max(0, at - 400), at);
  const lines = before.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\d{1,2}\s*[.)]\s*\S/.test(lines[i])) return lines[i];
  }
  return lines[lines.length - 1] ?? "";
}

/** 서류 본문에서 서술형 문장을 모두 뽑아냅니다. */
export function extractNarratives(rawText: string): Narrative[] {
  if (!rawText) return [];
  const found: Narrative[] = [];
  const seen = new Set<string>();

  MARKER_RE.lastIndex = 0;
  const hits: { marker: string; start: number; end: number }[] = [];
  for (const m of rawText.matchAll(MARKER_RE)) {
    hits.push({ marker: m[1], start: m.index!, end: m.index! + m[0].length });
  }

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    // 다음 표현이 나오기 전까지, 혹은 다음 항목이 시작되기 전까지가 한 덩어리입니다.
    const limit = i + 1 < hits.length ? hits[i + 1].start : rawText.length;
    let body = rawText.slice(hit.end, limit);
    const cut = body.search(NEXT_HEADING_RE);
    if (cut >= 0) body = body.slice(0, cut);

    const text = clean(body);
    if (!looksLikeProse(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);

    const heading = headingBefore(rawText, hit.start);
    found.push({
      section: classifyHeading(heading, hit.marker),
      heading: heading.slice(0, 60),
      text,
    });
  }

  return found;
}
