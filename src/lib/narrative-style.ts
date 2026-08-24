// 오샘재가복지센터가 쓰는 서술 형식.
//
// 지난 욕구사정 서류 279건에서 골라낸 서술 2,205덩어리(문장 6,023개)를 세어
// 정리한 것입니다. 지어낸 규칙이 아니라 실제로 쓰고 계신 글투입니다.
//
//   종결   함 43.6% · 다 20.7% · 음 19.6% · 심 4.3% · 임 4.1% · 됨 2.1%
//          → 명사형 종결이 73.7%, "습니다"체는 0.2%(2,205덩어리 중 4건)
//   호칭   "어르신" 80%
//   구조   "판단 함" 54% · "상담을 통해" 42% · "직접 관찰" 24%
//          → 무엇을 보고 판단했는지 먼저 밝히고, 그 다음 상태를 적음
//   마무리 "도움이 필요" 15%
//   길이   문장당 평균 55자
//
// 공단 평가기준이 요구하는 '판단근거'가 이 글투에 이미 들어 있습니다.
// 체크만 한 기록은 인정받지 못하므로, 새로 쓰는 기록도 같은 형식으로 나오게 합니다.

/** AI에게 넘기는 글투 지침. 사람이 읽어도 그대로 이해되는 문장으로 적습니다. */
export const HOUSE_STYLE_GUIDE = `오샘재가복지센터의 욕구사정 서술 형식:

1. 종결어미는 명사형으로 끝냅니다. "~함", "~음", "~임", "~됨", "~하심".
   "~습니다", "~합니다"체는 쓰지 않습니다.
2. 수급자는 "어르신"으로 부릅니다. 존칭 표현을 씁니다("~하심", "~계심", "드심").
3. 문장은 무엇을 보고 판단했는지부터 밝힙니다.
   문답에 적힌 면담자와 확인 방법만 씁니다.
   예: "어르신 및 보호자와의 상담과 직접 관찰을 통해 신체상태를 판단 함."
4. 그 다음 관찰된 상태를 구체적으로 적습니다. 진단을 내리거나 과장하지 않습니다.
5. 마지막에 필요한 지원을 적습니다. 예: "이동과 목욕에 직접 도움이 필요 함."
6. 한 문장은 50~60자 안팎으로 씁니다.

절대 지키셔야 할 것:
7. 문답에 없는 사실은 절대 지어내지 않습니다. 확인되지 않은 것은 적지 않습니다.
8. 관찰한 장면을 구체적으로 지어내지 마십시오.
   "세면대에서 세수하시는 모습을 관찰하고", "방에서 걸어 나오시는 모습을 보고"처럼
   실제로 그런 장면을 보았다는 서술은, 문답에 그 내용이 적혀 있을 때만 쓸 수 있습니다.
   적혀 있지 않으면 "직접 관찰과 상담을 통해 판단 함" 정도로만 씁니다.
   이 기록은 공단 평가에 제출되므로 없던 관찰을 적으면 안 됩니다.
9. 숫자(층수·횟수·기간·나이)는 문답이나 지난 기록에 있는 것만 씁니다. 추측하지 마십시오.`;

/** 자주 쓰는 판단 방법 표현. 면담 대상에 따라 골라 씁니다. */
export const JUDGEMENT_OPENERS = {
  수급자: "어르신과의 직접 상담과 관찰을 통해",
  보호자: "보호자와의 상담을 통해",
  주수발자: "주 수발자와의 상담을 통해",
  둘다: "어르신 및 보호자와의 상담과 직접 관찰을 통해",
  기본: "어르신 댁 방문 시 직접 관찰과 상담을 통해",
} as const;

/** 여러 낱말을 우리 글투대로 잇습니다. 마지막만 "및"이 아니라 쉼표로 잇습니다. */
export function joinKo(items: string[]): string {
  const list = items.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")}, ${list[list.length - 1]}`;
}

/**
 * 명사형 종결로 끝나는지 확인하고, 아니면 마침표만 정리합니다.
 *
 * 문장을 억지로 바꾸지는 않습니다. 사회복지사가 직접 쓴 문장은 그대로 두는 것이
 * 옳고, 규칙으로 만든 문장은 애초에 명사형으로 만들기 때문입니다.
 */
export function tidySentence(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return /[.。!?]$/.test(t) ? t : `${t}.`;
}

/** 문단으로 묶습니다. 빈 문장은 버립니다. */
export function toParagraph(sentences: string[]): string {
  return sentences.map(tidySentence).filter(Boolean).join(" ");
}

/* ── 조사 붙이기 ───────────────────────────────────────────────
   "관절염(으)로", "마비이 있음" 같은 어색한 말이 나오지 않도록
   앞말의 받침을 보고 조사를 고릅니다. */

/** 문자열에서 마지막 한글 음절의 받침 번호. 한글이 없으면 null. */
function finalJamo(word: string): number | null {
  for (let i = word.length - 1; i >= 0; i--) {
    const code = word.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
  }
  return null;
}

/**
 * 앞말에 맞는 조사를 붙입니다.
 *
 *   josa("관절염", "으로/로")  → "관절염으로"
 *   josa("류마티스", "으로/로") → "류마티스로"
 *   josa("마비", "이/가")       → "마비가"
 *
 * 한글이 아닌 말(숫자·영문)로 끝나면 받침 있는 쪽을 씁니다.
 */
export function josa(word: string, pair: `${string}/${string}`): string {
  const [withBatchim, withoutBatchim] = pair.split("/");
  const jong = finalJamo(word);
  if (jong === null) return word + withBatchim;
  // ㄹ 받침은 "으로"가 아니라 "로"를 씁니다 (예: 서울로).
  if (jong === 8 && pair === "으로/로") return word + withoutBatchim;
  return word + (jong === 0 ? withoutBatchim : withBatchim);
}

/**
 * "~있다", "~못한다" 같은 종결을 우리 글투인 명사형으로 바꿉니다.
 * 서식 보기 문구가 해마다 달라 문장형으로 적혀 있는 해가 있습니다.
 */
export function toNounEnding(text: string): string {
  return text
    .replace(/있다\.?$/, "있음")
    .replace(/없다\.?$/, "없음")
    .replace(/못한다\.?$/, "못함")
    .replace(/한다\.?$/, "함")
    .replace(/된다\.?$/, "됨")
    .replace(/이다\.?$/, "임")
    .trim();
}

/**
 * "자주 부담됨" 같은 보기 문구를 "자주 부담되는 (것으로)" 꼴로 바꿉니다.
 * 서식의 보기를 그대로 문장에 넣으면 "부담됨 것으로"처럼 어색해집니다.
 */
export function adnominal(text: string): string {
  const t = text.trim();
  if (t.endsWith("않음")) return `${t.slice(0, -2)}않는`;
  if (t.endsWith("됨")) return `${t.slice(0, -1)}되는`;
  if (t.endsWith("음")) return `${t.slice(0, -1)}은`;
  if (t.endsWith("함")) return `${t.slice(0, -1)}한`;
  return t;
}
