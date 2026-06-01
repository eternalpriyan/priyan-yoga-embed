import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPublicCourseByQuery } from "../lib/oclass.js";

function applyCors(req: VercelRequest, res: VercelResponse): void {
  const allow = (process.env.ALLOW_ORIGIN ?? "*").split(",").map((s) => s.trim());
  const origin = req.headers.origin;

  if (allow.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allow.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function firstParam(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

// GET /api/course?q=<title substring>[&category=<name|id,...>]
// Returns the single soonest-upcoming course whose title contains `q`.
// Keyed on the title (stable across batches) so a course page never needs
// editing when a new cohort id/code is created in Oclass.
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.OCLASS_API_TOKEN;
  if (!token) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  const query = firstParam(req.query.q);
  if (!query) {
    res.status(400).json({ error: "Missing required query param: q" });
    return;
  }

  try {
    const enrolBase = process.env.ENROLL_BASE ?? "https://clients.oclass.app/priyan-yoga";
    const categoryFilter = firstParam(req.query.category)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const course = await getPublicCourseByQuery(token, new Date(), enrolBase, query, categoryFilter);

    // Same edge-cache policy as the grid; cache key includes the query string.
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      query,
      category: categoryFilter.length ? categoryFilter : null,
      course, // PublicCourse | null
    });
  } catch (err) {
    res.status(502).json({ error: "Upstream fetch failed" });
    console.error("[/api/course]", err instanceof Error ? err.message : err);
  }
}
