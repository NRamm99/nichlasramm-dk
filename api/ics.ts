import type { VercelRequest, VercelResponse } from "@vercel/node";
import { decodeIcsPayload, icsFileName } from "../src/lib/icsPayload";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).end();
    return;
  }

  const encoded = typeof req.query.d === "string" ? req.query.d : "";
  const ics = decodeIcsPayload(encoded);
  if (!ics) {
    res.status(400).send("Invalid calendar");
    return;
  }

  const file = icsFileName(
    typeof req.query.file === "string" ? req.query.file : "padel.ics",
  );
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="${file}"`);
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }
  res.status(200).send(ics);
}
