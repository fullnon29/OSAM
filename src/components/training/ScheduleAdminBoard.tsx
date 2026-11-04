"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatKst } from "@/lib/format";
import { isCenterVisit, parseSchedule, type ParsedSchedule, type TextItem } from "@/lib/schedule-parse";

const normName = (s: string) => s.replace(/\s/g, "");

export type ScheduleRow = {
  id: string;
  month: string;
  file_name: string | null;
  page_count: number | null;
  created_at: string;
  visits: number;
  matched: number;
};
export type StaffOption = { id: string; name: string; dept: string; app: boolean };

const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;

// PDF 는 이 브라우저에서 읽는다(6MB 넘는 파일을 서버로 올리지 않고, 뽑은 일정만 보낸다)
async function readPdf(file: File, onPage: (n: number, total: number) => void): Promise<TextItem[][]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const pages: TextItem[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    pages.push(
      tc.items
        .filter((it) => "str" in it)
        .map((it) => {
          const t = it as { str: string; transform: number[]; width: number };
          return { str: t.str, x: t.transform[4], y: t.transform[5], w: t.width };
        })
    );
    onPage(i, pdf.numPages);
  }
  return pages;
}

export default function ScheduleAdminBoard({ schedules, staff }: { schedules: ScheduleRow[]; staff: StaffOption[] }) {
  const router = useRouter();
  const [parsed, setParsed] = useState<(ParsedSchedule & { fileName: string; pageCount: number }) | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [month, setMonth] = useState("");

  // 일정표의 방문직원 이름별 묶음(관리자방문 제외)
  const byStaff = useMemo(() => {
    if (!parsed) return [];
    const m = new Map<string, { elders: Set<string>; visits: number }>();
    for (const p of parsed.pages)
      for (const v of p.visits) {
        if (isCenterVisit(v.service) || !v.staff) continue;
        if (!m.has(v.staff)) m.set(v.staff, { elders: new Set(), visits: 0 });
        const g = m.get(v.staff)!;
        g.elders.add(p.elder);
        g.visits++;
      }
    return [...m.entries()]
      .map(([name, g]) => ({
        name,
        elders: [...g.elders],
        visits: g.visits,
        candidates: staff.filter((s) => normName(s.name) === normName(name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [parsed, staff]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotice(null);
    setParsed(null);
    setBusy(true);
    try {
      const pages = await readPdf(file, (n, t) => setProgress(`읽는 중… ${n} / ${t}쪽`));
      const r = parseSchedule(pages);
      const total = r.pages.reduce((a, p) => a + p.visits.length, 0);
      if (!total) throw new Error("이 파일에서 방문 일정을 찾지 못했습니다. 「서비스일정표」 PDF 가 맞는지 확인해 주세요.");
      setParsed({ ...r, fileName: file.name, pageCount: pages.length });
      setMonth(r.month ?? "");
      // 같은 이름의 재직 직원이 한 명이면 자동으로 맞춘다
      const auto: Record<string, string> = {};
      for (const p of r.pages)
        for (const v of p.visits) {
          if (!v.staff || auto[v.staff] !== undefined) continue;
          const c = staff.filter((s) => normName(s.name) === normName(v.staff));
          auto[v.staff] = c.length === 1 ? c[0].id : "";
        }
      setMapping(auto);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function post(payload: object) {
    const res = await fetch("/api/guide/admin-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리 중 오류가 발생했습니다.");
    return json;
  }

  async function publish() {
    if (!parsed) return;
    if (!/^\d{4}-\d{2}$/.test(month)) return setError("몇 월 일정표인지 골라 주세요.");
    if (schedules.some((s) => s.month === month) && !confirm(`이미 올린 ${monthLabel(month)} 일정표를 이 파일로 바꿀까요?`)) return;
    setBusy(true);
    setError(null);
    try {
      const json = await post({
        action: "publish",
        month,
        fileName: parsed.fileName,
        pageCount: parsed.pageCount,
        pages: parsed.pages.map((p) => ({ elder: p.elder, visits: p.visits })),
        mapping,
      });
      setNotice(`${monthLabel(month)} 일정표를 게시했습니다. 방문 ${json.saved}건 중 ${json.matched}건이 선생님 앱에 보입니다.`);
      setParsed(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: ScheduleRow) {
    if (!confirm(`${monthLabel(s.month)} 일정표를 지울까요? 선생님 앱에서도 사라집니다.`)) return;
    try {
      await post({ action: "delete", month: s.month });
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    }
  }

  const warnings = parsed ? parsed.pages.flatMap((p) => p.warnings.map((w) => `${p.page}쪽 ${p.elder}: ${w}`)) : [];
  const unmatched = byStaff.filter((g) => !mapping[g.name]);
  const shownVisits = byStaff.filter((g) => mapping[g.name]).reduce((a, g) => a + g.visits, 0);

  return (
    <div className="app-wrap">
      <div className="page-head">
        <div>
          <Link className="btn-ghost" href="/training/admin" style={{ marginBottom: 12, display: "inline-flex" }}>
            ← 교육 이수 관리로
          </Link>
          <h1>평가 길잡이 앱 일정표</h1>
          <p>
            월초 「서비스일정표」 PDF 를 올리면 방문직원 이름으로 선생님을 찾아, 그 선생님 앱 「내 일정」 에 날짜·시간·어르신만
            보여 줍니다. 등급·본인부담 금액과 관리자 방문은 앱으로 보내지 않습니다.
          </p>
        </div>
      </div>

      {notice && (
        <div className="log-panel" style={{ marginTop: 0, marginBottom: 16, borderColor: "var(--accent, #2a7)" }}>
          {notice}
        </div>
      )}

      <div className="log-panel" style={{ marginTop: 0, marginBottom: 20 }}>
        <h3>일정표 올리기</h3>
        {error && !parsed && <div className="form-error">{error}</div>}
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
          style={{ marginTop: 8 }}
        />
        {progress && <div style={{ marginTop: 8, fontSize: 14 }}>{progress}</div>}

        {parsed && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 14 }}>
              <b>{parsed.fileName}</b> · {parsed.pageCount}쪽 · 어르신 {parsed.pages.filter((p) => p.visits.length).length}분 · 방문{" "}
              {byStaff.reduce((a, g) => a + g.visits, 0)}건
            </p>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              일정 달
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              {!parsed.month && <span className="form-error" style={{ margin: 0 }}>파일에서 달을 찾지 못했습니다. 골라 주세요.</span>}
            </label>

            {warnings.length > 0 && (
              <div className="form-error" style={{ marginTop: 10 }}>
                확인이 필요한 곳 {warnings.length}건
                <ul style={{ margin: "6px 0 0 18px", fontSize: 13 }}>
                  {warnings.slice(0, 20).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <table className="admin-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>일정표 방문직원</th>
                  <th>담당 어르신</th>
                  <th>방문</th>
                  <th>앱에 보여 줄 선생님</th>
                </tr>
              </thead>
              <tbody>
                {byStaff.map((g) => {
                  const chosen = staff.find((s) => s.id === mapping[g.name]);
                  return (
                    <tr key={g.name} style={chosen ? undefined : { background: "rgba(220,120,0,.08)" }}>
                      <td>{g.name}</td>
                      <td style={{ fontSize: 13 }}>{g.elders.join(", ")}</td>
                      <td>{g.visits}건</td>
                      <td>
                        <select
                          value={mapping[g.name] ?? ""}
                          onChange={(e) => setMapping({ ...mapping, [g.name]: e.target.value })}
                        >
                          <option value="">— 연결 안 함 —</option>
                          {(g.candidates.length ? g.candidates : staff).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                              {s.dept ? ` (${s.dept})` : ""}
                              {s.app ? "" : " · 앱 미연결"}
                            </option>
                          ))}
                          {g.candidates.length > 0 && <option disabled>──────</option>}
                          {g.candidates.length > 0 &&
                            staff
                              .filter((s) => !g.candidates.includes(s))
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                  {s.dept ? ` (${s.dept})` : ""}
                                </option>
                              ))}
                        </select>
                        {!chosen && (
                          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                            {g.candidates.length > 1
                              ? "같은 이름이 여러 명입니다. 골라 주세요."
                              : "명단에 없는 이름입니다. 나중에 앱에 가입하면 이름으로 자동 연결됩니다."}
                          </div>
                        )}
                        {chosen && !chosen.app && (
                          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>아직 앱을 연결하지 않은 선생님입니다.</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p style={{ fontSize: 14, marginTop: 10 }}>
              선생님 {byStaff.length - unmatched.length}명 · 방문 {shownVisits}건이 앱에 보입니다
              {unmatched.length > 0 && ` (연결 안 된 이름 ${unmatched.length}명)`}.
            </p>
            <button className="btn small" type="button" style={{ width: "auto" }} disabled={busy} onClick={publish}>
              {busy ? "게시하는 중..." : `${month ? monthLabel(month) : ""} 일정표 게시`}
            </button>
            {/* 표가 길어 위쪽 오류 칸이 화면 밖일 수 있어 버튼 옆에도 보인다 */}
            {error && <div className="form-error" style={{ marginTop: 8 }}>{error}</div>}
          </div>
        )}
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>달</th>
            <th>파일</th>
            <th>방문</th>
            <th>올린 시각</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {schedules.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                아직 올린 일정표가 없습니다.
              </td>
            </tr>
          )}
          {schedules.map((s) => (
            <tr key={s.id}>
              <td>{monthLabel(s.month)}</td>
              <td style={{ fontSize: 13 }}>
                {s.file_name ?? "-"}
                {s.page_count ? ` (${s.page_count}쪽)` : ""}
              </td>
              <td>
                {s.visits}건 (앱 연결 {s.matched}건)
              </td>
              <td>{formatKst(s.created_at)}</td>
              <td>
                <button className="edit-link" type="button" onClick={() => remove(s)}>
                  지우기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
