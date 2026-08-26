import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// 모아 둔 서술 문장을 꺼내 쓰는 곳.
//
//   센터 글투  — 모든 어르신의 문장에서 고른 대표 예문. 누구의 기록을 쓰든 똑같이 씁니다.
//   지난 서술  — 그 어르신 본인의 과거 문장. 과거와 지금이 어긋나지 않게 하려는 것입니다.

export type NarrativeSample = {
  section: string;
  body: string;
  document_date: string | null;
};

/** 예문으로 쓰기 좋은 길이. 너무 짧으면 형식이 안 보이고 너무 길면 곁가지가 많습니다. */
const MIN_LEN = 40;
const MAX_LEN = 220;

/** 갈래마다 이만큼씩 예문을 보여 줍니다. */
const PER_SECTION = 3;

/** 예문을 뽑을 갈래. 순서를 고정해야 AI에 보내는 앞부분이 매번 같습니다. */
const SECTIONS = [
  "신체상태",
  "질병상태",
  "인지상태",
  "의사소통",
  "영양상태",
  "가족환경",
  "주관적욕구",
  "자원이용",
  "총평",
] as const;

/**
 * 한 번 고른 예문은 서버가 살아 있는 동안 다시 씁니다.
 *
 * 모든 어르신에게 똑같이 쓰는 내용이라 매번 조회할 이유가 없고,
 * 늘 같은 글이 앞에 붙어야 요청 비용도 아낄 수 있습니다(프롬프트 캐시).
 */
let cached: { at: number; value: Record<string, string[]> } | null = null;
const CACHE_MS = 30 * 60 * 1000;

/**
 * 센터 글투 예문.
 *
 * 갈래마다 따로 조회합니다. 한 번에 받으면 서버가 1,000행에서 끊어
 * 뒤쪽 갈래가 통째로 빠지기 때문입니다.
 */
export async function getHouseSamples(
  db: SupabaseClient
): Promise<Record<string, string[]>> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const picked: Record<string, string[]> = {};

  await Promise.all(
    SECTIONS.map(async (section) => {
      const { data, error } = await db
        .from("narrative_samples")
        .select("body")
        .eq("section", section)
        // 늘 같은 예문이 나오도록 순서를 고정합니다.
        .order("id")
        .limit(300);
      if (error || !data) return;

      const usable = (data as { body: string }[])
        .map((row) => row.body.trim())
        .filter((body) => body.length >= MIN_LEN && body.length <= MAX_LEN);

      // 판단 방법이 드러난 문장을 먼저 씁니다. 공단이 요구하는 형식이기 때문입니다.
      const preferred = usable.filter((body) => /판단|관찰|상담|확인/.test(body));
      // 그런 문장이 없는 갈래(희망 서비스 등)는 그냥 있는 문장을 씁니다.
      // 갈래가 통째로 빠지면 그 항목만 글투가 달라지기 때문입니다.
      const bucket = (preferred.length ? preferred : usable).slice(0, PER_SECTION);
      if (bucket.length) picked[section] = bucket;
    })
  );

  // 순서를 고정해 담습니다.
  const ordered: Record<string, string[]> = {};
  for (const section of SECTIONS) {
    if (picked[section]) ordered[section] = picked[section];
  }

  cached = { at: Date.now(), value: ordered };
  return ordered;
}

/** 그 어르신의 지난 서술. 최신 것부터 보여 줍니다. */
export async function getRecipientNarratives(
  db: SupabaseClient,
  recipientId: string,
  limit = 12
): Promise<NarrativeSample[]> {
  const { data, error } = await db
    .from("narrative_samples")
    .select("section, body, document_date")
    .eq("care_recipient_id", recipientId)
    .order("document_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data) return [];
  return data as NarrativeSample[];
}

/** 일지 6·7항(상담기록·향후계획)을 최신순으로 가져옵니다. */
export async function getWorklogNotes(
  db: SupabaseClient,
  recipientId: string,
  limit = 24
): Promise<NarrativeSample[]> {
  const { data, error } = await db
    .from("narrative_samples")
    .select("section, body, document_date")
    .eq("care_recipient_id", recipientId)
    .in("section", ["상담기록", "향후계획"])
    .order("document_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data) return [];
  return data as NarrativeSample[];
}

/** 예문을 AI에게 보여 줄 글로 만듭니다. */
export function formatHouseSamples(samples: Record<string, string[]>): string {
  const parts: string[] = [];
  for (const [section, bodies] of Object.entries(samples)) {
    if (!bodies.length) continue;
    parts.push(`### ${section}`);
    for (const body of bodies) parts.push(`- ${body}`);
  }
  if (!parts.length) return "";
  return `우리 센터가 실제로 써 온 문장 (이 형식을 그대로 따르십시오):\n\n${parts.join("\n")}`;
}

/** 그 어르신의 지난 서술을 AI에게 보여 줄 글로 만듭니다. */
export function formatRecipientHistory(samples: NarrativeSample[]): string {
  if (!samples.length) return "";
  const lines = samples.map(
    (s) => `- (${s.document_date ?? "날짜 미상"} · ${s.section}) ${s.body}`
  );
  return (
    "이 어르신의 지난 기록에서 가져온 서술입니다.\n" +
    "- 과거 병력·수술 이력·가족관계처럼 잘 바뀌지 않는 사실만 여기서 가져다 쓸 수 있습니다.\n" +
    "- 지금의 기능·상태·필요한 지원은 이번 문답만 근거로 삼으십시오. " +
    "지난 기록의 상태는 이미 달라졌을 수 있습니다.\n" +
    "- 이번 문답과 어긋나면 언제나 이번 문답을 따르십시오.\n\n" +
    lines.join("\n")
  );
}
