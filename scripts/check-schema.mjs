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

for (const table of [
  "profiles",
  "courses",
  "course_completions",
  "completion_edit_logs",
  "consultation_requests",
]) {
  const { error, count } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  console.log(table, error ? `ERROR: ${error.message}` : `OK (count=${count})`);
}

const { data: buckets, error: bErr } = await admin.storage.listBuckets();
console.log("buckets:", bErr ? bErr.message : buckets.map((b) => b.name));
