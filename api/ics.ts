import type { VercelRequest, VercelResponse } from "@vercel/node";

const ICS_MAX_CHARS = 16_384;

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function icsFileName(value: string) {
  const base = value.trim().split(/[/\\]/).pop() ?? "";
  return /^[\w.-]+\.ics$/i.test(base) ? base : "padel.ics";
}

function decodeIcsPayload(encoded: string) {
  if (!encoded || encoded.length > 24_000) return null;
  try {
    const padded = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const pad = "=".repeat((4 - (padded.length % 4)) % 4);
    const binary = Buffer.from(padded + pad, "base64").toString("utf8");
    if (binary.length > ICS_MAX_CHARS) return null;
    if (!binary.startsWith("BEGIN:VCALENDAR") || !binary.includes("END:VCALENDAR")) {
      return null;
    }
    return binary;
  } catch {
    return null;
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).end();
    return;
  }

  const ics = decodeIcsPayload(queryValue(req.query.d));
  if (!ics) {
    res.status(400).send("Invalid calendar");
    return;
  }

  const file = icsFileName(queryValue(req.query.file) || "padel.ics");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="${file}"`);
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }
  res.status(200).send(ics);
}
