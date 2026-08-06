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

const EMPLOYEES = [
  { username: "kimminji", name: "김민지", dept: "요양보호팀", password: "osam1234" },
  { username: "parksh", name: "박수현", dept: "요양보호팀", password: "osam1234" },
  { username: "leejw", name: "이지원", dept: "방문간호팀", password: "osam1234" },
];

const COURSES = [
  { name: "감염관리 및 예방", category: "안전·감염" },
  { name: "노인학대 예방", category: "필수교육" },
  { name: "응급처치", category: "안전·감염" },
  { name: "치매케어 실무", category: "치매·인지" },
  { name: "인권보호와 직업윤리", category: "필수교육" },
  { name: "요양보호 기술 실습", category: "요양보호실무" },
  { name: "개인정보보호", category: "필수교육" },
  { name: "산업안전보건", category: "안전·감염" },
  { name: "의사소통과 정서지원", category: "요양보호실무" },
  { name: "식이 및 영양관리", category: "요양보호실무" },
  { name: "욕창예방 및 관리", category: "치매·인지" },
  { name: "성희롱 예방교육", category: "센터 자체교육" },
];

async function upsertEmployee({ username, password, name, dept }) {
  const email = usernameToEmail(username);
  let userId;

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
  } else {
    userId = created.user.id;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    employee_no: username,
    name,
    dept,
    role: "employee",
    is_active: true,
  });
  if (profileError) throw profileError;

  console.log(`직원 등록: ${name} (${username}) -> ${userId}`);
}

async function upsertCourses() {
  const year = new Date().getFullYear();
  const rows = COURSES.map((c, i) => ({
    year,
    name: c.name,
    category: c.category,
    duration_min: 20,
    is_required: true,
    is_active: true,
    sort_order: i,
  }));
  const { error } = await admin.from("courses").upsert(rows, { onConflict: "year,name" });
  if (error) throw error;
  console.log(`교육 과정 ${rows.length}개 등록 완료`);
}

for (const emp of EMPLOYEES) {
  await upsertEmployee(emp);
}
await upsertCourses();
