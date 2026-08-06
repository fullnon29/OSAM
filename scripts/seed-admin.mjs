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

const STAFF_EMAIL_DOMAIN = "osam-staff.local";
const usernameToEmail = (u) => `${u.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function upsertStaff({ username, password, name, dept, role }) {
  const email = usernameToEmail(username);

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("employee_no", username)
    .maybeSingle();

  let userId;
  if (existing) {
    userId = existing.id;
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) {
      if (createError.code !== "email_exists") throw createError;
      let page = 1;
      let found;
      while (!found) {
        const { data: list, error: listError } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (listError) throw listError;
        found = list.users.find((u) => u.email === email);
        if (found || list.users.length === 0) break;
        page += 1;
      }
      if (!found) throw new Error(`이메일 ${email} 사용자를 찾을 수 없습니다.`);
      userId = found.id;
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        password,
      });
      if (updateError) throw updateError;
    } else {
      userId = created.user.id;
    }
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    employee_no: username,
    name,
    dept: dept ?? null,
    role,
    is_active: true,
  });
  if (profileError) throw profileError;

  console.log(`OK: ${role} ${name} (${username}) -> ${userId}`);
}

const args = process.argv.slice(2);
const [username, password, name, dept, role] = args;

if (!username || !password || !name) {
  console.error(
    "사용법: node scripts/seed-admin.mjs <아이디> <비밀번호> <이름> [부서] [role=admin|employee]"
  );
  process.exit(1);
}

await upsertStaff({
  username,
  password,
  name,
  dept: dept || null,
  role: role || "admin",
});
