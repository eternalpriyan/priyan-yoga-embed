// Weekly-theme data access + transform.
//
// Source is NOT Oclass — it's the same Notion "Curriculum" database the
// npsoy-website hero reads from. Each row is a week's theme (name, category,
// summary, cover image). We surface the *current* week's theme for a hero block.
//
// SECURITY: like the Oclass side, `toPublicTheme` is a hand-picked allowlist.
// Never return a raw Notion page. The Notion key is full-access on that
// integration's shared databases — keep it server-side only.
//
// IMAGE NOTE: Notion cover images are time-limited signed S3 URLs (~1h expiry),
// so we never hand that URL to the browser. The public JSON exposes only
// `hasImage`; the actual bytes are served by the API's image proxy, which
// re-fetches a fresh signed URL from Notion on each (edge-cached) request.

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
// The "Curriculum" DB shared with the Notion integration (same id the website
// uses). One row per weekly theme.
const CURRICULUM_DB_ID = "5d4f80ab-4f45-406c-aa56-311cbf8154fb";

// ---- Raw Notion shapes (only the bits we read) -----------------------------

interface RawCover {
  type?: string;
  file?: { url?: string };
  external?: { url?: string };
}

interface RawThemePage {
  id: string;
  cover?: RawCover | null;
  properties?: Record<string, any>;
}

interface NotionQueryResult {
  results?: RawThemePage[];
}

// ---- Public (curated) shape ------------------------------------------------

export interface PublicTheme {
  name: string;
  week: number | null;
  category: string | null;
  subCategory: string | null;
  scheduled: string | null; // YYYY-MM-DD this theme's week begins
  summary: string | null; // student-facing description
  youtubeLink: string | null; // optional demo video
  hasImage: boolean; // whether a cover exists (served via the image proxy)
}

// ---- Helpers ---------------------------------------------------------------

function plainTitle(prop: any): string {
  return prop?.title?.[0]?.plain_text ?? "";
}
function plainRich(prop: any): string | null {
  return prop?.rich_text?.[0]?.plain_text ?? null;
}
function selectName(prop: any): string | null {
  return prop?.select?.name ?? null;
}

// The signed cover URL for a page (file = expiring S3, external = stable), or
// null. Server-side only — used by the image proxy, never serialized.
export function coverUrlOf(page: RawThemePage | null): string | null {
  const c = page?.cover;
  return c?.file?.url ?? c?.external?.url ?? null;
}

// ---- Transform (pure, testable) --------------------------------------------

export function toPublicTheme(page: RawThemePage): PublicTheme {
  const p = page.properties ?? {};
  return {
    name: plainTitle(p.Name),
    week: typeof p.Week?.number === "number" ? p.Week.number : null,
    category: selectName(p.Category),
    subCategory: selectName(p["Sub-Category"]),
    scheduled: p.Scheduled?.date?.start ?? null,
    summary: plainRich(p.Summary),
    youtubeLink: plainRich(p["Youtube Link"]),
    hasImage: Boolean(coverUrlOf(page)),
  };
}

// ---- Notion fetch ----------------------------------------------------------

async function notionQuery(key: string, body: object): Promise<NotionQueryResult> {
  const res = await fetch(`${NOTION_BASE}/databases/${CURRICULUM_DB_ID}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Notion ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  return (await res.json()) as NotionQueryResult;
}

// Plain YYYY-MM-DD for `now` in Singapore time (the schedule's timezone).
function sgDate(now: Date): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(now);
}

// The current week's theme = the most recent row whose Scheduled date is on or
// before today; if none has started yet, the soonest upcoming. Mirrors the
// website's getCurrentWeekTheme().
export async function fetchCurrentThemePage(key: string, now: Date): Promise<RawThemePage | null> {
  const today = sgDate(now);

  const current = await notionQuery(key, {
    filter: { property: "Scheduled", date: { on_or_before: today } },
    sorts: [{ property: "Scheduled", direction: "descending" }],
    page_size: 1,
  });
  if (current.results?.length) return current.results[0] ?? null;

  const upcoming = await notionQuery(key, {
    filter: { property: "Scheduled", date: { on_or_after: today } },
    sorts: [{ property: "Scheduled", direction: "ascending" }],
    page_size: 1,
  });
  return upcoming.results?.[0] ?? null;
}

// ---- Orchestration ---------------------------------------------------------

export async function getCurrentTheme(key: string, now: Date): Promise<PublicTheme | null> {
  const page = await fetchCurrentThemePage(key, now);
  return page ? toPublicTheme(page) : null;
}
