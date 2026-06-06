# priyan-yoga-embed

Custom Oclass content widgets for the **priyan.yoga** Squarespace site, served
from Vercel serverless functions.

The stock `<oclass-schedules>` widget only renders the class schedule with no
control over content or layout. This project lets us serve *our own* curated
content — starting with an **upcoming-courses grid** — styled to match the site.

## Why a backend at all?

The browser must **never** see the Oclass token. It's a full-access admin
credential (reads student PII, payroll; can mutate enrolments). So the flow is:

```
Squarespace embed (public JS)
      │  fetch /api/courses
      ▼
Vercel function  ── OCLASS_API_TOKEN (server-side env) ──►  api.oclass.app
      │  returns a hand-picked allowlist of fields only
      ▼
embed.js renders the grid
```

The function returns **only** the fields in `PublicCourse` (`lib/oclass.ts`).
Never `return` a raw Oclass object — add fields to `toPublicCourse` one at a
time, on purpose. `test/local.mjs` has an allowlist guard that fails if an
unexpected field appears.

## Layout

```
api/courses.ts        GET /api/courses        — the upcoming-courses grid
api/course.ts         GET /api/course?q=…     — one course by title (single-card hero)
api/weekly-theme.ts   GET /api/weekly-theme   — this week's theme hero (+ ?image proxy)
lib/oclass.ts         Oclass fetch + transform. The course field allowlist lives here.
lib/weekly-theme.ts   Notion fetch + transform. The theme field allowlist lives here.
public/embed.js       Courses grid + single-course embed (scoped CSS, no deps)
public/theme.js       Weekly-theme hero embed (scoped CSS, no deps)
public/index.html     Local preview, renders the bundled fixture
public/sample-courses.json   Snapshot of live output (for offline preview)
test/local.mjs        Verifies transforms + allowlist guards against cached & live data
```

All three functions share the same shape: CORS, a 15-min edge cache, and a
**field-allowlisted** response (never a raw upstream object).

## Endpoint: `GET /api/courses`

Returns published courses that have upcoming sessions, sorted by soonest start:

```json
{
  "updatedAt": "2026-06-01T...",
  "count": 18,
  "courses": [
    {
      "id": 58759,
      "code": "C077",
      "title": "200 Hour Yoga Teacher Training Batch 17 (Weekends)",
      "summary": "plaintext excerpt…",
      "descriptionHtml": "<p>…</p>",
      "coverImage": "https://media.oclass.app/…jpg",
      "color": "#004d40ff",
      "durationMin": 1200,
      "creditsRequired": "1.00",
      "categories": [{ "id": 1067, "name": "Teacher Training" }],
      "upcomingSessions": 4,
      "startDate": "2026-04-04",
      "endDate": "2026-06-14",
      "dateLabel": "4 Apr – 14 Jun 2026",
      "nextStart": "2026-06-06T10:00:00+08:00",
      "nextStartLabel": "Sat, 6 Jun 2026",
      "venue": { "name": "Studio 1", "branch": "Pagoda Street 52A", "address": "52A Pagoda Street, S059211" },
      "onlineEnrollment": true,
      "enrolUrl": "https://clients.oclass.app/priyan-yoga/enrollment/schedule/5816999"
    }
  ]
}
```

**Accuracy note:** `nextStart` is the *real* next scheduled session, fetched per
course from `/com/schedule/schedules/?klass_id=…&ordering=start_datetime&limit=1`
— not derived from the recurrence rule. (The rule misses manually-added sessions
and carries no timezone; the schedule endpoint is the source of truth.)
`startDate`/`endDate` are the cohort span from the recurrence definition
(`dtstart`/`until`, plain dates), and `dateLabel` is a display-ready range that
collapses shared month/year (`4 Apr – 14 Jun 2026`, `25–29 Jun 2026`,
`13 Jun 2026` for a single day).

## Endpoint: `GET /api/course?q=<title substring>`

Returns the **single soonest-upcoming course** whose title contains `q`
(case-insensitive), or `null`. For course-specific pages.

```json
{ "updatedAt": "…", "query": "200 Hour Yoga Teacher Training", "category": null, "course": { /* one PublicCourse, or null */ } }
```

**Why match on the title, not the id?** A recurring course gets a brand-new
Oclass id *and* code every cohort (Batch 17 → Batch 18), but its title is
stable. Keying on a title substring means a course page resolves to the next
batch automatically — no edits when a new cohort is scheduled. Optional
`&category=` narrows first. Same allowlist + edge cache as `/api/courses`.

## Endpoint: `GET /api/weekly-theme`

This week's curriculum theme, for a hero block on the home page. Source is
**Notion** (the same "Curriculum" database the npsoy-website hero reads), *not*
Oclass — so it needs `NOTION_API_KEY` in the environment.

```json
{
  "updatedAt": "…",
  "theme": {
    "name": "Bent Arm Strength",
    "week": 4,
    "category": "Twist/ AB/ I",
    "subCategory": "Arm Balance",
    "scheduled": "2026-06-01",
    "summary": "Build pushing power through progressive arm balance work…",
    "youtubeLink": "https://www.youtube.com/embed/…",
    "hasImage": true
  }
}
```

`GET /api/weekly-theme?image=1` streams the theme's **cover image**. Notion
cover URLs are short-lived signed S3 links (~1h), so the browser never sees
them — this proxy re-fetches a fresh URL server-side on each (edge-cached)
request and returns the bytes. The JSON exposes only `hasImage`.

## Local development

```bash
npm install
npm test          # transform + allowlist guard; does a live fetch if a token is in env

# Preview the embed against the bundled fixture:
cd public && python3 -m http.server 8799   # → http://127.0.0.1:8799

# Preview against the live function:
vercel dev        # then set data-api="http://localhost:3000" in index.html
```

For the live-fetch test, the token is read from the environment:

```bash
set -a; source ~/vault/.env; set +a
export OCLASS_API_TOKEN
npm test
```

## Deploy

The repo is connected to Vercel with Git integration — **`git push origin master`
auto-deploys to production.** (The repo is public so Vercel's free tier builds
it; on the free tier, private-repo builds require the commit author to be a paid
team member, which is why this one is public. Nothing sensitive is committed.)

Environment variables (Vercel → Project → Settings → Environment Variables):

| Key | Value |
|---|---|
| `OCLASS_API_TOKEN` | the full-access Oclass token — server-side only, never returned to the browser |
| `NOTION_API_KEY` | Notion integration token for the weekly-theme hero (`/api/weekly-theme`). Server-side only. |
| `ALLOW_ORIGIN` | `*` (see note below) |
| `ENROLL_BASE` | `https://clients.oclass.app/priyan-yoga` |

Smoke-test after a deploy:

```bash
curl -s https://priyan-yoga-embed.vercel.app/api/courses \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['count'], 'courses')"
```

`ALLOW_ORIGIN=*` is intentional, not a shortcut: the response is curated public
marketing data (the token never leaves the server), and origin-locked CORS
breaks under Vercel's edge cache (a cached response can't carry a per-origin
header). *(Optional)* add a custom domain like `embed.priyan.yoga` under
Project → Domains for an on-brand embed URL.

## Add to Squarespace

On the Courses page, insert a **Code block** and paste:

```html
<div id="npsoy-courses"></div>
<script
  src="https://priyan-yoga-embed.vercel.app/embed.js"
  data-api="https://priyan-yoga-embed.vercel.app"
  data-accent="#1a3c34"></script>
```

Optional `data-*` attributes on the script tag:

| Attribute | Default | Purpose |
|---|---|---|
| `data-api` | — | Base URL of the deployed app (appends `/api/courses`) |
| `data-category` | all | Show only this Oclass category (see below). Comma-separate for several. |
| `data-course` | — | **Keyword mode.** A title substring (e.g. `200 Hour`). By default renders ONE hero card for the soonest upcoming batch matching it. |
| `data-layout` | `hero` | With `data-course`: `hero` (single card) or `list` (every matching upcoming cohort, chronological, no thumbnails). |
| `data-venue` | `show` | Show the venue/address line on each card/row. Set to `hide` to drop it. |
| `data-bg` | transparent | Background colour for the embed (e.g. `#fff`). |
| `data-mount` | `#npsoy-courses` | Selector of the mount element |
| `data-limit` | all | Max number of cards (grid mode) |
| `data-accent` | `#1a3c34` | Brand accent (chips, fallback, hover) |
| `data-endpoint` | — | Full JSON URL; overrides `data-api` (used for local preview) |

### A single course on its own page (`data-course`)

For a course-specific page, render just that course's next upcoming batch as a
hero card. Key on a stable slice of the **title** — it survives new cohorts (the
id/code don't):

```html
<div id="npsoy-courses"></div>
<script src="https://priyan-yoga-embed.vercel.app/embed.js"
        data-api="https://priyan-yoga-embed.vercel.app"
        data-course="200 Hour Yoga Teacher Training"></script>
```

### A schedule of every matching cohort (`data-layout="list"`)

Same keyword, but list **all** upcoming cohorts chronologically as a compact
dated list (no thumbnails) with an enrol button per row — ideal for a course
page that runs in batches:

```html
<div id="npsoy-courses"></div>
<script src="https://priyan-yoga-embed.vercel.app/embed.js"
        data-api="https://priyan-yoga-embed.vercel.app"
        data-course="200 Hour"
        data-layout="list"></script>
```

> **Keyword tip:** the match is a case-insensitive title substring, so keep it
> short and distinctive. `200 Hour` catches Batch 17 *and* the "200 Hour**s**"
> Batches 18–19; the longer `200 Hour Yoga Teacher Training` only matches the
> singular-spelled one. Hit `/api/courses?q=<keyword>` to preview what matches.

**Ongoing cohorts.** When today falls within a cohort's start–end span
(Singapore time), the API flags it `ongoing: true` and the embed renders a
disabled **Ongoing** button (non-clickable) instead of an enrol link — across
the grid, single hero, and list. Already-started batches that still have
upcoming sessions therefore can't be mistakenly enrolled into.

### Weekly-theme hero (`theme.js`)

A separate script renders the current week's theme (cover image + theme name +
summary) as a hero block — e.g. at the top of the home page:

```html
<div id="npsoy-theme"></div>
<script src="https://priyan-yoga-embed.vercel.app/theme.js"
        data-api="https://priyan-yoga-embed.vercel.app"></script>
```

Optional `data-*` on the `theme.js` tag: `data-eyebrow` (label above the theme,
default "This Week's Theme"), `data-link` + `data-cta` (a custom CTA button;
otherwise it offers the theme's YouTube demo if present), `data-accent`,
`data-mount` (default `#npsoy-theme`), `data-endpoint`/`data-image` (local
preview overrides).

### Filtering by category — one embed, many pages

`data-category` lets you reuse the same embed on different pages, each showing a
different slice. Filtering happens **server-side** (`?category=` on the API), so
each page only receives its own courses. Match is case-insensitive, by category
name or id.

```html
<!-- Teacher Training page -->
<div id="npsoy-courses"></div>
<script src="https://priyan-yoga-embed.vercel.app/embed.js"
        data-api="https://priyan-yoga-embed.vercel.app"
        data-category="Teacher Training"></script>

<!-- Retreats page: same embed, different category -->
<script ... data-category="Weekends and Overseas Retreats"></script>
```

Categories currently in use (from Oclass):

| Category | Examples |
|---|---|
| `Teacher Training` | 200hr YTT, Meditation TT |
| `Learning Yoga` | Joy in the Body, Yoga Foundations, Pranayama Weekend |
| `Weekends and Overseas Retreats` | Sri Lanka, Chiang Rai, Ubud |
| `Guest Teachers` | MBSR, Women's Weekends, Ken Harakuma series |

These come straight from Oclass — add/rename categories there and they flow
through. Hit `/api/courses` with no filter to see every course's `categories`.

The embed loads cover images with `referrerpolicy="no-referrer"` because
`media.oclass.app` returns 403 to requests carrying a foreign `Referer`.

## Open items / decisions

- **Read-only token.** Ask Oclass whether a scoped/read-only API token exists.
  The current token is full-access; the function is field-allowlisted to
  compensate, but a narrower token would reduce blast radius.

## Roadmap (deferred)

- **Next-cohort block** (`/api/course?q=…`) — ✅ shipped. Single-course hero,
  keyed on the stable title.
- **Weekly-theme hero** (`/api/weekly-theme`) — ✅ shipped, sourced from the
  Notion curriculum DB (not Google Calendar — the website moved to Notion). The
  cover image is proxied to dodge Notion's expiring signed URLs.
- **Theme image variety** — currently one cover per week. A rotating set per
  theme (a true carousel) would need multiple images per Notion row.
```
