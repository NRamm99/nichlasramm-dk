import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LeagueMatchTitle } from "./LeagueBadge";
import { MatchLineup, MatchMeta } from "./MatchLineup";
import { ListEmpty, ListGroup } from "./ui/ListGroup";
import {
  formatMatchRelativeDay,
  formatMatchTimeRange,
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
              const time = upcoming
                ? formatMatchTimeRange(row.played_at, row.duration_minutes)
                : null;
              const league = isLeagueMatch(row);

              return (
                <li
                  key={row.id}
                  className={league ? "bg-ball/[0.05]" : undefined}
                >
                  <Link
                    to={`/kampe/${row.id}`}
                    className={`relative block px-3 pb-3 transition lg:px-4 lg:pb-3.5 ${
                      league
                        ? "pt-3 shadow-[inset_0_0_0_1px_rgba(214,255,61,0.16)] hover:bg-ball/[0.07] lg:pt-3.5"
                        : "pt-3 hover:bg-line/[0.03] lg:pt-3.5"
                    }`}
                  >
                    {league ? <LeagueMatchTitle /> : null}
                    <MatchMeta
                      time={time}
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
