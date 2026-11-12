import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runOffdayAlerts } from "@/lib/guide-alerts";

export const maxDuration = 60;

const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

// Supabase 예약(pg_cron)이 매일 15:00(KST)에 부릅니다. 오늘이 「쉬는 날 전 마지막 근무일」이면 안내를 만들어 푸시를 보냅니다.
// 인증: Authorization: Bearer <GUIDE_CRON_SECRET>
// 시험: ?date=YYYY-MM-DD(그 날짜로 계산) &dry=1(저장·발송 없이 계산만)
async function handle(request: Request) {
  const secret = process.env.GUIDE_CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : kstToday();
  try {
    const r = await runOffdayAlerts(createAdminClient(), { today, dry: url.searchParams.get("dry") === "1" });
    return NextResponse.json(r);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, date: today, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
