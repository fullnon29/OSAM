// 서식 버전 레지스트리.
//
// 서식은 해마다 개정되지만, 이미 저장된 기록은 작성 당시 서식으로 읽고 출력해야
// 합니다. 문항 정의가 한 벌뿐이면 서식을 고치는 순간 과거 기록의 답이 바뀐 문항에
// 붙어 잘못 표시되므로, 버전별 정의를 따로 두고 기록에는 작성에 쓰인 버전 id를
// 함께 저장합니다.
//
// 서식이 개정되면:
//   1) v2026.ts 를 복사해 새 파일(v2027.ts 등)을 만들고
//   2) 아래 FORM_VERSIONS 에 추가한 뒤
//   3) CURRENT_FORM_VERSION 을 새 id 로 바꿉니다.
// 기존 파일은 절대 수정하지 않습니다(과거 기록이 그 정의를 참조합니다).

import type { Field, FormVersion, Section } from "./types";
import { V2026_SECTIONS } from "./v2026.ts";

export type { Field, FieldType, FormVersion, Section } from "./types";

export const FORM_VERSIONS: FormVersion[] = [
  { id: "2026", label: "2026년 기본서식", sections: V2026_SECTIONS },
];

/** 새로 작성하는 기록에 쓰는 서식 버전 */
export const CURRENT_FORM_VERSION = "2026";

/**
 * 기록에 저장된 버전 id로 서식을 찾습니다.
 * 버전이 없는 예전 기록은 2026 서식으로 작성된 것이므로 그것으로 봅니다.
 * 모르는 id는 임의로 다른 서식을 씌우면 답이 엉뚱한 문항에 붙으므로 오류로 처리합니다.
 */
export function getFormVersion(id?: string | null): FormVersion {
  const versionId = id || CURRENT_FORM_VERSION;
  const found = FORM_VERSIONS.find((v) => v.id === versionId);
  if (!found) {
    throw new Error(
      `알 수 없는 서식 버전입니다: ${versionId}. 등록된 버전: ${FORM_VERSIONS.map((v) => v.id).join(", ")}`
    );
  }
  return found;
}

export function getSections(formVersion?: string | null): Section[] {
  return getFormVersion(formVersion).sections;
}

export function getAllFields(formVersion?: string | null): Field[] {
  return getSections(formVersion).flatMap((s) => s.fields);
}

// optionGroups는 출력 전용 배치 정보일 뿐, 선택지 자체는 options와 같아야 합니다.
// 둘이 어긋나면 출력물에서 선택지가 빠지거나 중복되므로 불러오는 즉시 걸러냅니다.
for (const version of FORM_VERSIONS) {
  for (const field of version.sections.flatMap((s) => s.fields)) {
    if (!field.optionGroups) continue;
    const flattened = field.optionGroups.flatMap((g) => g.options);
    const expected = field.options ?? [];
    const same =
      flattened.length === expected.length && flattened.every((o, i) => o === expected[i]);
    if (!same) {
      throw new Error(
        `서식 ${version.id} - ${field.code}의 optionGroups가 options와 일치하지 않습니다.\n` +
          `options(${expected.length}): ${JSON.stringify(expected)}\n` +
          `optionGroups(${flattened.length}): ${JSON.stringify(flattened)}`
      );
    }
  }
}
