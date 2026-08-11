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
}: {
  responses: Responses;
  onChange: (code: string, value: ResponseValue) => void;
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
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
