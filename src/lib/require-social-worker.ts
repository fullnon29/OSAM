import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireSocialWorker() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "로그인이 필요합니다." as const, status: 401 as const };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "social_worker" && profile.role !== "admin")) {
    return { error: "사회복지사 또는 관리자만 접근할 수 있습니다." as const, status: 403 as const };
  }

  return { admin, profile };
}
