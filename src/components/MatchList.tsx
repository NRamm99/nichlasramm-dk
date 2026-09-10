import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LeagueBadge } from "./LeagueBadge";
import { MatchLineup } from "./MatchLineup";
import { ListEmpty, ListGroup } from "./ui/ListGroup";
import {
  formatMatchRelativeDay,
  formatMatchTime,
  isLeagueMatch,
  isSinglesMatch,
  matchLocalDayKey,
  resultForTeam,
  type MatchCard,
} from "../lib/match";
import { fetchMembersByIds, type PartnerPreview } from "../lib/profile";
import { fetchMatchPlayerRatingChips, fetchPlayerRatingsByIds } from "../lib/rating";

type MatchListProps = {
  rows: MatchCard[];
  empty: string;
  userId?: string;
  highlightOwn?: boolean;
  resultFor?: string;
};

type DayGroup = {
  key: string;
  label: string;
  rows: MatchCard[];
};

function groupByLocalDay(rows: MatchCard[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of rows) {
    const key = matchLocalDayKey(row.played_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      groups.push({
        key,
        label: formatMatchRelativeDay(row.played_at),
        rows: [row],
      });
    }
  }
  return groups;
}

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
  const [people, setPeople] = useState<Map<string, PartnerPreview>>(
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
      fetchMembersByIds(profileIds),
    ])
      .then(([chips, ratings, members]) => {
        if (cancelled) return;
        setChipsByMatch(chips);
        const current = new Map<string, number>();
        for (const [id, row] of ratings) current.set(id, row.rating);
        setCurrentRatings(current);
        setPeople(members);
      })
      .catch(() => {
        if (cancelled) return;
        setChipsByMatch(new Map());
        setCurrentRatings(new Map());
        setPeople(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [matchKey]);

  if (rows.length === 0) {
    return (
      <ListGroup className="mt-3">
        <ListEmpty>{empty}</ListEmpty>
      </ListGroup>
    );
  }

  return (
    <div className="mt-3 space-y-5">
      {groupByLocalDay(rows).map((group) => (
        <section key={group.key}>
          <h3 className="mb-2 px-1 text-xs font-semibold text-line/50">
            {group.label}
          </h3>
          <ListGroup>
            {group.rows.map((row) => {
              const isOwn =
                Boolean(highlightOwn && userId) &&
                row.players.some((player) => player.profile_id === userId);
              const team = resultFor
                ? row.players.find((player) => player.profile_id === resultFor)
                    ?.team
                : undefined;
              const result =
                resultFor && team && row.sets.length > 0
                  ? resultForTeam(row.sets, team)
                  : null;
              const upcoming = row.status === "scheduled";
              const time = upcoming ? formatMatchTime(row.played_at) : null;

              return (
                <li key={row.id}>
                  <Link
                    to={`/kampe/${row.id}`}
                    className="block px-3 py-3 transition hover:bg-line/[0.03] lg:px-4 lg:py-3.5"
                  >
                    <MatchRowMeta
                      time={time}
                      league={isLeagueMatch(row)}
                      singles={isSinglesMatch(row.players)}
                      isOwn={isOwn}
                      disputed={Boolean(row.disputed)}
                      result={result}
                    />
                    <MatchLineup
                      players={row.players}
                      sets={upcoming ? [] : row.sets}
                      people={people}
                      ratings={ratingMapForMatch(
                        row.id,
                        chipsByMatch,
                        currentRatings,
                      )}
                      ratingDeltas={
                        upcoming
                          ? undefined
                          : deltaMapForMatch(row.id, chipsByMatch)
                      }
                    />
                    {row.disputed && isOwn ? (
                      <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-red-300">
                        Uenighed om resultatet
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ListGroup>
        </section>
      ))}
    </div>
  );
}

function MatchRowMeta({
  time,
  league,
  singles,
  isOwn,
  disputed,
  result,
}: {
  time: string | null;
  league: boolean;
  singles: boolean;
  isOwn: boolean;
  disputed: boolean;
  result: "V" | "U" | "T" | null;
}) {
  const chips: { key: string; label: string; className: string }[] = [];
  if (league) {
    chips.push({ key: "liga", label: "Liga", className: "text-ball" });
  } else if (singles) {
    chips.push({
      key: "single",
      label: "Single",
      className: "text-line/55",
    });
  }
  if (isOwn) {
    chips.push({
      key: "own",
      label: "Du spiller",
      className: "text-ball/80",
    });
  } else if (disputed) {
    chips.push({
      key: "disputed",
      label: "Uenighed",
      className: "text-red-300",
    });
  } else if (result) {
    chips.push({
      key: "result",
      label: result === "V" ? "Vundet" : result === "U" ? "Ulige" : "Tabt",
      className:
        result === "V"
          ? "text-ball"
          : result === "U"
            ? "text-line/70"
            : "text-line/40",
    });
  }

  if (!time && chips.length === 0) return null;

  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      {time ? (
        <p className="text-xs tabular-nums text-line/50">{time}</p>
      ) : (
        <span />
      )}
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {chips.map((chip) =>
            chip.key === "liga" ? (
              <LeagueBadge key={chip.key} />
            ) : (
              <span
                key={chip.key}
                className={`text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${chip.className}`}
              >
                {chip.label}
              </span>
            ),
          )}
        </div>
      ) : null}
    </div>
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
