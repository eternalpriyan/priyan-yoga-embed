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

// ---- Oclass fetches --------------------------------------------------------

async function oclassGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${OCLASS_BASE}${path}`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Oclass ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  return (await res.json()) as T;
}

export async function fetchRawCourses(token: string): Promise<RawCourse[]> {
  const data = await oclassGet<Paginated<RawCourse>>(
    "/com/service/klasses/?archived=false&canceled=false&is_course=true&offset=0&limit=100",
    token,
  );
  return data.results ?? [];
}

// The next future, non-cancelled session for a single course.
// `klass_id` is the working filter param (`klass`, `service`, `klass__id` are
// silently ignored by the API and return ALL schedules).
export async function fetchNextSession(
  token: string,
  klassId: number,
  now: Date,
): Promise<NextSession | null> {
  const from = encodeURIComponent(now.toISOString());
  const data = await oclassGet<Paginated<RawSchedule>>(
    `/com/schedule/schedules/?klass_id=${klassId}&start_datetime__gte=${from}` +
      `&canceled=false&ordering=start_datetime&limit=1`,
    token,
  );
  const row = data.results?.[0];
  if (!row?.start_datetime) return null;
  return { scheduleId: row.id, startDatetime: row.start_datetime, venue: row.venue };
}

// ---- Orchestration ---------------------------------------------------------

// Fetch courses -> keep published/live/with-upcoming -> optional category
// filter -> enrich each with its real next session (parallel) -> sort by
// soonest next session.
export async function getPublicCourses(
  token: string,
  now: Date,
  enrolBase: string,
  categoryFilter: string[] = [],
): Promise<PublicCourse[]> {
  const raw = await fetchRawCourses(token);
  const live = raw.filter(
    (c) =>
      c.publish &&
      !c.archived &&
      (c.upcoming_schedule_count ?? 0) > 0 &&
      matchesCategory(c, categoryFilter),
  );

  const sessions = await Promise.all(
    live.map((c) =>
      fetchNextSession(token, c.id, now).catch(() => null /* don't fail the whole grid */),
    ),
  );

  return live
    .map((c, i) => toPublicCourse(c, sessions[i] ?? null, enrolBase))
    .sort((a, b) => {
      if (a.nextStart && b.nextStart) return a.nextStart < b.nextStart ? -1 : 1;
      if (a.nextStart) return -1;
      if (b.nextStart) return 1;
      return a.title.localeCompare(b.title);
    });
}
