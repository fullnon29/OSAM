// 욕구조사기록지 작성매뉴얼(장기요양기관)에 따른 계산 항목.
//
// BMI = 체중(kg) ÷ (키(cm)÷100)²
// 예: 체중 60kg, 키 160cm → 60÷(160÷100)² = 23.4 (위험체중)
//
// 구간(질병관리청 국가건강정보포털, 2024.12.7. 기준)
//   18.5 미만 저체중 / 18.5~22.9 정상 / 23~24.9 위험체중
//   25~29.9 1단계 비만 / 30 이상 2단계 비만

export type BmiResult = { value: number; category: string };

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "저체중";
  if (bmi < 23) return "정상";
  if (bmi < 25) return "위험체중";
  if (bmi < 30) return "1단계 비만";
  return "2단계 비만";
}

export function calculateBmi(height: unknown, weight: unknown): BmiResult | null {
  const cm = toNumber(height);
  const kg = toNumber(weight);
  if (cm === null || kg === null || cm <= 0 || kg <= 0) return null;
  const m = cm / 100;
  // 매뉴얼 예시가 소수점 첫째자리까지 표기하므로 동일하게 맞춥니다.
  const value = Math.round((kg / (m * m)) * 10) / 10;
  if (!Number.isFinite(value)) return null;
  return { value, category: bmiCategory(value) };
}

/** 출력물에 그대로 쓸 수 있는 "23.4 (위험체중)" 형태의 문자열 */
export function formatBmi(height: unknown, weight: unknown): string {
  const bmi = calculateBmi(height, weight);
  return bmi ? `${bmi.value} (${bmi.category})` : "-";
}
