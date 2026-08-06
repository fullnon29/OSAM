"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const GRADE_OPTIONS = [
  "1등급",
  "2등급",
  "3등급",
  "4등급",
  "5등급",
  "인지지원등급",
  "등급 없음",
];

export default function ConsultationForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle"
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    setStatus("submitting");
    const supabase = createClient();
    const { error } = await supabase.from("consultation_requests").insert({
      guardian_name: data.get("guardian_name"),
      phone: data.get("phone"),
      elder_name: data.get("elder_name") || null,
      grade: data.get("grade") || null,
      message: data.get("message") || null,
    });

    if (error) {
      console.error(error);
      setStatus("error");
      return;
    }

    setStatus("done");
    form.reset();
  }

  if (status === "done") {
    return (
      <div className="pricing-note">
        상담 신청이 접수되었습니다. 빠른 시일 내에 연락드리겠습니다.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {status === "error" && (
        <div className="form-error">
          접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      )}
      <input type="text" name="guardian_name" placeholder="보호자 성함" required />
      <input type="tel" name="phone" placeholder="연락처" required />
      <input type="text" name="elder_name" placeholder="어르신 성함" />
      <select name="grade" defaultValue="">
        <option value="">장기요양 등급을 선택해주세요</option>
        {GRADE_OPTIONS.map((g) => (
          <option key={g}>{g}</option>
        ))}
      </select>
      <textarea
        name="message"
        placeholder="어르신의 상태나 원하시는 서비스에 대해 편하게 남겨주세요"
      />
      <button
        className="btn-primary submit"
        type="submit"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "접수 중..." : "상담 신청하기"}
      </button>
    </form>
  );
}
