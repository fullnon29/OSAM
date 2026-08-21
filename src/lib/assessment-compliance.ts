// 국민건강보험공단 「2026년 방문요양 평가매뉴얼」 - 욕구사정 지표 충족 여부 점검.
//
// 채점에서 가장 자주 놓치는 지점이 명시되어 있습니다:
//   "욕구사정이 단순 체크리스트로 작성된 경우 욕구사정 항목별 또는 총평에
//    판단 근거(수급자 기능 및 상태)가 확인되면 인정한다"
//   - 옷 벗고 입기를 '△(부분도움)'으로 체크만 한 경우 → 인정하지 않음
//   - '왼쪽편마비로 옷을 갈아입을 때 일부 도움을 주어야함' 작성 → 인정
//
// 즉 체크만 채운 기록은 점수를 받지 못하므로, 완료 처리 전에 판단근거가
// 비어 있는 영역을 짚어 줍니다.
//
// 평가기준 필수사항: 수급자명, 일자, 작성자명, 세부내용(8개 항목), 총평(서술형)

export type ComplianceIssue = {
  /** 공단 세부내용 항목 번호(1~8) 또는 '총평' */
  item: string;
  message: string;
  /** blocking: 이대로면 평가에서 인정받지 못할 가능성이 높음 */
  severity: "blocking" | "warning";
  /** 화면에서 해당 입력칸으로 이동시키기 위한 필드 코드 */
  fieldCode?: string;
};

type Responses = Record<string, string | string[] | number | undefined>;

function isFilled(value: unknown, minLength = 1): boolean {
  return typeof value === "string" && value.trim().length >= minLength;
}

// 공단 "욕구사정 세부내용 8개 항목"과 우리 서식 영역의 대응.
// 한 항목이 여러 영역에 걸쳐 있으면 그 중 하나라도 판단근거가 있으면 인정합니다.
const ITEM_MAP: { item: string; label: string; opinionCodes: string[] }[] = [
  { item: "1", label: "신체상태(일상생활동작 수행능력 등)", opinionCodes: ["s3_opinion", "s4_opinion"] },
  { item: "2", label: "질병상태(과거병력, 현 진단명 등)", opinionCodes: ["s2_opinion"] },
  { item: "3", label: "인지상태(인지기능 등)", opinionCodes: ["s6_opinion"] },
  { item: "4", label: "의사소통(청취능력, 발음능력 등)", opinionCodes: ["s6_opinion"] },
  { item: "5", label: "영양상태(음식섭취 패턴, 치아상태, 배설 양상 등)", opinionCodes: ["s2_opinion", "s3_opinion"] },
  { item: "6", label: "가족 및 환경상태(가족상황, 거주환경, 수발부담 등)", opinionCodes: ["s7_opinion", "s8_opinion"] },
  { item: "7", label: "주관적 욕구(수급자·보호자가 호소하는 개별 욕구)", opinionCodes: ["s9_opinion"] },
  { item: "8", label: "자원이용(의료기관, 사회복지기관 등)", opinionCodes: ["s7_opinion"] },
];

export function checkCompliance(params: {
  responses: Responses;
  finalSummary: string;
  /** 2026.1월부터 '기피식품 파악' 확인 대상이 되므로 기준일을 넘겨 판단합니다. */
  assessedAt?: string;
}): ComplianceIssue[] {
  const { responses, finalSummary, assessedAt } = params;
  const issues: ComplianceIssue[] = [];

  for (const { item, label, opinionCodes } of ITEM_MAP) {
    const hasEvidence = opinionCodes.some((code) => isFilled(responses[code]));
    if (!hasEvidence) {
      issues.push({
        item,
        severity: "blocking",
        fieldCode: opinionCodes[0],
        message: `${label}: 판단근거가 비어 있습니다. 체크만으로는 평가에서 인정되지 않으므로 '의견 및 판단근거'를 작성해 주세요.`,
      });
    }
  }

  // 총평은 서술형 작성만 인정됩니다.
  if (!isFilled(finalSummary)) {
    issues.push({
      item: "총평",
      severity: "blocking",
      message: "총평이 비어 있습니다. 종합소견을 서술형으로 작성해야 인정됩니다.",
    });
  } else if (finalSummary.trim().length < 50) {
    issues.push({
      item: "총평",
      severity: "warning",
      message: "총평이 너무 짧습니다. 종합소견을 충실하게 서술했는지 확인해 주세요.",
    });
  }

  // 세부내용 5번의 '기피식품 파악'은 식사제공 유의사항 등에 기록되어 있는지 확인합니다.
  const appliesToFoodDislikes = !assessedAt || assessedAt >= "2026-01-01";
  if (appliesToFoodDislikes && !isFilled(responses["s2c_meal_notes"])) {
    issues.push({
      item: "5",
      severity: "warning",
      fieldCode: "s2c_meal_notes",
      message:
        "기피식품 파악이 확인되지 않습니다. 2026년부터 확인 항목이므로 '식사제공 유의사항'에 기피식품을 기록해 주세요.",
    });
  }

  return issues;
}

export function summarizeCompliance(issues: ComplianceIssue[]) {
  const blocking = issues.filter((i) => i.severity === "blocking").length;
  return {
    blocking,
    warnings: issues.length - blocking,
    passed: issues.length === 0,
  };
}
