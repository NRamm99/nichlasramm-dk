export const ICS_MAX_CHARS = 16_384;

export function icsFileName(value: string) {
  const base = value.trim().split(/[/\\]/).pop() ?? "";
  return /^[\w.-]+\.ics$/i.test(base) ? base : "padel.ics";
}

export function encodeIcsPayload(ics: string) {
  const bytes = new TextEncoder().encode(ics);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeIcsPayload(encoded: string) {
  if (!encoded || encoded.length > 24_000) return null;
  try {
    const padded = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const pad = "=".repeat((4 - (padded.length % 4)) % 4);
    const binary = atob(padded + pad);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const ics = new TextDecoder().decode(bytes);
    if (ics.length > ICS_MAX_CHARS) return null;
    if (!ics.startsWith("BEGIN:VCALENDAR") || !ics.includes("END:VCALENDAR")) {
      return null;
    }
    return ics;
  } catch {
    return null;
  }
}
