import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCurrentTheme, fetchCurrentThemePage, coverUrlOf } from "../lib/weekly-theme.js";

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

// Stream the current theme's Notion cover image. Notion's URL is a short-lived
// signed S3 link, so we proxy the bytes — the browser only ever sees this
// stable endpoint. Edge-cached ~1h (inside the signed URL's validity window).
async function serveImage(key: string, now: Date, res: VercelResponse): Promise<void> {
  const page = await fetchCurrentThemePage(key, now);
  const url = coverUrlOf(page);
  if (!url) {
    res.status(404).json({ error: "No cover image for the current theme" });
    return;
  }
  const upstream = await fetch(url);
  if (!upstream.ok) {
    res.status(502).json({ error: "Cover fetch failed" });
    return;
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(buf);
}

// GET /api/weekly-theme            -> { updatedAt, theme }   (theme: PublicTheme | null)
// GET /api/weekly-theme?image=1    -> the current theme's cover image bytes
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

  const key = process.env.NOTION_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  const wantsImage = req.query.image !== undefined;

  try {
    const now = new Date();
    if (wantsImage) {
      await serveImage(key, now, res);
      return;
    }

    const theme = await getCurrentTheme(key, now);
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      theme, // PublicTheme | null
    });
  } catch (err) {
    res.status(502).json({ error: "Upstream fetch failed" });
    console.error("[/api/weekly-theme]", err instanceof Error ? err.message : err);
  }
}
