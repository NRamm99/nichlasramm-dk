import { Link } from "react-router-dom";
import {
  finalsQualifyCopy,
  formatFinalsWhen,
  knockoutFixtures,
  teamName,
  type League,
  type LeagueFixture,
  type LeagueTeam,
} from "../lib/league";
import { Card } from "./ui/Card";

export function LeagueFinalsCard({
  league,
  teams,
  fixtures,
  ratings,
  compact = false,
}: {
  league: League;
  teams: LeagueTeam[];
  fixtures: LeagueFixture[];
  ratings?: Map<string, number>;
  compact?: boolean;
}) {
  const when = formatFinalsWhen(league);
  const knockout = knockoutFixtures(fixtures);
  if (!league.finals_tba && !league.finals_on && knockout.length === 0) {
    return null;
  }

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const qualifierIds = [
    ...new Set(knockout.flatMap((row) => [row.team_a_id, row.team_b_id])),
  ];

  return (
    <Card
      className={
        compact
          ? "border-ball/40 bg-ball/[0.08] p-5 lg:p-6"
          : "mt-8 border-ball/40 bg-ball/[0.08] p-6"
      }
    >
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ball">
        Finaledag
      </p>
      <p className="mt-2 font-display text-3xl tracking-wide sm:text-4xl">
        {when ?? "Dato kommer"}
      </p>
      {league.finals_venue ? (
        <p className="mt-1 text-sm text-line/70">{league.finals_venue}</p>
      ) : null}
      {league.finals_note ? (
        <p className="mt-2 text-sm text-line/75">{league.finals_note}</p>
      ) : (
        <p className="mt-2 text-sm text-line/70">
          {finalsQualifyCopy(league.group_count ?? 2)}
        </p>
      )}
      {qualifierIds.length > 0 ? (
        <ul className="mt-4 space-y-1.5 text-sm">
          {knockout.map((fixture) => {
            const a = teamById.get(fixture.team_a_id);
            const b = teamById.get(fixture.team_b_id);
            const label =
              fixture.knockout_round === "final"
                ? "Finale"
                : fixture.bracket_slot === 2
                  ? "Semi 2"
                  : "Semi 1";
            return (
              <li key={fixture.id} className="text-line/80">
                <span className="text-line/45">{label}: </span>
                {a ? teamName(a.players, ratings) : "Hold"}
                {" – "}
                {b ? teamName(b.players, ratings) : "Hold"}
              </li>
            );
          })}
        </ul>
      ) : null}
      {compact ? (
        <div className="mt-5">
          <Link
            to="/liga"
            className="inline-flex rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court"
          >
            Se ligaen
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
