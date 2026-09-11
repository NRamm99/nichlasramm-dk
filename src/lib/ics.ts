import {
  isSinglesMatch,
  matchDurationMinutes,
  teamNames,
  type MatchPlayer,
} from "./match";

export type MatchIcsKind = "liga" | "single" | "padel";

export function matchIcsKind(players: MatchPlayer[], league: boolean): MatchIcsKind {
  if (league) return "liga";
  if (isSinglesMatch(players)) return "single";
  return "padel";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toIcsUtc(date: Date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function icsEscape(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n");
}

function foldIcsLine(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const parts: string[] = [];
  let offset = 0;
  let limit = 75;
  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);
    while (end > offset && (bytes[end] & 0b1100_0000) === 0b1000_0000) {
      end -= 1;
    }
    if (end === offset) end = Math.min(offset + limit, bytes.length);
    parts.push(decoder.decode(bytes.subarray(offset, end)));
    offset = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

function icsText(name: string, value: string) {
  return foldIcsLine(`${name}:${icsEscape(value)}`);
}

function icsRaw(name: string, value: string) {
  return foldIcsLine(`${name}:${value}`);
}

function kindLabel(kind: MatchIcsKind) {
  if (kind === "liga") return "Ligakamp";
  if (kind === "single") return "Single";
  return "Padel";
}

export function matchIcsSummary(players: MatchPlayer[], kind: MatchIcsKind) {
  return `${kindLabel(kind)}: ${teamNames(players, 1)} vs ${teamNames(players, 2)}`;
}

export function buildMatchIcs({
  id,
  playedAt,
  players,
  kind,
  url,
  durationMinutes,
  now = new Date(),
}: {
  id: string;
  playedAt: string;
  players: MatchPlayer[];
  kind: MatchIcsKind;
  url: string;
  durationMinutes?: number | null;
  now?: Date;
}): string | null {
  const start = new Date(playedAt);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(
    start.getTime() + matchDurationMinutes(durationMinutes) * 60_000,
  );
  const summary = matchIcsSummary(players, kind);
  const description = `${summary}\nSe kampen: ${url}`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Padel By Ramm//kampe//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    icsText("X-WR-CALNAME", summary),
    "BEGIN:VEVENT",
    `UID:match-${id}@nichlasramm.dk`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    icsText("SUMMARY", summary),
    icsText("DESCRIPTION", description),
    icsRaw("URL", url),
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    icsText("DESCRIPTION", "Påmindelse: padelkamp om 1 time"),
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iP(hone|ad|od)/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function googleCalendarUrl({
  summary,
  playedAt,
  durationMinutes,
  details,
}: {
  summary: string;
  playedAt: string;
  durationMinutes?: number | null;
  details: string;
}) {
  const start = new Date(playedAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(
    start.getTime() + matchDurationMinutes(durationMinutes) * 60_000,
  );
  const params = new URLSearchParams({
    text: summary,
    dates: `${toIcsUtc(start)}/${toIcsUtc(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/u/0/r/eventedit?${params}`;
}

export function openAppleCalendarEvent(ics: string) {
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  document.body.append(link);
  link.click();
  link.remove();
}

export function openExternalUrl(url: string) {
  const opened = window.open(url, "_blank");
  if (opened) {
    opened.opener = null;
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  document.body.append(link);
  link.click();
  link.remove();
}

export async function openIcsFile(filename: string, ics: string, title: string) {
  const file = new File([ics], filename, { type: "text/calendar" });
  const canShareFiles = (() => {
    try {
      return (
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      );
    } catch {
      return false;
    }
  })();

  if (canShareFiles && typeof navigator.share === "function") {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(
    new Blob([ics], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
