import { employeeFromRequest, guideJson, guidePreflight } from "@/lib/guide";

export const OPTIONS = guidePreflight;

// 앱: 센터 공지 목록(최신순)과 내가 확인했는지
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에서 QR로 다시 연결해 주세요." }, 401);
  const { admin, employee } = who;

  const { data: notices } = await admin
    .from("guide_notices")
    .select("id, title, body, link_url, requires_ack, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(50);
  const { data: reads } = await admin
    .from("guide_notice_reads")
    .select("notice_id, read_at")
    .eq("employee_id", employee.id);
  const readAt = new Map((reads ?? []).map((r) => [r.notice_id, r.read_at]));

  return guideJson(request, {
    notices: (notices ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      linkUrl: n.link_url,
      requiresAck: n.requires_ack,
      createdAt: n.created_at,
      readAt: readAt.get(n.id) ?? null,
    })),
  });
}

// 앱: 「확인했습니다」 body: { noticeId }
export async function POST(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에서 QR로 다시 연결해 주세요." }, 401);
  const { admin, employee } = who;
  const { noticeId } = await request.json().catch(() => ({}));

  const { data: notice } = await admin.from("guide_notices").select("id").eq("id", noticeId).eq("is_active", true).maybeSingle();
  if (!notice) return guideJson(request, { error: "공지를 찾을 수 없습니다." }, 404);

  // 처음 확인한 시각을 남긴다 (다시 눌러도 바꾸지 않음)
  const { error } = await admin
    .from("guide_notice_reads")
    .upsert({ notice_id: notice.id, employee_id: employee.id }, { onConflict: "notice_id,employee_id", ignoreDuplicates: true });
  if (error) {
    console.error(error);
    return guideJson(request, { error: "저장 중 오류가 발생했습니다." }, 500);
  }
  return guideJson(request, { ok: true });
}
