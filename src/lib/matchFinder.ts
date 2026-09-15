import { supabase } from "./supabase";

export type Band = "morning" | "noon" | "afternoon" | "evening";
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type MatchFinderKind = "permanent" | "temporary";

export type BandInfo = {
  id: Band;
  label: string;
  short: string;
  from: string;
  to: string;
};

export const BANDS: readonly BandInfo[] = [
  { id: "morning", label: "Morgen", short: "morgen", from: "07:00", to: "10:00" },
  { id: "noon", label: "Middag", short: "middag", from: "10:00", to: "14:00" },
  {
    id: "afternoon",
    label: "Eftermiddag",
    short: "eftermiddag",
    from: "14:00",
    to: "17:00",
  },
  { id: "evening", label: "Aften", short: "aften", from: "17:00", to: "22:00" },
];

export const WEEKDAYS: readonly { id: Weekday; label: string; long: string }[] = [
  { id: 1, label: "man", long: "mandag" },
  { id: 2, label: "tir", long: "tirsdag" },
  { id: 3, label: "ons", long: "onsdag" },
  { id: 4, label: "tor", long: "torsdag" },
  { id: 5, label: "fre", long: "fredag" },
  { id: 6, label: "lør", long: "lørdag" },
  { id: 7, label: "søn", long: "søndag" },
];

const BAND_ORDER: Record<Band, number> = {
  morning: 0,
  noon: 1,
  afternoon: 2,
  evening: 3,
};

export function bandInfo(band: Band) {
  return BANDS[BAND_ORDER[band]];
}

export function weekdayInfo(weekday: Weekday) {
  return WEEKDAYS[weekday - 1];
}

export type Slot = { weekday: Weekday; band: Band };
export type SlotKey = `${Weekday}:${Band}`;

export function slotKey(slot: Slot): SlotKey {
  return `${slot.weekday}:${slot.band}`;
}

export function parseSlotKey(key: string): Slot | null {
  const [day, band] = key.split(":");
  const weekday = Number(day);
  if (!isWeekday(weekday) || !isBand(band)) return null;
  return { weekday, band };
}

export function isBand(value: unknown): value is Band {
  return typeof value === "string" && value in BAND_ORDER;
}

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

export function sortSlots(slots: Slot[]) {
  return [...slots].sort(
    (a, b) =>
      a.weekday - b.weekday || BAND_ORDER[a.band] - BAND_ORDER[b.band],
  );
}

export function slotsFromKeys(keys: Iterable<string>) {
  const slots: Slot[] = [];
  for (const key of keys) {
    const slot = parseSlotKey(key);
    if (slot) slots.push(slot);
  }
  return sortSlots(slots);
}

export function slotLabel(slot: Slot) {
  return `${weekdayInfo(slot.weekday).label} ${bandInfo(slot.band).short}`;
}

export function slotLongLabel(slot: Slot) {
  const band = bandInfo(slot.band);
  return `${weekdayInfo(slot.weekday).long} ${band.short} · ${band.from}–${band.to}`;
}

export function formatSlots(slots: Slot[]) {
  return sortSlots(slots).map(slotLabel).join(" · ");
}

export function slotCountCopy(count: number) {
  return count === 1 ? "1 tid" : `${count} tider`;
}

export type MatchFinderPreference = {
  profile_id: string;
  kind: MatchFinderKind;
  weekday: number;
  band: Band;
  expires_at: string | null;
  updated_at: string;
};

export type MemberPrefs = {
  permanent: Slot[];
  temporary: Slot[];
  temporaryExpiresAt: string | null;
  updatedAt: string | null;
};

export function emptyMemberPrefs(): MemberPrefs {
  return {
    permanent: [],
    temporary: [],
    temporaryExpiresAt: null,
    updatedAt: null,
  };
}

export function groupPreferences(rows: MatchFinderPreference[]) {
  const byProfile = new Map<string, MemberPrefs>();
  for (const row of rows) {
    if (!isWeekday(row.weekday) || !isBand(row.band)) continue;
    let prefs = byProfile.get(row.profile_id);
    if (!prefs) {
      prefs = emptyMemberPrefs();
      byProfile.set(row.profile_id, prefs);
    }
    const slot: Slot = { weekday: row.weekday, band: row.band };
    if (row.kind === "temporary") {
      prefs.temporary.push(slot);
      if (
        row.expires_at &&
        (!prefs.temporaryExpiresAt || row.expires_at > prefs.temporaryExpiresAt)
      ) {
        prefs.temporaryExpiresAt = row.expires_at;
      }
    } else {
      prefs.permanent.push(slot);
    }
    if (!prefs.updatedAt || row.updated_at > prefs.updatedAt) {
      prefs.updatedAt = row.updated_at;
    }
  }
  for (const prefs of byProfile.values()) {
    prefs.permanent = sortSlots(prefs.permanent);
    prefs.temporary = sortSlots(prefs.temporary);
  }
  return byProfile;
}

export function memberPrefs(
  byProfile: Map<string, MemberPrefs>,
  profileId: string,
) {
  return byProfile.get(profileId) ?? emptyMemberPrefs();
}

export function temporaryActive(prefs: MemberPrefs, now = new Date()) {
  return (
    prefs.temporary.length > 0 &&
    prefs.temporaryExpiresAt != null &&
    new Date(prefs.temporaryExpiresAt).getTime() > now.getTime()
  );
}

// A live temporary overlay replaces the permanent set entirely.
export function effectiveSlots(prefs: MemberPrefs, now = new Date()) {
  return temporaryActive(prefs, now) ? prefs.temporary : prefs.permanent;
}

export function hasAnyPrefs(prefs: MemberPrefs, now = new Date()) {
  return effectiveSlots(prefs, now).length > 0;
}

export type Suggestion = {
  profileId: string;
  sharedSlots: Slot[];
  score: number;
  ratingGap: number | null;
  updatedAt: string | null;
};

export type SuggestionResult = {
  mine: Slot[];
  people: Suggestion[];
  bySlot: Map<SlotKey, string[]>;
  heat: Map<SlotKey, number>;
};

export function buildSuggestions(
  viewerId: string,
  rowsByProfile: Map<string, MemberPrefs>,
  ratings: Map<string, number>,
  now = new Date(),
): SuggestionResult {
  const mine = effectiveSlots(memberPrefs(rowsByProfile, viewerId), now);
  const mineKeys = new Set(mine.map(slotKey));
  const myRating = ratings.get(viewerId);

  const people: Suggestion[] = [];
  const bySlot = new Map<SlotKey, string[]>();
  const heat = new Map<SlotKey, number>();

  for (const [profileId, prefs] of rowsByProfile) {
    if (profileId === viewerId) continue;
    const slots = effectiveSlots(prefs, now);
    if (slots.length === 0) continue;
    const shared: Slot[] = [];
    for (const slot of slots) {
      const key = slotKey(slot);
      heat.set(key, (heat.get(key) ?? 0) + 1);
      const list = bySlot.get(key) ?? [];
      list.push(profileId);
      bySlot.set(key, list);
      if (mineKeys.has(key)) shared.push(slot);
    }
    if (shared.length === 0) continue;
    const theirRating = ratings.get(profileId);
    const ratingGap =
      myRating != null && theirRating != null
        ? Math.abs(myRating - theirRating)
        : null;
    people.push({
      profileId,
      sharedSlots: sortSlots(shared),
      score: shared.length,
      ratingGap,
      updatedAt: prefs.updatedAt,
    });
  }

  people.sort(compareSuggestions);
  for (const [key, list] of bySlot) {
    bySlot.set(
      key,
      sortByRatingCloseness(list, viewerId, ratings),
    );
  }

  return { mine, people, bySlot, heat };
}

function compareSuggestions(a: Suggestion, b: Suggestion) {
  if (a.score !== b.score) return b.score - a.score;
  const gapA = a.ratingGap ?? Number.POSITIVE_INFINITY;
  const gapB = b.ratingGap ?? Number.POSITIVE_INFINITY;
  if (gapA !== gapB) return gapA - gapB;
  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
}

export function sortByRatingCloseness(
  ids: string[],
  viewerId: string,
  ratings: Map<string, number>,
) {
  const mine = ratings.get(viewerId);
  const gap = (id: string) => {
    const theirs = ratings.get(id);
    return mine != null && theirs != null
      ? Math.abs(mine - theirs)
      : Number.POSITIVE_INFINITY;
  };
  return [...ids].sort((a, b) => gap(a) - gap(b) || a.localeCompare(b));
}

export const COURT_SIZE = 4;

// `players` counts the viewer as well when they are available in the slot.
export function slotOccupancyCopy(players: number) {
  if (players <= 0) return "Ingen ledige";
  const noun = players === 1 ? "spiller" : "spillere";
  if (players < COURT_SIZE) {
    const missing = COURT_SIZE - players;
    return `${players} ${noun} · mangler ${missing} til en bane`;
  }
  const courts = Math.floor(players / COURT_SIZE);
  return `${players} ${noun} · nok til ${courts} ${courts === 1 ? "bane" : "baner"}`;
}

export function matchCountCopy(count: number) {
  if (count === 0) return "Ingen matcher endnu";
  if (count === 1) return "1 spiller matcher dig";
  return `${count} spillere matcher dig`;
}

export const MATCH_FINDER_COPY = {
  title: "Foreslåede kampe",
  noPrefsTitle: "Hvornår spiller du?",
  noPrefsBody:
    "Sæt de dage og tidspunkter du normalt kan, og se hvem i klubben der passer.",
  noOverlap: "Ingen matcher endnu — din tid er synlig for andre",
  hiddenNote: "Du er skjult for andre, men kan stadig se forslag.",
  editTimes: "Ret tider",
  setTimes: "Sæt spilletider",
  createListing: "Opret Find kamp",
  message: "Skriv",
  suggestedCourt: "Foreslået bane",
  alsoAvailable: "Også tilgængelige",
  showAll: "Se alle",
  showFewer: "Vis færre",
};

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "short",
});

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 0, 0);
  return copy;
}

function daysBetween(from: Date, to: Date) {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000,
  );
}

export function temporaryExpiryCopy(expiresAt: string, now = new Date()) {
  const when = new Date(expiresAt);
  const days = daysBetween(now, when);
  if (days <= 0) return "udløber i dag";
  if (days === 1) return "udløber i morgen";
  if (days < 7) return `udløber ${weekdayInfo(isoWeekday(when)).label}`;
  return `udløber ${dateFormatter.format(when)}`;
}

export function temporaryUntilCopy(expiresAt: string, now = new Date()) {
  const when = new Date(expiresAt);
  const days = daysBetween(now, when);
  if (days <= 0) return "i dag";
  if (days === 1) return "i morgen";
  if (days < 7) return `${weekdayInfo(isoWeekday(when)).long}`;
  return dateFormatter.format(when);
}

export function isoWeekday(date: Date): Weekday {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as Weekday;
}

export function toDateInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Next calendar date for `weekday`; today counts while the band still lies ahead.
export function nextOccurrence(weekday: Weekday, from = new Date(), band?: Band) {
  const today = isoWeekday(from);
  let offset = (weekday - today + 7) % 7;
  if (offset === 0 && band) {
    const [hours, minutes] = bandInfo(band).to.split(":").map(Number);
    const bandEnd = new Date(from);
    bandEnd.setHours(hours, minutes, 0, 0);
    if (bandEnd.getTime() <= from.getTime()) offset = 7;
  }
  const date = startOfDay(from);
  date.setDate(date.getDate() + offset);
  return date;
}

export function listingPrefillSearch(slot: Slot, now = new Date()) {
  const band = bandInfo(slot.band);
  const date = nextOccurrence(slot.weekday, now, slot.band);
  const params = new URLSearchParams({
    dato: toDateInput(date),
    fra: band.from,
    til: band.to,
  });
  return `?${params.toString()}`;
}

export const LISTING_CREATE_PATH = "/matchmaker/ny";

export function listingCreatePath(slot: Slot, now = new Date()) {
  return `${LISTING_CREATE_PATH}${listingPrefillSearch(slot, now)}`;
}

export function slotFromPrefill(params: {
  dato: string | null;
  fra: string | null;
  til: string | null;
}) {
  if (!params.dato || !params.fra || !params.til) return null;
  const date = new Date(`${params.dato}T12:00`);
  if (Number.isNaN(date.getTime())) return null;
  const band = BANDS.find((row) => row.from === params.fra && row.to === params.til);
  if (!band) return null;
  return { weekday: isoWeekday(date), band: band.id } satisfies Slot;
}

export type TemporaryPresetId = "today" | "week" | "7d";

export type TemporaryPreset = {
  id: TemporaryPresetId;
  label: string;
  expiresAt: string;
};

export const TEMPORARY_MIN_MS = 60 * 60 * 1000;
export const TEMPORARY_MAX_DAYS = 30;

export function temporaryPresets(now = new Date()): TemporaryPreset[] {
  const todayEnd = endOfDay(now);
  const weekEnd = endOfDay(now);
  weekEnd.setDate(weekEnd.getDate() + (7 - isoWeekday(now)));
  const sevenDays = endOfDay(now);
  sevenDays.setDate(sevenDays.getDate() + 7);

  const presets: TemporaryPreset[] = [
    { id: "today", label: "I dag", expiresAt: todayEnd.toISOString() },
    { id: "week", label: "Denne uge", expiresAt: weekEnd.toISOString() },
    { id: "7d", label: "7 dage", expiresAt: sevenDays.toISOString() },
  ];
  const seen = new Set<string>();
  return presets.filter((preset) => {
    const time = new Date(preset.expiresAt).getTime();
    if (time < now.getTime() + TEMPORARY_MIN_MS) return false;
    if (seen.has(preset.expiresAt)) return false;
    seen.add(preset.expiresAt);
    return true;
  });
}

export function expiryFromDateInput(value: string) {
  if (!value) return null;
  const when = new Date(`${value}T23:59`);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

export function expiryIsValid(expiresAt: string, now = new Date()) {
  const time = new Date(expiresAt).getTime();
  if (Number.isNaN(time)) return false;
  const min = now.getTime() + TEMPORARY_MIN_MS;
  const max = now.getTime() + TEMPORARY_MAX_DAYS * 86_400_000;
  return time >= min && time <= max;
}

const TEMP_STRIP_KEY = "padel:match-finder-temp-dismissed";

export function temporaryStripDismissed(expiresAt: string) {
  try {
    return window.localStorage.getItem(TEMP_STRIP_KEY) === expiresAt;
  } catch {
    return false;
  }
}

export function dismissTemporaryStrip(expiresAt: string) {
  try {
    window.localStorage.setItem(TEMP_STRIP_KEY, expiresAt);
  } catch {
    // Private mode or storage disabled: the strip just stays visible.
  }
}

export async function fetchMatchFinderRows() {
  const { data, error } = await supabase
    .from("match_finder_preferences")
    .select("profile_id, kind, weekday, band, expires_at, updated_at");
  if (error) throw error;
  return (data ?? []) as MatchFinderPreference[];
}

export async function saveMatchFinderPreferences(
  kind: MatchFinderKind,
  slots: Slot[],
  expiresAt?: string | null,
) {
  const { error } = await supabase.rpc("set_match_finder_preferences", {
    p_kind: kind,
    p_slots: sortSlots(slots).map((slot) => ({
      weekday: slot.weekday,
      band: slot.band,
    })),
    p_expires_at: kind === "temporary" ? (expiresAt ?? null) : null,
  });
  if (error) throw error;
}

export function clearTemporary() {
  return saveMatchFinderPreferences("temporary", [], null);
}

export async function setMatchFinderHidden(hidden: boolean) {
  const { error } = await supabase.rpc("set_match_finder_hidden", {
    p_hidden: hidden,
  });
  if (error) throw error;
}
