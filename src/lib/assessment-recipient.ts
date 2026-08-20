// 출력물(워드/PDF) 머리말의 수급자 인적사항 블록에 쓰는 정보.
// 원본 서식 1. 일반사항의 수급자 칸과 같은 항목입니다.
export type RecipientInfo = {
  name: string;
  birth_date?: string | null;
  gender?: string | null;
  ltc_grade?: string | null;
  ltc_number?: string | null;
};

export function genderLabel(gender?: string | null) {
  if (gender === "M") return "남";
  if (gender === "F") return "여";
  return "-";
}

// 생년월일에서 만 나이를 계산합니다(원본 서식의 "( 세)" 칸).
export function ageFromBirthDate(birthDate?: string | null): string {
  if (!birthDate) return "-";
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "-";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? `${age}세` : "-";
}

/** 원본 서식 수급자 칸과 같은 순서의 라벨/값 쌍 */
export function recipientInfoPairs(r: RecipientInfo): [string, string][] {
  return [
    ["성명", r.name || "-"],
    ["성별", genderLabel(r.gender)],
    ["생년월일", r.birth_date ? `${r.birth_date} (${ageFromBirthDate(r.birth_date)})` : "-"],
    ["장기요양인정번호", r.ltc_number || "-"],
    ["장기요양등급", r.ltc_grade || "-"],
  ];
}
