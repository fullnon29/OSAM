import type { SupabaseClient } from "@supabase/supabase-js";
import { pushConfigured, sendPush } from "@/lib/fcm";

// 센터가 새 공지를 올리면 앱이 연결된 재직 직원 전원의 폰(푸시 등록된 폰)에 알림을 보냅니다.
export async function pushNotice(
  admin: SupabaseClient,
  notice: { id: string; title: string; body: string; requiresAck: boolean }
): Promise<{ pushed: number; devices: number; errors: string[] }> {
  if (!pushConfigured()) return { pushed: 0, devices: 0, errors: ["FIREBASE_SERVICE_ACCOUNT 가 설정되어 있지 않습니다."] };
  const { data: profs } = await admin.from("profiles").select("id").eq("is_active", true).in("role", ["employee", "social_worker", "admin"]);
  const active = new Set((profs ?? []).map((p) => p.id as string));
  const { data: toks } = await admin.from("guide_push_tokens").select("token, employee_id");
  const tokens = [...new Set((toks ?? []).filter((t) => active.has(t.employee_id as string)).map((t) => String(t.token)))];
  if (!tokens.length) return { pushed: 0, devices: 0, errors: [] };

  const preview = notice.body.replace(/\s+/g, " ").trim().slice(0, 80);
  const r = await sendPush(tokens, {
    title: "센터 공지",
    body: `${notice.title}${notice.requiresAck ? " (확인해 주세요)" : ""}${preview ? " — " + preview : ""}`.slice(0, 160),
    data: { type: "notice", noticeId: notice.id },
    channelId: "notice",
  });
  if (r.invalid.length) await admin.from("guide_push_tokens").delete().in("token", r.invalid);
  return { pushed: r.sent, devices: tokens.length, errors: r.errors };
}
