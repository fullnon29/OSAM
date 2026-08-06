import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1)];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error: logError } = await admin
  .from("completion_edit_logs")
  .delete()
  .not("id", "is", null);
if (logError) throw logError;

const { data: completions, error: compError } = await admin
  .from("course_completions")
  .select("employee_id, course_id");
if (compError) throw compError;

for (const c of completions ?? []) {
  await admin.storage
    .from("certificates")
    .remove([`${c.employee_id}/${c.course_id}.pdf`]);
}

const { error: delError } = await admin
  .from("course_completions")
  .delete()
  .not("id", "is", null);
if (delError) throw delError;

console.log(`정리 완료: 이수기록 ${completions?.length ?? 0}건 + 수정로그 삭제`);
