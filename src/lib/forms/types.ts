// 욕구조사기록지 서식의 공용 타입.
// 서식은 해마다 개정되므로 문항 정의는 버전별 파일(v2026.ts 등)에 두고,
// 타입만 여기서 공유합니다.

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multiselect"
  | "scale4";

export type Field = {
  code: string;
  label: string;
  type: FieldType;
  group?: string; // 소제목 (예: "가. 위생관리") - 이전 필드와 다르면 헤더로 표시
  options?: string[];
  // 원본 서식에서 선택지가 계통별로 줄을 나눠 배치된 경우의 구성.
  // 저장 형식과 웹 입력 화면은 그대로 options(평면 목록)를 쓰고,
  // 워드/PDF 출력만 이 구성을 따라 원본 서식과 같은 줄 배치로 그립니다.
  // 여기 나열된 선택지는 options와 정확히 일치해야 합니다(검증: assertFormIntegrity).
  optionGroups?: { label: string; options: string[] }[];
  suffix?: string;
  placeholder?: string;
};

export type Section = {
  code: string;
  title: string;
  note?: string;
  fields: Field[];
};

export type FormVersion = {
  /** 기록에 저장되는 값. 한 번 쓰이면 절대 바꾸지 않습니다. */
  id: string;
  /** 화면에 보여줄 이름 */
  label: string;
  sections: Section[];
};
