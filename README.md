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
api/courses.ts      Serverless function: GET /api/courses (CORS + 15-min edge cache)
lib/oclass.ts       Fetch + transform. The field allowlist lives here.
public/embed.js     Vanilla-JS embed (scoped CSS, no deps) for Squarespace
public/index.html   Local preview, renders the bundled fixture
public/sample-courses.json   Snapshot of live output (for offline preview)
test/local.mjs      Verifies transform + allowlist against cached & live data
```

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

## Deploy to Vercel

1. **Push to GitHub** (new repo, e.g. `eternalpriyan/priyan-yoga-embed`):
   ```bash
   gh repo create priyan-yoga-embed --private --source=. --remote=origin --push
   ```
2. **Import to Vercel** — vercel.com → Add New → Project → pick the repo.
   Framework preset: *Other*. No build command needed (functions are zero-config).
3. **Set environment variables** (Project → Settings → Environment Variables):
   | Key | Value |
   |---|---|
   | `OCLASS_API_TOKEN` | the token from `~/vault/.env` |
   | `ALLOW_ORIGIN` | `https://priyan.yoga,https://www.priyan.yoga` |
   | `ENROLL_BASE` | `https://clients.oclass.app/priyan-yoga` (or a deep link — see below) |
4. **Deploy.** Test: `curl https://<app>.vercel.app/api/courses | jq .count`
5. *(Optional)* Add a custom domain like `embed.priyan.yoga` under Project →
   Domains, so the embed URL is on-brand.

## Add to Squarespace

On the Courses page, insert a **Code block** and paste:

```html
<div id="npsoy-courses"></div>
<script
  src="https://<app>.vercel.app/embed.js"
  data-api="https://<app>.vercel.app"
  data-accent="#1a3c34"></script>
```

Optional `data-*` attributes on the script tag:

| Attribute | Default | Purpose |
|---|---|---|
| `data-api` | — | Base URL of the deployed app (appends `/api/courses`) |
| `data-category` | all | Show only this Oclass category (see below). Comma-separate for several. |
| `data-mount` | `#npsoy-courses` | Selector of the mount element |
| `data-limit` | all | Max number of cards |
| `data-accent` | `#1a3c34` | Brand accent (chips, fallback, hover) |
| `data-endpoint` | — | Full JSON URL; overrides `data-api` (used for local preview) |

### Filtering by category — one embed, many pages

`data-category` lets you reuse the same embed on different pages, each showing a
different slice. Filtering happens **server-side** (`?category=` on the API), so
each page only receives its own courses. Match is case-insensitive, by category
name or id.

```html
<!-- Teacher Training page -->
<div id="npsoy-courses"></div>
<script src="https://<app>.vercel.app/embed.js"
        data-api="https://<app>.vercel.app"
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

- `/api/courses/[id]/next` — "next available cohort" block for individual course pages.
- `/api/weekly-theme` — theme-of-the-week from Google Calendar
  (event title `"NN. Theme #ThisWeekInNPSOY"`, URL in description), via a Google
  service account.
```
