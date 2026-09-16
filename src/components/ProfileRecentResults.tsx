import { Link } from "react-router-dom";
import {
  isLeagueMatch,
  matchOutcome,
  resultForTeam,
  setScoreLine,
  teamPlayers,
  type MatchCard,
} from "../lib/match";
import { Card } from "./ui/Card";

function firstNames(match: MatchCard, team: 1 | 2) {
  return teamPlayers(match.players, team)
    .map((player) => player.display_name.trim().split(/\s+/)[0] ?? player.display_name)
    .join(" / ");
}

function setsForPlayer(match: MatchCard, team: 1 | 2) {
  const { team1, team2 } = matchOutcome(match.sets);
  const mine = team === 1 ? team1 : team2;
  const theirs = team === 1 ? team2 : team1;
  return `${mine}–${theirs}`;
}

export function ProfileRecentResults({
  profileId,
  matches,
  matchesTo,
  hidden,
}: {
  profileId: string;
  matches: MatchCard[];
  matchesTo?: string;
  hidden?: boolean;
}) {
  if (hidden) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="ui-label">Seneste resultater</p>
        {matchesTo ? (
          <Link
            to={matchesTo}
            className="shrink-0 text-xs font-semibold text-ball hover:underline"
          >
            Se alle
          </Link>
        ) : null}
      </div>

      {matches.length === 0 ? (
        <p className="mt-3 text-sm text-line/50">Ingen afsluttede kampe endnu.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line/10">
          {matches.map((match) => {
            const team =
              match.players.find((player) => player.profile_id === profileId)
                ?.team === 2
                ? 2
                : 1;
            const result = resultForTeam(match.sets, team);
            const badge =
              result === "V"
                ? { label: "Vundet", className: "bg-ball/20 text-ball" }
                : result === "T"
                  ? { label: "Tabt", className: "bg-red-500/15 text-red-300" }
                  : { label: "Ulige", className: "bg-line/10 text-line/65" };
            const opponents = firstNames(match, team === 1 ? 2 : 1);
            const games = setScoreLine(match.sets, team);

            return (
              <li key={match.id}>
                <Link
                  to={`/kampe/${match.id}`}
                  title={games}
                  className="flex items-center gap-3 py-2.5 touch-manipulation hover:text-ball"
                >
                  <span className="w-9 shrink-0 text-sm font-semibold tabular-nums text-line">
                    {setsForPlayer(match, team)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold">{opponents}</span>
                    {isLeagueMatch(match) ? (
                      <span className="text-line/40"> · Liga</span>
                    ) : null}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
