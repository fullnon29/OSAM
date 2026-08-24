import "server-only";
import { getSections } from "./assessment-form";
import {
  adnominal,
  JUDGEMENT_OPENERS,
  joinKo,
  josa,
  tidySentence,
  toNounEnding,
  toParagraph,
} from "./narrative-style";

export type AssessmentResponses = Record<string, string | string[] | number | undefined>;

/** 체크돼 있어도 서술할 거리가 없는 값들. */
const NEUTRAL_VALUES = new Set([
  "없음",
  "양호",
  "정상",
  "해당없음",
  "해당 없음",
  "0 · 혼자 할 수 있음",
]);

function isMeaningful(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !NEUTRAL_VALUES.has(value.trim());
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => isMeaningful(v));
}

/* ── 일상생활동작 ─────────────────────────────────────────────
   "2 · 직접(부축)도움" 같은 값에서 도움 정도만 떼어 냅니다.
   같은 정도끼리 묶어 한 문장으로 적어야 우리 글투가 됩니다. */

const ADL_LEVEL_TEXT: Record<string, string> = {
  "1": "지시(준비) 도움",
  "2": "직접(부축) 도움",
  "3": "전혀 수행하지 못하여 전적인 도움",
};

function adlSentences(
  responses: AssessmentResponses,
  fields: { code: string; label: string }[]
): string[] {
  const byLevel: Record<string, string[]> = {};
  let allIndependent = true;

  for (const f of fields) {
    const value = str(responses[f.code]);
    if (!value) continue;
    const level = value.charAt(0);
    if (level === "0") continue;
    allIndependent = false;
    if (!ADL_LEVEL_TEXT[level]) continue;
    (byLevel[level] ??= []).push(f.label);
  }

  const sentences: string[] = [];
  for (const level of ["3", "2", "1"]) {
    const items = byLevel[level];
    if (!items?.length) continue;
    sentences.push(`${joinKo(items)}에 ${ADL_LEVEL_TEXT[level]}이 필요 함`);
  }

  if (!sentences.length && !allIndependent) return [];
  if (!sentences.length) return ["일상생활동작은 대체로 스스로 수행 가능하심"];
  return sentences;
}

/* ── 항목별 서술 ─────────────────────────────────────────────── */

/** 판단 방법을 밝히는 첫 문장. 면담자가 누구였는지에 따라 달라집니다. */
function judgementOpener(responses: AssessmentResponses): string {
  const interviewees = list(responses["s1_interviewee"]);
  const hasRecipient = interviewees.some((v) => v.includes("수급자"));
  const hasGuardian = interviewees.some((v) => v.includes("보호자"));
  if (hasRecipient && hasGuardian) return JUDGEMENT_OPENERS.둘다;
  if (hasGuardian) return JUDGEMENT_OPENERS.보호자;
  if (hasRecipient) return JUDGEMENT_OPENERS.수급자;
  return JUDGEMENT_OPENERS.기본;
}

function healthSentences(r: AssessmentResponses): string[] {
  const out: string[] = [];

  const diseases = list(r["s2a_diseases"]);
  if (diseases.length) {
    const extra = [str(r["s2a_cancer_name"]), str(r["s2a_etc"])].filter(Boolean);
    const all = joinKo([...diseases, ...extra]);
    out.push(`${josa(all, "으로/로")} 진단받으신 상태 임`);
  }

  const meds = list(r["s2b_medication"]);
  if (meds.some((m) => m.includes("정기적 약 복용"))) {
    const hospital = str(r["s2b_hospital"]);
    const cycle = str(r["s2b_visit_cycle"]);
    if (hospital) {
      const visit = cycle ? `월 ${cycle}회 ` : "";
      out.push(`정기적으로 약을 복용하고 계시며, ${hospital}에 ${visit}다니고 계심`);
    } else {
      out.push("정기적으로 약을 복용하고 계심");
    }
  }

  const oral = list(r["s2c_oral_state"]);
  if (oral.length) out.push(`구강상태는 ${josa(joinKo(oral), "으로/로")} 확인됨`);

  const mealForm = str(r["s2c_meal_form"]);
  if (isMeaningful(mealForm)) out.push(`식사는 ${josa(mealForm, "으로/로")} 드심`);

  const diet = str(r["s2c_therapeutic_diet"]);
  if (isMeaningful(diet)) out.push(`${josa(diet, "이/가")} 필요 함`);

  const nutrition = str(r["s2c_nutrition"]);
  if (nutrition === "불량") {
    const detail = list(r["s2c_nutrition_detail"]);
    out.push(
      detail.length ? `영양상태는 ${josa(joinKo(detail), "으로/로")} 불량 함` : "영양상태가 불량 함"
    );
  }

  return out;
}

function excretionSentences(r: AssessmentResponses): string[] {
  const out: string[] = [];
  const uFn = str(r["s3_urination_function"]);
  const uMethod = str(r["s3_urination_method"]);
  if (isMeaningful(uFn) || isMeaningful(uMethod)) {
    const parts: string[] = [];
    if (isMeaningful(uFn)) parts.push(uFn);
    if (isMeaningful(uMethod)) parts.push(`${uMethod} 사용`);
    out.push(`배뇨는 ${joinKo(parts)}으로 확인됨`);
  }
  const dFn = str(r["s3_defecation_function"]);
  const dMethod = str(r["s3_defecation_method"]);
  if (isMeaningful(dFn) || isMeaningful(dMethod)) {
    const parts: string[] = [];
    if (isMeaningful(dFn)) parts.push(dFn);
    if (isMeaningful(dMethod)) parts.push(`${dMethod} 사용`);
    out.push(`배변은 ${joinKo(parts)}으로 확인됨`);
  }
  return out;
}

function mobilitySentences(r: AssessmentResponses): string[] {
  const out: string[] = [];

  const gait = str(r["s4_gait"]);
  const aids = list(r["s4_gait_aid"]);
  if (aids.length) {
    out.push(`보행 시 ${josa(joinKo(aids), "을/를")} 사용하심`);
  } else if (isMeaningful(gait)) {
    out.push(`보행상태는 ${josa(gait, "이/가")} 확인됨`);
  }

  for (const [code, label] of [
    ["s4_paralysis", "마비"],
    ["s4_motor_impair", "운동장애"],
    ["s4_contracture", "관절구축"],
    ["s4_amputation", "절단"],
  ] as const) {
    const sites = list(r[code]);
    if (!sites.length) continue;
    const detail = str(r[`${code}_site`]);
    out.push(`${joinKo(sites)}에 ${josa(label, "이/가")} 있음${detail ? ` (${detail})` : ""}`);
  }

  const fall = str(r["s4_fall"]);
  if (isMeaningful(fall)) {
    const count = r["s4_fall_count"];
    out.push(count ? `지난 3개월간 낙상이 ${count}회 있었음` : "지난 3개월간 낙상 경험이 있음");
  }

  return out;
}

function cognitionSentences(r: AssessmentResponses): string[] {
  const out: string[] = [];

  const cog = list(r["s6_cognition"]);
  if (cog.length) out.push(`인지기능은 ${josa(joinKo(cog), "으로/로")} 확인됨`);

  const behavior = list(r["s6_behavior"]);
  if (behavior.length) out.push(`${joinKo(behavior)} 등의 행동변화가 관찰됨`);

  const psych = list(r["s6_psychology"]);
  if (psych.length) out.push(`${josa(joinKo(psych), "이/가")} 있음`);

  const comp = str(r["s6_comprehension"]);
  const expr = str(r["s6_expression"]);
  if (isMeaningful(comp) || isMeaningful(expr)) {
    const parts: string[] = [];
    if (isMeaningful(comp)) parts.push(`이해능력은 ${comp}`);
    if (isMeaningful(expr)) parts.push(`표현능력은 ${expr}`);
    out.push(`${joinKo(parts)} 수준 임`);
  }

  const vision = str(r["s6_vision"]);
  if (isMeaningful(vision)) {
    const glasses = str(r["s6_vision_glasses"]) === "예" ? " (안경 사용)" : "";
    out.push(`시력은 ${toNounEnding(vision)}${glasses}`);
  }
  const hearing = str(r["s6_hearing"]);
  if (isMeaningful(hearing)) {
    const aid = str(r["s6_hearing_aid"]) === "예" ? " (보청기 사용)" : "";
    out.push(`청력은 ${toNounEnding(hearing)}${aid}`);
  }

  return out;
}

function familySentences(r: AssessmentResponses): string[] {
  const out: string[] = [];

  const cohabitant = list(r["s7_cohabitant"]);
  const housing = str(r["s7_housing_type"]);
  if (cohabitant.length) {
    const where = isMeaningful(housing) ? `${housing}에서 ` : "";
    out.push(`${where}${josa(joinKo(cohabitant), "과/와")} 함께 거주하고 계심`);
  } else if (isMeaningful(housing)) {
    out.push(`${housing}에 거주하고 계심`);
  }

  const caregiver = str(r["s7_primary_caregiver_relation"]) || str(r["s7_primary_caregiver"]);
  if (caregiver) {
    const burden = str(r["s7_primary_caregiver_burden"]);
    out.push(
      burden
        ? `주 수발자는 ${josa(caregiver, "이며/며")} 부양부담은 ${adnominal(burden)} 것으로 확인됨`
        : `주 수발자는 ${josa(caregiver, "임/임")}`
    );
  }

  const alone = str(r["s7_alone_all_day"]);
  if (alone === "Y" || alone === "예") out.push("낮 시간 동안 혼자 계시는 시간이 있음");

  const resources = list(r["s7_community_resources"]);
  if (resources.length) out.push(`${josa(joinKo(resources), "을/를")} 이용하고 계심`);

  return out;
}

function environmentSentences(r: AssessmentResponses): string[] {
  const problems: string[] = [];
  for (const [code, label] of [
    ["s8_stairs", "실내·외 계단"],
    ["s8_threshold", "실내 문턱"],
  ] as const) {
    if (str(r[code]) === "있음") problems.push(label);
  }
  for (const [code, label] of [
    ["s8_floor_wall", "바닥·벽지"],
    ["s8_hvac", "냉·난방 및 환기"],
    ["s8_lighting", "조명"],
    ["s8_kitchen", "주방"],
  ] as const) {
    if (str(r[code]) === "불량") problems.push(label);
  }

  const out: string[] = [];
  if (problems.length) out.push(`주거환경 중 ${joinKo(problems)}에 개선이 필요 함`);
  if (str(r["s8_toilet_location"]) === "실외") out.push("화장실이 실외에 있어 이용 시 도움이 필요 함");
  return out;
}

function wishSentences(r: AssessmentResponses): string[] {
  const wishes = [
    ...list(r["s9_physical_support"]),
    ...list(r["s9_daily_support"]),
    ...list(r["s9_rehab"]),
  ];
  if (!wishes.length) return [];
  return [`어르신과 보호자는 ${josa(joinKo(wishes), "을/를")} 희망하심`];
}

/* ── 총평 초안 ────────────────────────────────────────────────── */

type Block = { title: string; sentences: string[]; opinionCode: string };

function buildBlocks(r: AssessmentResponses): Block[] {
  return [
    { title: "건강 및 질병상태", sentences: healthSentences(r), opinionCode: "s2_opinion" },
    { title: "일상생활기능", sentences: [], opinionCode: "s3_opinion" },
    { title: "재활 및 신체기능", sentences: mobilitySentences(r), opinionCode: "s4_opinion" },
    { title: "인지 및 의사소통", sentences: cognitionSentences(r), opinionCode: "s6_opinion" },
    { title: "가족 및 지지체계", sentences: familySentences(r), opinionCode: "s7_opinion" },
    { title: "주거환경", sentences: environmentSentences(r), opinionCode: "s8_opinion" },
    { title: "희망 서비스", sentences: wishSentences(r), opinionCode: "s9_opinion" },
  ];
}

/**
 * 한 항목의 '의견 및 판단근거' 초안을 만듭니다.
 *
 * 공단 평가에서 체크만 한 기록은 인정받지 못하므로 항목마다 판단근거가 있어야
 * 합니다. AI를 못 쓰는 상황에서도 이 초안은 늘 나옵니다.
 */
export function generateSectionDraft(
  responses: AssessmentResponses,
  sectionCode: string,
  recipientName: string,
  formVersion?: string | null
): string {
  const opener = `${judgementOpener(responses)} ${recipientName} 어르신의 상태를 판단 함`;

  let sentences: string[];
  switch (sectionCode) {
    case "s2":
      sentences = healthSentences(responses);
      break;
    case "s3": {
      const adlFields =
        getSections(formVersion)
          .find((sec) => sec.code === "s3")
          ?.fields.filter((f) => f.type === "scale4")
          .map((f) => ({ code: f.code, label: f.label })) ?? [];
      sentences = [...adlSentences(responses, adlFields), ...excretionSentences(responses)];
      break;
    }
    case "s4":
      sentences = mobilitySentences(responses);
      break;
    case "s6":
      sentences = cognitionSentences(responses);
      break;
    case "s7":
      sentences = familySentences(responses);
      break;
    case "s8":
      sentences = environmentSentences(responses);
      break;
    case "s9":
      sentences = wishSentences(responses);
      break;
    default:
      sentences = [];
  }

  if (!sentences.length) {
    return `${opener}. 이 항목에서 확인된 특이사항은 없음.`;
  }
  return toParagraph([opener, ...sentences]);
}

/** 한 항목의 문답만 추려 냅니다. AI에게 그 항목 이야기만 시키기 위함입니다. */
export function formatSectionQA(
  responses: AssessmentResponses,
  sectionCode: string,
  formVersion?: string | null
): string {
  const section = getSections(formVersion).find((s) => s.code === sectionCode);
  if (!section) return "";
  const rows: string[] = [];
  for (const field of section.fields) {
    const value = responses[field.code];
    if (value === undefined || value === "") continue;
    const text = Array.isArray(value) ? value.join(", ") : String(value);
    if (!text.trim()) continue;
    rows.push(`- ${field.label}: ${text}`);
  }
  return rows.join("\n");
}

/**
 * 응답값만으로 우리 센터 글투의 총평 초안을 만듭니다.
 *
 * AI를 쓰지 않으므로 연결이 없어도, 비용 없이도 늘 같은 결과가 나옵니다.
 * 사회복지사가 직접 쓴 '의견 및 판단근거'는 이미 우리 글투이므로 손대지 않고
 * 그대로 이어 붙입니다.
 */
export function generateDraftSummary(
  responses: AssessmentResponses,
  recipientName: string,
  formVersion?: string | null
): string {
  const paragraphs: string[] = [];

  // 일상생활동작은 서식에서 항목을 읽어와 도움 정도끼리 묶습니다.
  const adlFields = getSections(formVersion)
    .find((s) => s.code === "s3")
    ?.fields.filter((f) => f.type === "scale4")
    .map((f) => ({ code: f.code, label: f.label })) ?? [];
  const adl = adlSentences(responses, adlFields);

  const blocks = buildBlocks(responses);
  for (const block of blocks) {
    if (block.opinionCode === "s3_opinion") {
      block.sentences = [...adl, ...excretionSentences(responses)];
    }
  }

  // 첫 문장은 무엇을 보고 판단했는지 밝힙니다. 공단이 요구하는 판단근거입니다.
  const opener = `${judgementOpener(responses)} ${recipientName} 어르신의 상태를 판단 함`;

  const body: string[] = [tidySentence(opener)];
  for (const block of blocks) {
    const opinion = str(responses[block.opinionCode]);
    const sentences = [...block.sentences];
    if (opinion) sentences.push(opinion);
    if (!sentences.length) continue;
    body.push(toParagraph(sentences));
  }

  if (body.length === 1) {
    return `${recipientName} 어르신의 욕구사정 내용이 아직 입력되지 않아 총평을 작성할 수 없음.`;
  }

  paragraphs.push(body.join(" "));
  return paragraphs.join("\n\n");
}

/* ── AI에게 넘길 전체 문답 ────────────────────────────────────── */

/** 응답을 항목별로 정리해 AI가 근거로 삼을 수 있게 만듭니다. */
export function formatFullQA(
  responses: AssessmentResponses,
  formVersion?: string | null
): string {
  const lines: string[] = [];

  for (const section of getSections(formVersion)) {
    const rows: string[] = [];
    for (const field of section.fields) {
      const value = responses[field.code];
      if (value === undefined || value === "") continue;
      const text = Array.isArray(value) ? value.join(", ") : String(value);
      if (!text.trim()) continue;
      rows.push(`- ${field.label}: ${text}`);
    }
    if (!rows.length) continue;
    lines.push(`## ${section.title}`, ...rows, "");
  }

  return lines.join("\n").trim();
}
