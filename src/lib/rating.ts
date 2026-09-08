import { fetchMembersByIds, type PartnerPreview } from "./profile";
import { supabase } from "./supabase";

export type PlayerRating = {
  profile_id: string;
  rating: number;
  matches_rated: number;
  peak_rating: number;
};

export type RatingEvent = {
  match_id: string;
  profile_id: string;
  played_at: string;
  seq: number;
  match_index: number;
  rating_before: number;
  rating_after: number;
  delta: number;
};

export type RatingSettings = {
  start_rating: number;
  provisional_matches: number;
};

export type RatingLeaderboardRow = PlayerRating & { person: PartnerPreview };

export type PlayerRatingSummary = {
  rating: PlayerRating | null;
  trend: number | null;
  trendMatches: number;
  settings: RatingSettings;
};

export const TREND_MATCHES = 5;

export const RATING_SELECT = "profile_id, rating, matches_rated, peak_rating";

export const RATING_EVENT_SELECT =
  "match_id, profile_id, played_at, seq, match_index, rating_before, rating_after, delta";

export const DEFAULT_RATING_SETTINGS: RatingSettings = {
  start_rating: 1000,
  provisional_matches: 10,
};

export function formatRatingDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return String(delta);
  return "±0";
}

export function withRating(name: string, rating?: number | null) {
  if (rating == null) return name;
  return `${name} (${rating})`;
}

export function ratingValues(rows: Map<string, PlayerRating>) {
  const map = new Map<string, number>();
  for (const [id, row] of rows) map.set(id, row.rating);
  return map;
}

// A rating still inside the provisional window swings by a lot each match, so the
// UI marks it rather than presenting it as settled.
export function isProvisional(
  rating: PlayerRating | null,
  settings: RatingSettings,
) {
  if (!rating) return true;
  return rating.matches_rated < settings.provisional_matches;
}

export function ratingTrend(events: RatingEvent[]) {
  if (events.length === 0) return null;
  return events.reduce((sum, row) => sum + row.delta, 0);
}

export async function fetchRatingSettings(): Promise<RatingSettings> {
  const { data } = await supabase
    .from("rating_settings")
    .select("start_rating, provisional_matches")
    .maybeSingle();
  return (data as RatingSettings | null) ?? DEFAULT_RATING_SETTINGS;
}

export async function fetchPlayerRating(profileId: string) {
  const { data, error } = await supabase
    .from("player_ratings")
    .select(RATING_SELECT)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return (data as PlayerRating | null) ?? null;
}

export async function fetchPlayerRatingsByIds(
  ids: Array<string | null | undefined>,
) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const byId = new Map<string, PlayerRating>();
  if (unique.length === 0) return byId;

  const { data, error } = await supabase
    .from("player_ratings")
    .select(RATING_SELECT)
    .in("profile_id", unique);
  if (error) throw error;

  for (const row of (data ?? []) as PlayerRating[]) {
    byId.set(row.profile_id, row);
  }
  for (const id of unique) {
    if (!byId.has(id)) {
      byId.set(id, {
        profile_id: id,
        rating: DEFAULT_RATING_SETTINGS.start_rating,
        matches_rated: 0,
        peak_rating: DEFAULT_RATING_SETTINGS.start_rating,
      });
    }
  }
  return byId;
}

export async function fetchMatchPlayerRatingChips(matchIds: string[]) {
  const unique = [...new Set(matchIds)];
  const byMatch = new Map<string, Map<string, { rating: number; delta: number }>>();
  if (unique.length === 0) return byMatch;

  const { data, error } = await supabase
    .from("rating_events")
    .select("match_id, profile_id, rating_after, delta")
    .in("match_id", unique);
  if (error) throw error;

  for (const row of data ?? []) {
    const matchId = row.match_id as string;
    const profileId = row.profile_id as string;
    let perPlayer = byMatch.get(matchId);
    if (!perPlayer) {
      perPlayer = new Map();
      byMatch.set(matchId, perPlayer);
    }
    perPlayer.set(profileId, {
      rating: row.rating_after as number,
      delta: row.delta as number,
    });
  }
  return byMatch;
}

export async function fetchPlayerRatingEvents(
  profileId: string,
  limit = TREND_MATCHES,
) {
  const { data, error } = await supabase
    .from("rating_events")
    .select(RATING_EVENT_SELECT)
    .eq("profile_id", profileId)
    .order("seq", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RatingEvent[];
}

export async function fetchMatchRatingEvents(matchId: string) {
  const { data, error } = await supabase
    .from("rating_events")
    .select(RATING_EVENT_SELECT)
    .eq("match_id", matchId);
  if (error) throw error;

  const byProfile = new Map<string, RatingEvent>();
  for (const row of (data ?? []) as RatingEvent[]) {
    byProfile.set(row.profile_id, row);
  }
  return byProfile;
}

export async function fetchPlayerRatingSummary(
  profileId: string,
): Promise<PlayerRatingSummary> {
  const [rating, events, settings] = await Promise.all([
    fetchPlayerRating(profileId),
    fetchPlayerRatingEvents(profileId),
    fetchRatingSettings(),
  ]);

  return {
    rating,
    trend: ratingTrend(events),
    trendMatches: events.length,
    settings,
  };
}

export function emptyRatingSummary(): PlayerRatingSummary {
  return {
    rating: null,
    trend: null,
    trendMatches: 0,
    settings: DEFAULT_RATING_SETTINGS,
  };
}

export async function fetchRatingLeaderboard(): Promise<RatingLeaderboardRow[]> {
  const { data, error } = await supabase
    .from("player_ratings")
    .select(RATING_SELECT)
    .order("rating", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as PlayerRating[];
  const people = await fetchMembersByIds(rows.map((row) => row.profile_id));

  // Banned and deleted members are filtered out by the profiles policy, so they
  // simply drop off the board.
  return rows.flatMap((row) => {
    const person = people.get(row.profile_id);
    return person ? [{ ...row, person }] : [];
  });
}
