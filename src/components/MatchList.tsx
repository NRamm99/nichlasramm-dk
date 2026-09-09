import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LeagueBadge } from "./LeagueBadge";
import { MatchScoreboard } from "./MatchScoreboard";
import {
  formatMatchWhen,
  isLeagueMatch,
  isSinglesMatch,
  resultForTeam,
  teamNames,
  type MatchCard,
} from "../lib/match";
import { fetchMatchPlayerRatingChips, fetchPlayerRatingsByIds } from "../lib/rating";

type MatchListProps = {
  rows: MatchCard[];
  empty: string;
  userId?: string;
  highlightOwn?: boolean;
  resultFor?: string;
};

export function MatchList({
  rows,
  empty,
  userId,
  highlightOwn = false,
  resultFor,
}: MatchListProps) {
  const [chipsByMatch, setChipsByMatch] = useState<
    Map<string, Map<string, { rating: number; delta: number }>>
  >(new Map());
  const [currentRatings, setCurrentRatings] = useState<Map<string, number>>(
    new Map(),
  );
  const matchKey = rows.map((row) => row.id).join(",");

  useEffect(() => {
    const ids = matchKey ? matchKey.split(",") : [];
    const profileIds = rows.flatMap((row) =>
      row.players.map((player) => player.profile_id),
    );
    let cancelled = false;
    void Promise.all([
      fetchMatchPlayerRatingChips(ids),
      fetchPlayerRatingsByIds(profileIds),
    ])
      .then(([chips, ratings]) => {
        if (cancelled) return;
        setChipsByMatch(chips);
        const current = new Map<string, number>();
        for (const [id, row] of ratings) current.set(id, row.rating);
        setCurrentRatings(current);
      })
      .catch(() => {
        if (cancelled) return;
        setChipsByMatch(new Map());
        setCurrentRatings(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [matchKey]);

  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-line/10 bg-court-mid px-5 py-4 text-sm text-line/60">
        {empty}
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {rows.map((row) => {
        const isOwn =
          Boolean(highlightOwn && userId) &&
          row.players.some((player) => player.profile_id === userId);
        const team = resultFor
          ? row.players.find((player) => player.profile_id === resultFor)?.team
          : undefined;
        const result =
          resultFor && team && row.sets.length > 0
            ? resultForTeam(row.sets, team)
            : null;

        return (
          <li key={row.id}>
            <Link
              to={`/kampe/${row.id}`}
              className={`block rounded-2xl border bg-court-mid px-5 py-4 transition ${
                isOwn
                  ? "border-ball/35 hover:border-ball/55"
                  : isLeagueMatch(row)
                    ? "border-ball/20 hover:border-ball/40"
                    : "border-line/10 hover:border-ball/40"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="text-xs text-line/55">
                    {formatMatchWhen(row.played_at)}
                  </p>
                  {isLeagueMatch(row) ? (
                    <LeagueBadge />
                  ) : isSinglesMatch(row.players) ? (
                    <span className="inline-flex items-center rounded-full bg-line/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-line/70">
                      Single
                    </span>
                  ) : null}
                </div>
                {isOwn ? (
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ball/80">
                    Du spiller
                  </p>
                ) : row.disputed ? (
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-red-300">
                    Uenighed
                  </p>
                ) : result ? (
                  <p
                    className={`text-[0.65rem] font-semibold uppercase tracking-[0.16em] ${
                      result === "V"
                        ? "text-ball"
                        : result === "U"
                          ? "text-line/70"
                          : "text-line/40"
                    }`}
                  >
                    {result === "V"
                      ? "Vundet"
                      : result === "U"
                        ? "Ulige"
                        : "Tabt"}
                  </p>
                ) : null}
              </div>
              {row.sets.length > 0 ? (
                <div className="mt-3">
                  <MatchScoreboard
                    players={row.players}
                    sets={row.sets}
                    compact
                    ratings={ratingMapForMatch(row.id, chipsByMatch, currentRatings)}
                    ratingDeltas={deltaMapForMatch(row.id, chipsByMatch)}
                  />
                </div>
              ) : (
                <div className="mt-1 text-sm font-semibold text-line">
                  <p>{teamNames(row.players, 1, currentRatings)}</p>
                  <p className="font-normal text-line/45">Vs.</p>
                  <p>{teamNames(row.players, 2, currentRatings)}</p>
                </div>
              )}
              {row.disputed && isOwn ? (
                <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-red-300">
                  Uenighed om resultatet
                </p>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ratingMapForMatch(
  matchId: string,
  chipsByMatch: Map<string, Map<string, { rating: number; delta: number }>>,
  currentRatings: Map<string, number>,
) {
  const chips = chipsByMatch.get(matchId);
  if (!chips) return currentRatings;
  const ratings = new Map(currentRatings);
  for (const [id, chip] of chips) ratings.set(id, chip.rating);
  return ratings;
}

function deltaMapForMatch(
  matchId: string,
  chipsByMatch: Map<string, Map<string, { rating: number; delta: number }>>,
) {
  const chips = chipsByMatch.get(matchId);
  if (!chips) return undefined;
  const deltas = new Map<string, number>();
  for (const [id, chip] of chips) deltas.set(id, chip.delta);
  return deltas;
}
