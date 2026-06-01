import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPublicCourses } from "../lib/oclass.js";

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

  try {
    const enrolBase = process.env.ENROLL_BASE ?? "https://clients.oclass.app/priyan-yoga";

    // ?category=Teacher Training  (comma-separated for multiple; matches name or id)
    const raw = req.query.category;
    const categoryFilter = (Array.isArray(raw) ? raw.join(",") : raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const courses = await getPublicCourses(token, new Date(), enrolBase, categoryFilter);

    // Edge-cache 15 min, serve stale up to 1h while revalidating. Cache key
    // includes the query string, so each category caches independently.
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      category: categoryFilter.length ? categoryFilter : null,
      count: courses.length,
      courses,
    });
  } catch (err) {
    res.status(502).json({ error: "Upstream fetch failed" });
    // Log server-side only — never leak upstream detail to the browser.
    console.error("[/api/courses]", err instanceof Error ? err.message : err);
  }
}
