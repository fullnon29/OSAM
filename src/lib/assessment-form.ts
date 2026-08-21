// 하위 호환용 재수출. 서식 정의는 src/lib/forms/ 아래 버전별로 관리합니다.
// 버전을 지정해 읽어야 하는 곳(저장된 기록 출력 등)은 forms/index 의
// getSections(formVersion) 을 직접 쓰세요.

export type { Field, FieldType, FormVersion, Section } from "./forms";
export {
  CURRENT_FORM_VERSION,
  FORM_VERSIONS,
  getAllFields,
  getFormVersion,
  getSections,
} from "./forms";

import { getSections } from "./forms";

/** 현재 서식의 문항. 새로 작성하는 화면에서 씁니다. */
export const ASSESSMENT_SECTIONS = getSections();
