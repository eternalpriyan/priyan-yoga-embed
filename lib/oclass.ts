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
  upcomingSessions: number;
  nextStart: string | null; // ISO 8601, or null if none
  nextStartLabel: string | null; // e.g. "Sat, 4 Apr 2026"
  venue: { name: string | null; branch: string | null; address: string | null } | null;
  onlineEnrollment: boolean;
  enrolUrl: string;
}

// ---- Helpers ---------------------------------------------------------------

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

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(iso));
}

// ---- Transform (pure, testable) --------------------------------------------

export function toPublicCourse(
  course: RawCourse,
  next: NextSession | null,
  enrolBase: string,
): PublicCourse {
  const v = next?.venue;
  const plain = course.description ? stripHtml(course.description) : "";

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
    upcomingSessions: course.upcoming_schedule_count ?? 0,
    nextStart: next?.startDatetime ?? null,
    nextStartLabel: next ? fmtDate(next.startDatetime) : null,
    venue: v
      ? { name: v.name ?? null, branch: v.branch?.name ?? null, address: v.branch?.address ?? null }
      : null,
    onlineEnrollment: course.online_enrollment ?? false,
    // Deep link to the next session's enrolment page:
    //   {enrolBase}/enrollment/schedule/{scheduleId}
    // Falls back to the booking-site root if we have no upcoming session id.
    enrolUrl: next?.scheduleId
      ? `${enrolBase}/enrollment/schedule/${next.scheduleId}`
      : enrolBase,
  };
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

// Fetch courses -> keep published/live/with-upcoming -> enrich each with its
// real next session (parallel) -> sort by soonest start.
export async function getPublicCourses(
  token: string,
  now: Date,
  enrolBase: string,
): Promise<PublicCourse[]> {
  const raw = await fetchRawCourses(token);
  const live = raw.filter(
    (c) => c.publish && !c.archived && (c.upcoming_schedule_count ?? 0) > 0,
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
