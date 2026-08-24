"use client";

import { ASSESSMENT_SECTIONS, type Field } from "@/lib/assessment-form";

export type ResponseValue = string | string[] | number | undefined;
export type Responses = Record<string, ResponseValue>;

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: ResponseValue;
  onChange: (value: ResponseValue) => void;
}) {
  if (field.type === "text") {
    return (
      <input
        type="text"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        value={value === undefined ? "" : (value as number)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    );
  }

  if (field.type === "select" || field.type === "scale4") {
    const current = (value as string) ?? "";
    return (
      <div className="assess-pill-group">
        {(field.options ?? []).map((opt) => (
          <button
            key={opt}
            type="button"
            className={`assess-pill ${current === opt ? "active" : ""}`}
            onClick={() => onChange(current === opt ? undefined : opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === "multiselect") {
    const current = Array.isArray(value) ? (value as string[]) : [];
    function toggle(opt: string) {
      if (current.includes(opt)) {
        onChange(current.filter((v) => v !== opt));
      } else {
        onChange([...current, opt]);
      }
    }
    return (
      <div className="assess-pill-group">
        {(field.options ?? []).map((opt) => (
          <button
            key={opt}
            type="button"
            className={`assess-pill ${current.includes(opt) ? "active" : ""}`}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  return null;
}

export default function AssessmentFormFields({
  responses,
  onChange,
  onAssist,
  assistingSection,
}: {
  responses: Responses;
  onChange: (code: string, value: ResponseValue) => void;
  /**
   * 판단근거를 대신 써 주는 기능. 연결이 필요하므로 쓸 수 있는 화면에서만 넘깁니다.
   * 넘기지 않으면 버튼이 보이지 않습니다(오프라인 화면).
   */
  onAssist?: (sectionCode: string) => void;
  /** 지금 작성 중인 항목 코드 */
  assistingSection?: string | null;
}) {
  return (
    <>
      {ASSESSMENT_SECTIONS.map((section) => (
        <div className="detail-card assess-section" key={section.code}>
          <h2 style={{ fontSize: 18, color: "var(--pine-deep)", marginBottom: 6 }}>
            {section.title}
          </h2>
          {section.note && <p className="assess-section-note">{section.note}</p>}

          {section.fields.map((field, i) => {
            const prevGroup = i > 0 ? section.fields[i - 1].group : undefined;
            const showGroupTitle = field.group && field.group !== prevGroup;
            return (
              <div key={field.code}>
                {showGroupTitle && <div className="assess-group-title">{field.group}</div>}
                <div className="assess-field">
                  <label>{field.label}{field.suffix ? ` (${field.suffix})` : ""}</label>
                  <FieldInput
                    field={field}
                    value={responses[field.code]}
                    onChange={(v) => onChange(field.code, v)}
                  />
                  {onAssist && field.code.endsWith("_opinion") && (
                    <button
                      className="btn outline small assist-btn"
                      type="button"
                      onClick={() => onAssist(section.code)}
                      disabled={assistingSection === section.code}
                      title="이 항목의 체크 내용과 지난 기록을 바탕으로 오샘 서술형식의 판단근거를 만들어 줍니다."
                    >
                      {assistingSection === section.code
                        ? "작성 중…"
                        : "🪄 판단근거 작성 (오샘 서술형식)"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
