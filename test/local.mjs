// Local verification — run with: node --import tsx test/local.mjs
// Tests the transform against cached real data, then (if a token is present in
// the environment) does one live fetch to confirm the end-to-end path.

import { readFileSync } from "node:fs";
import { toPublicCourse, getPublicCourses } from "../lib/oclass.ts";

const now = new Date();
const ENROL = "https://clients.oclass.app/priyan-yoga";

function section(t) {
  console.log("\n" + "═".repeat(60) + "\n" + t + "\n" + "═".repeat(60));
}

// ---- 1. Offline: transform shape (no session enrichment without network) -
section("OFFLINE — transform shape from cached /tmp/oclass_courses.json");
const raw = JSON.parse(readFileSync("/tmp/oclass_courses.json", "utf8")).results;

const courses = raw
  .filter((c) => c.publish && !c.archived && (c.upcoming_schedule_count ?? 0) > 0)
  .map((c) => toPublicCourse(c, null, ENROL)); // next session is fetched live; null here

console.log(`kept ${courses.length} of ${raw.length} raw courses (dates come from live test below)\n`);
for (const c of courses) {
  console.log(
    `  ${String(c.title).slice(0, 44).padEnd(44)} | ${c.upcomingSessions}x upcoming | credits ${c.creditsRequired}`,
  );
}

// Field-leak guard: assert the public object has ONLY allowlisted keys.
section("SECURITY — allowlist guard");
const ALLOWED = new Set([
  "id", "code", "title", "summary", "descriptionHtml", "coverImage", "color",
  "durationMin", "creditsRequired", "categories", "upcomingSessions",
  "startDate", "endDate", "dateLabel", "nextStart", "nextStartLabel",
  "venue", "onlineEnrollment", "enrolUrl",
]);
let leaks = 0;
for (const c of courses) {
  for (const k of Object.keys(c)) {
    if (!ALLOWED.has(k)) {
      console.log(`  ✗ LEAK: unexpected field "${k}"`);
      leaks++;
    }
  }
}
console.log(leaks === 0 ? "  ✓ no unexpected fields" : `  ✗ ${leaks} leak(s)`);

// Spot-check one full object so we can eyeball what reaches the browser.
section("SAMPLE — one full public object");
console.log(JSON.stringify(courses[0], null, 2));

// ---- 2. Live: end-to-end fetch (only if token present) ------------------
const token = process.env.OCLASS_API_TOKEN || process.env.OCLASS_TOKEN;
if (token) {
  section("LIVE — getPublicCourses() against api.oclass.app (real next-session dates)");
  try {
    const live = await getPublicCourses(token, now, ENROL);
    console.log(`  ✓ live fetch ok — ${live.length} courses\n`);
    for (const c of live) {
      console.log(
        `  ${(c.nextStartLabel ?? "—").padEnd(18)} | ${String(c.title).slice(0, 42).padEnd(42)} | ${c.venue?.branch ?? "?"}`,
      );
    }
    const missing = live.filter((c) => !c.nextStart).map((c) => c.title);
    console.log(`\n  courses with a resolved next date: ${live.length - missing.length}/${live.length}`);
    if (missing.length) console.log("  no date for:", missing.join("; "));

    // Date-range labels
    console.log("\n  date-range labels (cohort start–end):");
    for (const c of live.slice(0, 6)) console.log(`    ${c.dateLabel}  —  ${c.title.slice(0, 40)}`);

    // Category filter
    section("LIVE — category filter: 'Teacher Training'");
    const tt = await getPublicCourses(token, now, ENROL, ["Teacher Training"]);
    console.log(`  ${tt.length} course(s):`);
    for (const c of tt) console.log(`    • ${c.title} [${c.categories.map((x) => x.name).join(", ")}]`);
    const wrong = tt.filter((c) => !c.categories.some((x) => x.name === "Teacher Training"));
    console.log(wrong.length === 0 ? "  ✓ all match the filter" : `  ✗ ${wrong.length} off-category`);
  } catch (e) {
    console.log(`  ✗ live fetch failed: ${e.message}`);
    process.exitCode = 1;
  }
} else {
  section("LIVE — skipped (no OCLASS_API_TOKEN in env)");
}
