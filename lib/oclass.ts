// Oclass data access + transform.
//
// SECURITY: the Oclass token is full-access. Everything that leaves this file
// via `toPublicCourse` is a hand-picked allowlist. Never return a raw Oclass
// object to a caller — add fields here deliberately, one at a time.

const OCLASS_BASE = "https://api.oclass.app";

// ---- Raw Oclass shapes (only the bits we read) -----------------------------

interface RawVenue {
  name?: string;
  capacity?: number;
  is_online?: boolean;
  branch?: { name?: string; address?: string };
}

interface RawCategory {
  id?: number;
  name?: string;
  order?: number;
}

interface RawRecurrence {
  dtstart?: string; // cohort start, plain YYYY-MM-DD
  until?: string; // cohort end, plain YYYY-MM-DD
}

interface RawCourse {
  id: number;
  code?: string;
  title?: string;
  description?: string;
  cover_image?: string | null;
  color_code?: string | null;
  duration?: number | null;
  credits_required?: string | null;
  publish?: boolean;
  archived?: boolean;
  online_enrollment?: boolean;
  upcoming_schedule_count?: number;
  categories?: RawCategory[];
  recurrences?: RawRecurrence[];
}

interface RawSchedule {
  id?: number;
  start_datetime?: string;
  venue?: RawVenue;
}

interface Paginated<T> {
  count: number;
  results: T[];
}

// The next real session of a course (accurate datetime + venue), or null.
export interface NextSession {
  scheduleId: number | undefined; // Oclass schedule id — used for the enrol deep link
  startDatetime: string; // ISO 8601 with +08:00 offset, straight from Oclass
  venue: RawVenue | undefined;
}

// ---- Public (curated) shape ------------------------------------------------

export interface PublicCourse {
  id: number;
  code: string | null;
  title: string;
  summary: string; // plaintext excerpt, tags stripped
  descriptionHtml: string; // marketing copy (already public on Oclass site)
  coverImage: string | null;
  color: string | null;
  durationMin: number | null;
  creditsRequired: string | null;
  categories: { id: number | null; name: string }[];
  upcomingSessions: number;
  // Cohort span (plain dates from the recurrence definition):
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  dateLabel: string | null; // smart range, e.g. "4 Apr – 14 Jun 2026"
  ongoing: boolean; // today is within [startDate, endDate] (SG time) — enrol closed
  // Next actual upcoming session (used for sorting + the enrol link):
  nextStart: string | null; // ISO 8601
  nextStartLabel: string | null; // e.g. "Sat, 6 Jun 2026"
  venue: { name: string | null; branch: string | null; address: string | null } | null;
  onlineEnrollment: boolean;
  enrolUrl: string;
}

// ---- Helpers ---------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text: string, max = 200): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

// Format an ISO datetime as a weekday label in Singapore time.
function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(iso));
}

// Today's date as plain YYYY-MM-DD in Singapore time (the cohort dates' tz).
function sgToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(now);
}

// Is today within the cohort span? Plain YYYY-MM-DD strings compare
// lexicographically, which matches chronological order for ISO dates.
function isOngoing(startDate: string | null, endDate: string | null, now: Date): boolean {
  if (!startDate || !endDate) return false;
  const today = sgToday(now);
  return startDate <= today && today <= endDate;
}

// Parse a plain YYYY-MM-DD into parts (no Date object → no timezone drift).
function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

// Smart cohort-span label from two plain dates. Collapses shared month/year:
//   same day            -> "4 Apr 2026"
//   same month + year   -> "4–14 Jun 2026"
//   same year           -> "4 Apr – 14 Jun 2026"
//   different years      -> "5 Sep 2026 – 14 Jun 2027"
function rangeLabel(start: string | null, end: string | null): string | null {
  const s = start ? parseYmd(start) : null;
  if (!s) return null;
  const e = end ? parseYmd(end) : null;
  const day = (p: { y: number; m: number; d: number }) => `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;

  if (!e || (e.y === s.y && e.m === s.m && e.d === s.d)) return day(s);
  if (e.y === s.y && e.m === s.m) return `${s.d}–${e.d} ${MONTHS[s.m - 1]} ${s.y}`;
  if (e.y === s.y) return `${s.d} ${MONTHS[s.m - 1]} – ${e.d} ${MONTHS[e.m - 1]} ${s.y}`;
  return `${day(s)} – ${day(e)}`;
}

// Cohort start/end from the recurrence definition (plain dates, tz-free).
function cohortRange(course: RawCourse): { startDate: string | null; endDate: string | null } {
  const recs = course.recurrences ?? [];
  const starts = recs.map((r) => r.dtstart).filter((x): x is string => !!x).sort();
  const ends = recs.map((r) => r.until).filter((x): x is string => !!x).sort();
  return {
    startDate: starts[0] ?? null,
    endDate: ends[ends.length - 1] ?? null,
  };
}

// ---- Transform (pure, testable) --------------------------------------------

export function toPublicCourse(
  course: RawCourse,
  next: NextSession | null,
  enrolBase: string,
  now: Date = new Date(),
): PublicCourse {
  const v = next?.venue;
  const plain = course.description ? stripHtml(course.description) : "";
  const { startDate, endDate } = cohortRange(course);

  return {
    id: course.id,
    code: course.code ?? null,
    title: course.title ?? "Untitled",
    summary: excerpt(plain),
    descriptionHtml: course.description ?? "",
    coverImage: course.cover_image ?? null,
    color: course.color_code ?? null,
    durationMin: course.duration ?? null,
    creditsRequired: course.credits_required ?? null,
    categories: (course.categories ?? [])
      .filter((c) => c.name)
      .map((c) => ({ id: c.id ?? null, name: c.name as string })),
    upcomingSessions: course.upcoming_schedule_count ?? 0,
    startDate,
    endDate,
    dateLabel: rangeLabel(startDate, endDate),
    ongoing: isOngoing(startDate, endDate, now),
    nextStart: next?.startDatetime ?? null,
    nextStartLabel: next ? fmtDateTime(next.startDatetime) : null,
    venue: v
      ? { name: v.name ?? null, branch: v.branch?.name ?? null, address: v.branch?.address ?? null }
      : null,
    onlineEnrollment: course.online_enrollment ?? false,
    // Deep link to the next session's enrolment page:
    //   {enrolBase}/enrollment/schedule/{scheduleId}
    enrolUrl: next?.scheduleId
      ? `${enrolBase}/enrollment/schedule/${next.scheduleId}`
      : enrolBase,
  };
}

// True if a course matches any of the requested categories (by name or id,
// case-insensitive). Empty filter = match everything.
export function matchesCategory(course: RawCourse, filter: string[]): boolean {
  if (!filter.length) return true;
  const wanted = new Set(filter.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return true;
  return (course.categories ?? []).some(
    (c) =>
      (c.name && wanted.has(c.name.toLowerCase())) ||
      (c.id != null && wanted.has(String(c.id))),
  );
}

// ---- Auth: login-based token, used until it 401s ---------------------------
//
// Oclass invalidates a token whenever ANY system sharing the credentials logs
// in, so a persisted token goes stale unpredictably. Instead of storing a
// token, we log in with email+password to mint one, keep using it until a
// request actually 401s, then re-login once and retry. No timer — a warm
// instance reuses its token indefinitely; a 401 (rotation/expiry) self-heals.
//
// Falls back to a static OCLASS_API_TOKEN when no credentials are configured
// (e.g. local runs without the login account).

let cachedToken: string | null = null;

async function login(): Promise<string> {
  const email = process.env.OCLASS_EMAIL;
  const password = process.env.OCLASS_PASSWORD;

  if (!email || !password) {
    const fallback = process.env.OCLASS_API_TOKEN;
    if (fallback) return (cachedToken = fallback);
    throw new Error("Oclass auth not configured (need OCLASS_EMAIL+OCLASS_PASSWORD or OCLASS_API_TOKEN)");
  }

  const res = await fetch(`${OCLASS_BASE}/com/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, company: process.env.OCLASS_COMPANY || "priyan-yoga" }),
  });
  if (!res.ok) {
    throw new Error(`Oclass login ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  const data = (await res.json()) as { key?: string };
  if (!data.key) throw new Error("Oclass login: no key in response");
  return (cachedToken = data.key);
}

async function token(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) return cachedToken;
  return login();
}

// ---- Oclass fetches --------------------------------------------------------

async function oclassGet<T>(path: string): Promise<T> {
  let res = await fetch(`${OCLASS_BASE}${path}`, {
    headers: { Authorization: `Token ${await token()}` },
  });
  // Stale token (another system logged in / it expired) → re-login once, retry.
  if (res.status === 401) {
    res = await fetch(`${OCLASS_BASE}${path}`, {
      headers: { Authorization: `Token ${await token(true)}` },
    });
  }
  if (!res.ok) {
    throw new Error(`Oclass ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  return (await res.json()) as T;
}

export async function fetchRawCourses(): Promise<RawCourse[]> {
  const data = await oclassGet<Paginated<RawCourse>>(
    "/com/service/klasses/?archived=false&canceled=false&is_course=true&offset=0&limit=100",
  );
  return data.results ?? [];
}

// The next future, non-cancelled session for a single course.
// `klass_id` is the working filter param (`klass`, `service`, `klass__id` are
// silently ignored by the API and return ALL schedules).
export async function fetchNextSession(klassId: number, now: Date): Promise<NextSession | null> {
  const from = encodeURIComponent(now.toISOString());
  const data = await oclassGet<Paginated<RawSchedule>>(
    `/com/schedule/schedules/?klass_id=${klassId}&start_datetime__gte=${from}` +
      `&canceled=false&ordering=start_datetime&limit=1`,
  );
  const row = data.results?.[0];
  if (!row?.start_datetime) return null;
  return { scheduleId: row.id, startDatetime: row.start_datetime, venue: row.venue };
}

// ---- Orchestration ---------------------------------------------------------

// Sort by soonest real next session; courses without one fall to the bottom,
// then alphabetical. (Shared by the grid and the single-course lookup.)
function bySoonest(a: PublicCourse, b: PublicCourse): number {
  if (a.nextStart && b.nextStart) return a.nextStart < b.nextStart ? -1 : 1;
  if (a.nextStart) return -1;
  if (b.nextStart) return 1;
  return a.title.localeCompare(b.title);
}

// A live course = published, not archived, has an upcoming session.
function isLive(c: RawCourse): boolean {
  return Boolean(c.publish) && !c.archived && (c.upcoming_schedule_count ?? 0) > 0;
}

// Enrich a set of raw courses with their real next session (in parallel) and
// transform to the public shape, sorted soonest-first.
async function enrich(raw: RawCourse[], now: Date, enrolBase: string): Promise<PublicCourse[]> {
  const sessions = await Promise.all(
    raw.map((c) => fetchNextSession(c.id, now).catch(() => null /* don't fail the whole set */)),
  );
  return raw.map((c, i) => toPublicCourse(c, sessions[i] ?? null, enrolBase, now)).sort(bySoonest);
}

// Fetch courses -> keep published/live/with-upcoming -> optional category
// filter -> enrich each with its real next session (parallel) -> sort by
// soonest next session. Auth is handled inside the fetch layer (login on
// demand), so callers no longer pass a token.
export async function getPublicCourses(
  now: Date,
  enrolBase: string,
  categoryFilter: string[] = [],
  query = "",
): Promise<PublicCourse[]> {
  const raw = await fetchRawCourses();
  const q = query.trim().toLowerCase();
  const live = raw.filter(
    (c) =>
      isLive(c) &&
      matchesCategory(c, categoryFilter) &&
      (!q || (c.title ?? "").toLowerCase().includes(q)),
  );
  return enrich(live, now, enrolBase);
}

// The single soonest-upcoming course whose title contains `query`
// (case-insensitive substring). Stable across batches: the id and code change
// each cohort, but the title does not — so `data-course="200 Hour Yoga Teacher
// Training"` keeps resolving to the next batch as new ones are scheduled.
// Optional category filter narrows first. Returns null if nothing matches.
export async function getPublicCourseByQuery(
  now: Date,
  enrolBase: string,
  query: string,
  categoryFilter: string[] = [],
): Promise<PublicCourse | null> {
  if (!query.trim()) return null;
  const matches = await getPublicCourses(now, enrolBase, categoryFilter, query);
  return matches[0] ?? null; // already sorted soonest-first
}
