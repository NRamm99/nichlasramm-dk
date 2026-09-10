import { MemberAvatar } from "./MemberAvatar";
import { ratingDeltaClass } from "./RatingValue";
import {
  isCompleteSet,
  matchOutcome,
  teamPlayers,
  type MatchPlayer,
  type MatchSet,
} from "../lib/match";
import {
  listPlayerName,
  type PartnerPreview,
} from "../lib/profile";

type MatchLineupProps = {
  players: MatchPlayer[];
  sets?: MatchSet[];
  people: Map<string, PartnerPreview>;
  ratings?: Map<string, number>;
  ratingDeltas?: Map<string, number>;
};

export function MatchLineup({
  players,
  sets = [],
  people,
  ratings,
  ratingDeltas,
}: MatchLineupProps) {
  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number);
  const outcome = ordered.length > 0 ? matchOutcome(ordered) : null;
  const team1 = teamPlayers(players, 1);
  const team2 = teamPlayers(players, 2);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 lg:gap-3">
      <TeamStack
        players={team1}
        people={people}
        ratings={ratings}
        ratingDeltas={ratingDeltas}
        won={outcome?.winner === 1}
        align="start"
      />
      {outcome ? (
        <MatchScore
          sets={ordered}
          team1Won={outcome.team1}
          team2Won={outcome.team2}
          winner={outcome.winner}
        />
      ) : (
        <p className="shrink-0 px-0.5 font-display text-xl leading-none tracking-wide text-line/35 lg:px-2 lg:text-4xl">
          vs
        </p>
      )}
      <TeamStack
        players={team2}
        people={people}
        ratings={ratings}
        ratingDeltas={ratingDeltas}
        won={outcome?.winner === 2}
        align="end"
      />
    </div>
  );
}

function TeamStack({
  players,
  people,
  ratings,
  ratingDeltas,
  won,
  align,
}: {
  players: MatchPlayer[];
  people: Map<string, PartnerPreview>;
  ratings?: Map<string, number>;
  ratingDeltas?: Map<string, number>;
  won: boolean;
  align: "start" | "end";
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-0.5 lg:gap-1 ${
        align === "end" ? "items-end" : "items-start"
      }`}
    >
      {players.map((player) => {
        const person = playerPreview(player, people);
        const rating = player.profile_id
          ? ratings?.get(player.profile_id)
          : undefined;
        const delta = player.profile_id
          ? ratingDeltas?.get(player.profile_id)
          : undefined;
        return (
          <div
            key={player.id}
            className={`flex min-w-0 max-w-full items-center gap-1.5 lg:gap-2 ${
              align === "end" ? "flex-row-reverse" : ""
            }`}
          >
            <MemberAvatar
              person={person}
              size="xs"
              ring="court"
              className="max-lg:h-6 max-lg:w-6"
            />
            <p
              className={`min-w-0 truncate text-xs lg:text-sm ${
                won ? "font-semibold text-line" : "text-line/65"
              } ${align === "end" ? "text-right" : ""}`}
            >
              {listPlayerName(player.display_name, person)}
              <PlayerRatingSuffix rating={rating} delta={delta} />
            </p>
          </div>
        );
      })}
    </div>
  );
}

function MatchScore({
  sets,
  team1Won,
  team2Won,
  winner,
}: {
  sets: MatchSet[];
  team1Won: number;
  team2Won: number;
  winner: 1 | 2 | null;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5 px-0.5 lg:gap-1 lg:px-1">
      <p className="font-display text-xl leading-none tracking-wide lg:text-4xl">
        <span className={winner === 1 ? "text-ball" : "text-line/40"}>
          {team1Won}
        </span>
        <span className="text-line/25">–</span>
        <span className={winner === 2 ? "text-ball" : "text-line/40"}>
          {team2Won}
        </span>
      </p>
      <p className="max-w-[5.75rem] text-center text-[0.62rem] font-medium leading-tight tabular-nums text-line/45 lg:max-w-none lg:text-[0.7rem]">
        {sets.map((row, index) => (
          <span key={row.id}>
            {index > 0 ? <span className="text-line/20"> · </span> : null}
            {row.team1_games}–{row.team2_games}
            {!isCompleteSet(row.team1_games, row.team2_games) ? "*" : null}
          </span>
        ))}
      </p>
    </div>
  );
}

function playerPreview(
  player: MatchPlayer,
  people: Map<string, PartnerPreview>,
): PartnerPreview {
  if (player.profile_id) {
    const person = people.get(player.profile_id);
    if (person) return person;
    return {
      id: player.profile_id,
      username: null,
      first_name: player.display_name,
      last_name: null,
      avatar_url: null,
    };
  }
  const parts = (player.guest_name ?? player.display_name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    id: player.id,
    username: null,
    first_name: parts[0] ?? player.display_name,
    last_name: parts.length > 1 ? parts[parts.length - 1] : null,
    avatar_url: null,
  };
}

function PlayerRatingSuffix({
  rating,
  delta,
}: {
  rating?: number;
  delta?: number;
}) {
  return (
    <>
      {rating != null ? (
        <span className="font-normal tabular-nums text-line/45"> ({rating})</span>
      ) : null}
      {delta != null ? (
        <span
          className={`font-sans text-[0.7rem] font-semibold tabular-nums tracking-normal ${ratingDeltaClass(delta)}`}
        >
          {" "}
          {delta > 0 ? `+ ${delta}` : delta < 0 ? `− ${Math.abs(delta)}` : "± 0"}
        </span>
      ) : null}
    </>
  );
}
