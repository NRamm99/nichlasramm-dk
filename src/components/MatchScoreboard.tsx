import { Link } from "react-router-dom";
import {
  isCompleteSet,
  matchOutcome,
  teamPlayers,
  type MatchPlayer,
  type MatchSet,
} from "../lib/match";
import { profilePath } from "../lib/profile";

type MatchScoreboardProps = {
  players: MatchPlayer[];
  sets: MatchSet[];
  usernames?: Map<string, string>;
  compact?: boolean;
};

export function MatchScoreboard({
  players,
  sets,
  usernames,
  compact = false,
}: MatchScoreboardProps) {
  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number);
  const outcome = matchOutcome(ordered);
  const team1 = teamPlayers(players, 1);
  const team2 = teamPlayers(players, 2);

  if (ordered.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className="space-y-1.5">
        <CompactTeam
          players={team1}
          games={ordered.map((row) => row.team1_games)}
          opponents={ordered.map((row) => row.team2_games)}
          setsWon={outcome.team1}
          wonMatch={outcome.winner === 1}
        />
        <CompactTeam
          players={team2}
          games={ordered.map((row) => row.team2_games)}
          opponents={ordered.map((row) => row.team1_games)}
          setsWon={outcome.team2}
          wonMatch={outcome.winner === 2}
        />
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid">
      <WinnerBanner
        winner={outcome.winner}
        unfinished={outcome.unfinished}
        team1={team1}
        team2={team2}
        team1Sets={outcome.team1}
        team2Sets={outcome.team2}
      />

      <div className="px-3 py-4 sm:px-5 sm:py-5">
        <TeamBoard
          players={team1}
          games={ordered.map((row) => row.team1_games)}
          opponents={ordered.map((row) => row.team2_games)}
          setsWon={outcome.team1}
          wonMatch={outcome.winner === 1}
          usernames={usernames}
        />
        <div className="my-2 flex items-center gap-3 px-2">
          <span className="h-px flex-1 bg-line/10" />
          <span className="font-display text-lg tracking-[0.3em] text-line/25">
            VS
          </span>
          <span className="h-px flex-1 bg-line/10" />
        </div>
        <TeamBoard
          players={team2}
          games={ordered.map((row) => row.team2_games)}
          opponents={ordered.map((row) => row.team1_games)}
          setsWon={outcome.team2}
          wonMatch={outcome.winner === 2}
          usernames={usernames}
        />
      </div>
    </article>
  );
}

function WinnerBanner({
  winner,
  unfinished,
  team1,
  team2,
  team1Sets,
  team2Sets,
}: {
  winner: 1 | 2 | null;
  unfinished: boolean;
  team1: MatchPlayer[];
  team2: MatchPlayer[];
  team1Sets: number;
  team2Sets: number;
}) {
  const names = (winner === 2 ? team2 : team1)
    .map((player) => player.display_name)
    .join(" & ");

  if (winner) {
    return (
      <div className="relative overflow-hidden bg-ball px-5 py-5 text-court sm:px-7">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em]">
          Vinder
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <p className="font-display text-4xl leading-[0.9] tracking-wide sm:text-5xl">
            {names}
          </p>
          <p className="shrink-0 font-display text-6xl leading-none tracking-wide sm:text-7xl">
            {team1Sets}–{team2Sets}
          </p>
        </div>
        {unfinished ? (
          <p className="mt-2 text-xs font-medium opacity-70">
            Kampen blev afbrudt
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-line px-5 py-5 text-court sm:px-7">
      <div className="flex items-end justify-between gap-4">
        <p className="font-display text-4xl leading-[0.9] tracking-wide sm:text-5xl">
          Uafgjort
        </p>
        <p className="shrink-0 font-display text-6xl leading-none tracking-wide sm:text-7xl">
          {team1Sets}–{team2Sets}
        </p>
      </div>
      <p className="mt-2 text-xs font-medium opacity-70">
        {unfinished
          ? "Kampen blev afbrudt"
          : "Holdene har vundet lige mange sæt"}
      </p>
    </div>
  );
}

function TeamBoard({
  players,
  games,
  opponents,
  setsWon,
  wonMatch,
  usernames,
}: {
  players: MatchPlayer[];
  games: number[];
  opponents: number[];
  setsWon: number;
  wonMatch: boolean;
  usernames?: Map<string, string>;
}) {
  return (
    <div
      className={`grid items-center gap-2 rounded-2xl px-2 py-2 sm:px-3 ${
        wonMatch ? "bg-ball/10 ring-1 ring-ball/35" : "bg-court-mid/60"
      }`}
      style={{
        gridTemplateColumns: `minmax(0,1fr) repeat(${games.length}, 3.15rem) 3.4rem`,
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5 pl-1">
        <span
          className={`h-10 w-1 shrink-0 rounded-full ${
            wonMatch ? "bg-ball" : "bg-line/15"
          }`}
          aria-hidden
        />
        <div className="min-w-0">
          {wonMatch ? (
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-ball">
              Vinder
            </p>
          ) : null}
          {players.map((player) => {
            const username = player.profile_id
              ? usernames?.get(player.profile_id)
              : undefined;
            const className = `block truncate font-semibold leading-tight ${
              wonMatch ? "text-line" : "text-line/75"
            }`;
            if (username) {
              return (
                <Link
                  key={player.id}
                  to={profilePath(username)}
                  className={`${className} hover:text-ball`}
                >
                  {player.display_name}
                </Link>
              );
            }
            return (
              <p key={player.id} className={className}>
                {player.display_name}
              </p>
            );
          })}
        </div>
      </div>
      {games.map((value, index) => (
        <SetTile
          key={index}
          value={value}
          opponent={opponents[index] ?? 0}
        />
      ))}
      <p
        className={`text-center font-display text-4xl leading-none tabular-nums sm:text-5xl ${
          wonMatch ? "text-ball" : "text-line/35"
        }`}
        aria-label={`${setsWon} vundne sæt`}
      >
        {setsWon}
      </p>
    </div>
  );
}

function SetTile({ value, opponent }: { value: number; opponent: number }) {
  const complete = isCompleteSet(value, opponent);
  const leading = value > opponent;

  return (
    <div
      className={`flex h-[3.15rem] items-center justify-center rounded-xl border font-display text-3xl leading-none tabular-nums sm:text-4xl ${
        leading
          ? complete
            ? "border-ball/50 bg-ball/15 text-ball"
            : "border-dashed border-ball/50 bg-ball/10 text-ball"
          : complete
            ? "border-line/10 bg-court text-line/40"
            : "border-dashed border-line/20 bg-court text-line/55"
      }`}
    >
      {value}
    </div>
  );
}

function CompactTeam({
  players,
  games,
  opponents,
  setsWon,
  wonMatch,
}: {
  players: MatchPlayer[];
  games: number[];
  opponents: number[];
  setsWon: number;
  wonMatch: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <p
        className={`min-w-0 flex-1 truncate text-sm ${
          wonMatch ? "font-semibold text-line" : "text-line/65"
        }`}
      >
        {wonMatch ? "● " : ""}
        {players.map((player) => player.display_name.split(" ")[0]).join(" / ")}
      </p>
      <div className="flex items-center gap-1">
        {games.map((value, index) => {
          const opponent = opponents[index] ?? 0;
          const complete = isCompleteSet(value, opponent);
          const leading = value > opponent;
          return (
            <span
              key={index}
              className={`flex h-8 w-8 items-center justify-center rounded-md font-display text-xl leading-none tabular-nums ${
                leading
                  ? "bg-ball text-court"
                  : complete
                    ? "bg-court text-line/40"
                    : "border border-dashed border-line/25 bg-court text-line/70"
              }`}
            >
              {value}
            </span>
          );
        })}
        <span
          className={`ml-1.5 w-5 text-center font-display text-2xl leading-none ${
            wonMatch ? "text-ball" : "text-line/35"
          }`}
          aria-label={`${setsWon} vundne sæt`}
        >
          {setsWon}
        </span>
      </div>
    </div>
  );
}
