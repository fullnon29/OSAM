import "server-only";
import { createSign } from "node:crypto";

// 구글 FCM(HTTP v1)으로 푸시를 보냅니다. 바깥 꾸러미 없이 서비스 계정 키로 직접 서명합니다.
// 환경변수 FIREBASE_SERVICE_ACCOUNT 에 Firebase 서비스 계정 키(JSON 전체)를 넣어 두어야 합니다.

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function account(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as ServiceAccount;
    if (!j.project_id || !j.client_email || !j.private_key) return null;
    return { ...j, private_key: j.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

export const pushConfigured = () => account() !== null;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

let cached: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error("FCM 인증 실패: " + (j.error_description ?? res.status));
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

export type PushResult = { sent: number; invalid: string[]; errors: string[] };

/** tokens 로 같은 알림을 보냅니다. 더는 쓸 수 없는 토큰(앱 삭제 등)은 invalid 로 돌려줍니다. */
export async function sendPush(
  tokens: string[],
  msg: { title: string; body: string; data?: Record<string, string>; channelId?: string }
): Promise<PushResult> {
  const out: PushResult = { sent: 0, invalid: [], errors: [] };
  const sa = account();
  if (!sa) {
    out.errors.push("FIREBASE_SERVICE_ACCOUNT 가 설정되어 있지 않습니다.");
    return out;
  }
  let at: string;
  try {
    at = await accessToken(sa);
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : String(e));
    return out;
  }
  // 한꺼번에 10대씩 보냅니다(직원 수십 명에게 보내도 몇 초 안에 끝나도록).
  const sendOne = async (token: string) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: msg.body },
          data: msg.data ?? {},
          android: { priority: "HIGH", notification: { channel_id: msg.channelId ?? "offday", sound: "default" } },
        },
      }),
    });
    if (res.ok) {
      out.sent++;
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
    const status = j.error?.status ?? String(res.status);
    if (status === "UNREGISTERED" || status === "INVALID_ARGUMENT" || status === "NOT_FOUND") out.invalid.push(token);
    else out.errors.push(`${status}: ${j.error?.message ?? ""}`.slice(0, 200));
  };
  for (let i = 0; i < tokens.length; i += 10) await Promise.all(tokens.slice(i, i + 10).map(sendOne));
  return out;
}
