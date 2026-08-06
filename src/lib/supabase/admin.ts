import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service role(secret key) 클라이언트. RLS를 우회하므로 API 라우트 등 서버 코드에서만 사용합니다.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
