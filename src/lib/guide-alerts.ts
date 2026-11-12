import type { SupabaseClient } from "@supabase/supabase-js";
import { alertWindow, coverage, shortDateKo } from "@/lib/kr-holidays";
import { normName } from "@/lib/guide";
import { pushConfigured, sendPush } from "@/lib/fcm";

// 주말·휴일 일정 안내: 쉬는 날 전 마지막 근무일 15:00(KST)에, 쉬는 날 동안 「가족이 아닌 일반 케어」 방문이 있는 선생님에게
// 어르신별 방문 일정과 안내 문구를 푸시 + 앱 알림으로 보냅니다.

export type OffVisit = { date: string; start: string; end: string };
export type OffItem = { elder: string; visits: OffVisit[] };

export type VisitRow = {
  month: string;
  day: number;
  start_time: string;
  end_time: string;
  elder_name: string;
  staff_name: string;
  employee_id: string | null;
  tags: string[] | null;
};

const CLOSING = "태그 문제 없이 찍어주시고, 혹시 센터에 연락이 안 될 시 앱에 메모 부탁드립니다. 감사합니다!";
const hm = (s: string) => String(s ?? "").slice(0, 5);

/** 쉬는 날(off) 동안의 일반(가족 표시 없는) 방문을 선생님별·어르신별로 묶습니다. 선생님 키는 employee_id, 없으면 "name:이름". */
export function groupOffVisits(rows: VisitRow[], off: Set<string>): Map<string, OffItem[]> {
  const byStaff = new Map<string, Map<string, OffItem>>();
  for (const r of rows) {
    if ((r.tags ?? []).includes("가족")) continue;
    const date = `${r.month}-${String(r.day).padStart(2, "0")}`;
    if (!off.has(date)) continue;
    const key = r.employee_id ?? "name:" + normName(r.staff_name);
    const elders = byStaff.get(key) ?? new Map<string, OffItem>();
    const item = elders.get(normName(r.elder_name)) ?? { elder: r.elder_name, visits: [] };
    item.visits.push({ date, start: hm(r.start_time), end: hm(r.end_time) });
    elders.set(normName(r.elder_name), item);
    byStaff.set(key, elders);
  }
  const out = new Map<string, OffItem[]>();
  for (const [k, elders] of byStaff) {
    const list = [...elders.values()].map((i) => ({ ...i, visits: i.visits.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)) }));
    out.set(k, list.sort((a, b) => a.elder.localeCompare(b.elder, "ko")));
  }
  return out;
}

/** 앱 알림에 보이는 전체 글 */
export function alertBody(items: OffItem[]): string {
  const blocks = items.map(
    (i) => `${i.elder} 어르신 주말·휴일 일정 안내 드립니다.\n` + i.visits.map((v) => `· ${shortDateKo(v.date)} ${v.start}~${v.end}`).join("\n")
  );
  return blocks.join("\n\n") + "\n\n" + CLOSING;
}

/** 폰 상단 알림에 뜨는 짧은 글 */
export function pushBody(items: OffItem[]): string {
  const names = items.slice(0, 3).map((i) => i.elder);
  const label = items.length > 3 ? `${names.join(", ")} 외 ${items.length - 3}분` : names.join(", ");
  return `${label} 어르신 주말·휴일 일정 안내 드립니다. ${CLOSING}`;
}

export const ALERT_TITLE = "주말·휴일 일정 안내";

export type RunResult = {
  ok: boolean;
  date: string;
  skipped?: string;
  offDays?: string[];
  teachers?: number;
  created?: number;
  alreadySent?: number;
  pushed?: number;
  noToken?: number;
  failed?: string[];
  notes?: string[];
};

/**
 * 오늘이 안내하는 날이면 안내를 만들고 푸시를 보냅니다.
 *  - dry: 계산만(저장·발송 없음)
 *  - 같은 날 다시 불러도 이미 보낸 선생님에게는 다시 보내지 않습니다(unique: 선생님·종류·날짜).
 */
export async function runOffdayAlerts(admin: SupabaseClient, opts: { today: string; dry?: boolean }): Promise<RunResult> {
  const { today, dry } = opts;
  const notes: string[] = [];
  const year = Number(today.slice(0, 4));
  if (!coverage(year)) notes.push(`${year}년 음력 공휴일(설·추석·부처님오신날) 표가 없어 연휴 날짜가 어긋날 수 있습니다. src/lib/kr-holidays.ts 를 갱신해 주세요.`);

  const { data: extraRows } = await admin.from("guide_holidays").select("day");
  const extra = new Set((extraRows ?? []).map((r) => String(r.day)));
  const off = alertWindow(today, extra);
  if (!off) return { ok: true, date: today, skipped: "오늘은 쉬는 날 전 마지막 근무일이 아닙니다.", notes };

  const offSet = new Set(off);
  const months = [...new Set(off.map((d) => d.slice(0, 7)))];
  const rows: VisitRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await admin
      .from("guide_schedule_visits")
      .select("month, day, start_time, end_time, elder_name, staff_name, employee_id, tags")
      .in("month", months)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error("일정을 읽지 못했습니다: " + error.message);
    rows.push(...((data ?? []) as VisitRow[]));
    if (!data || data.length < 1000) break;
  }
  if (!rows.length) return { ok: true, date: today, offDays: off, teachers: 0, skipped: "게시된 일정이 없습니다.", notes };

  // 재직 직원(이름으로도 찾기 위해)
  const { data: profs } = await admin.from("profiles").select("id, name, is_active").in("role", ["employee", "social_worker"]).eq("is_active", true);
  const active = new Map((profs ?? []).map((p) => [p.id as string, String(p.name)]));
  const byName = new Map<string, string | null>();
  for (const p of profs ?? []) {
    const k = normName(String(p.name));
    byName.set(k, byName.has(k) ? null : (p.id as string));
  }

  const grouped = groupOffVisits(rows, offSet);
  // 이름으로만 잡힌 선생님은 재직 직원 한 명에 맞을 때만 보냅니다.
  const targets = new Map<string, OffItem[]>();
  for (const [key, items] of grouped) {
    const id = key.startsWith("name:") ? byName.get(key.slice(5)) ?? null : key;
    if (!id || !active.has(id)) {
      notes.push(`안내 대상에서 뺀 선생님(앱 직원과 맞지 않음): ${key.startsWith("name:") ? key.slice(5) : key}`);
      continue;
    }
    targets.set(id, [...(targets.get(id) ?? []), ...items]);
  }

  const result: RunResult = { ok: true, date: today, offDays: off, teachers: targets.size, created: 0, alreadySent: 0, pushed: 0, noToken: 0, failed: [], notes };
  if (dry) return result;

  const configured = pushConfigured();
  if (!configured) notes.push("FIREBASE_SERVICE_ACCOUNT 가 없어 푸시는 보내지 못하고 앱 알림만 만들었습니다.");

  for (const [employeeId, items] of targets) {
    const name = active.get(employeeId) ?? employeeId;
    const body = alertBody(items);
    const ins = await admin
      .from("guide_alerts")
      .upsert({ employee_id: employeeId, kind: "offday", alert_date: today, title: ALERT_TITLE, body, items }, { onConflict: "employee_id,kind,alert_date", ignoreDuplicates: true })
      .select("id, push_sent_at");
    if (ins.error) {
      result.failed!.push(`${name}: ${ins.error.message}`);
      continue;
    }
    let alertId = ins.data?.[0]?.id as string | undefined;
    if (!alertId) {
      // 이미 있는 안내: 푸시를 아직 못 보냈다면 다시 시도합니다.
      const ex = await admin.from("guide_alerts").select("id, push_sent_at").eq("employee_id", employeeId).eq("kind", "offday").eq("alert_date", today).single();
      if (ex.data?.push_sent_at) {
        result.alreadySent!++;
        continue;
      }
      alertId = ex.data?.id as string | undefined;
    } else {
      result.created!++;
    }
    if (!alertId) continue;

    const { data: toks } = await admin.from("guide_push_tokens").select("token").eq("employee_id", employeeId);
    const tokens = (toks ?? []).map((t) => String(t.token));
    if (!tokens.length) {
      result.noToken!++;
      await admin.from("guide_alerts").update({ push_result: "앱에 푸시 등록이 없어 앱 알림으로만 전달" }).eq("id", alertId);
      continue;
    }
    if (!configured) continue;
    const r = await sendPush(tokens, { title: ALERT_TITLE, body: pushBody(items), data: { type: "offday", alertId, date: today } });
    if (r.invalid.length) await admin.from("guide_push_tokens").delete().in("token", r.invalid);
    await admin
      .from("guide_alerts")
      .update({
        push_sent_at: r.sent ? new Date().toISOString() : null,
        push_result: `${tokens.length}대 중 ${r.sent}대 보냄` + (r.invalid.length ? ` · 쓸 수 없는 토큰 ${r.invalid.length}개 정리` : "") + (r.errors.length ? ` · 오류: ${r.errors[0]}` : ""),
      })
      .eq("id", alertId);
    if (r.sent) result.pushed!++;
    else result.failed!.push(`${name}: ${r.errors[0] ?? "푸시를 보내지 못했습니다."}`);
  }
  return result;
}
