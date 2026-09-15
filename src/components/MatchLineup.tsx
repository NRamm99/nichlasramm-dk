import { Link } from "react-router-dom";
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
  profilePath,
  type PartnerPreview,
} from "../lib/profile";

type MatchLineupProps = {
  players: MatchPlayer[];
  sets?: MatchSet[];
  people: Map<string, PartnerPreview>;
  ratings?: Map<string, number>;
  ratingDeltas?: Map<string, number>;
  size?: "list" | "detail";
  linkProfiles?: boolean;
};

export function MatchLineup({
  players,
  sets = [],
  people,
  ratings,
  ratingDeltas,
  size = "list",
  linkProfiles = false,
}: MatchLineupProps) {
  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number);
  const outcome = ordered.length > 0 ? matchOutcome(ordered) : null;
  const team1 = teamPlayers(players, 1);
  const team2 = teamPlayers(players, 2);
  const detail = size === "detail";

  return (
    <div
      className={
        detail
          ? "flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-x-5 lg:gap-y-2"
          : "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 lg:gap-x-3"
      }
    >
      <TeamStack
        players={team1}
        people={people}
        ratings={ratings}
        ratingDeltas={ratingDeltas}
        won={outcome?.winner === 1}
        lost={outcome?.winner === 2}
        align="start"
        detail={detail}
        linkProfiles={linkProfiles}
      />
      {outcome ? (
        <MatchScore
          sets={ordered}
          team1Won={outcome.team1}
          team2Won={outcome.team2}
          winner={outcome.winner}
          draw={!outcome.winner}
          detail={detail}
        />
      ) : (
        <p
          className={`shrink-0 text-center font-display leading-none tracking-wide text-line/35 ${
            detail
              ? "py-1 text-4xl lg:px-3 lg:py-0 lg:text-5xl"
              : "px-0.5 text-xl lg:px-2 lg:text-4xl"
          }`}
        >
          vs
        </p>
      )}
      <TeamStack
        players={team2}
        people={people}
        ratings={ratings}
        ratingDeltas={ratingDeltas}
        won={outcome?.winner === 2}
        lost={outcome?.winner === 1}
        align="end"
        detail={detail}
        linkProfiles={linkProfiles}
      />
    </div>
  );
}

export function MatchMeta({
  time,
  singles,
  isOwn,
  disputed,
  result,
}: {
  time: string | null;
  singles: boolean;
  isOwn: boolean;
  disputed: boolean;
  result: "V" | "U" | "T" | null;
}) {
  const chips: { key: string; label: string; className: string }[] = [];
  if (singles) {
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
          {chips.map((chip) => (
            <span
              key={chip.key}
              className={`text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${chip.className}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TeamStack({
  players,
  people,
  ratings,
  ratingDeltas,
  won,
  lost,
  align,
  detail,
  linkProfiles,
}: {
  players: MatchPlayer[];
  people: Map<string, PartnerPreview>;
  ratings?: Map<string, number>;
  ratingDeltas?: Map<string, number>;
  won: boolean;
  lost: boolean;
  align: "start" | "end";
  detail: boolean;
  linkProfiles: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col ${
        detail
          ? "w-full gap-2 px-3 py-2.5 lg:w-auto lg:gap-2 lg:px-2.5 lg:py-2"
          : "gap-0.5 lg:gap-1"
      } ${
        detail
          ? align === "end"
            ? "items-start lg:items-end"
            : "items-start"
          : align === "end"
            ? "items-end"
            : "items-start"
      } ${
        won && detail
          ? "rounded-2xl bg-ball/10 ring-1 ring-ball/40"
          : lost && detail
            ? "rounded-2xl bg-line/[0.04] opacity-70 lg:rounded-none lg:bg-transparent lg:opacity-50"
            : detail
              ? "rounded-2xl bg-line/[0.04] lg:rounded-none lg:bg-transparent"
              : ""
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
        const nameClass = `min-w-0 truncate ${
          detail ? "text-sm lg:text-base" : "max-w-full text-xs lg:text-sm"
        } ${
          won
            ? "font-semibold text-ball"
            : lost
              ? "text-line/50"
              : "text-line/65"
        }`;
        const name = listPlayerName(player.display_name, person);
        const nameNode =
          linkProfiles && person.username ? (
            <Link
              to={profilePath(person.username)}
              className={`${nameClass} hover:text-ball`}
            >
              {name}
            </Link>
          ) : (
            <p className={nameClass}>{name}</p>
          );

        return (
          <div
            key={player.id}
            className={`flex min-w-0 items-center ${
              detail
                ? "w-full gap-2.5 lg:w-auto lg:max-w-full lg:gap-2.5"
                : "max-w-full gap-1.5 lg:gap-2"
            } ${
              align === "end"
                ? detail
                  ? "lg:flex-row-reverse"
                  : "flex-row-reverse"
                : ""
            }`}
          >
            <MemberAvatar
              person={person}
              size={detail ? "sm" : "xs"}
              ring={won ? "ball" : "court"}
              className={detail ? "max-lg:h-9 max-lg:w-9" : "max-lg:h-6 max-lg:w-6"}
            />
            <div
              className={
                detail
                  ? `flex min-w-0 flex-1 items-baseline justify-between gap-2 lg:flex-none lg:justify-start lg:gap-1 ${
                      align === "end" ? "lg:flex-row-reverse" : ""
                    }`
                  : `flex min-w-0 max-w-full flex-col lg:flex-row lg:items-baseline lg:gap-1 ${
                      align === "end" ? "items-end" : "items-start"
                    }`
              }
            >
              {nameNode}
              <PlayerRatingSuffix rating={rating} delta={delta} />
            </div>
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
  draw,
  detail,
}: {
  sets: MatchSet[];
  team1Won: number;
  team2Won: number;
  winner: 1 | 2 | null;
  draw: boolean;
  detail: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 flex-col items-center ${
        detail
          ? "gap-1 py-1 lg:gap-1.5 lg:px-2 lg:py-0"
          : "gap-0.5 px-0.5 lg:gap-1 lg:px-1"
      }`}
    >
      <p
        className={`font-display leading-none tracking-wide ${
          detail ? "text-4xl lg:text-5xl" : "text-xl lg:text-4xl"
        }`}
      >
        <span
          className={
            winner === 1 ? "text-ball" : draw ? "text-line/70" : "text-line/35"
          }
        >
          {team1Won}
        </span>
        <span className="text-line/25">–</span>
        <span
          className={
            winner === 2 ? "text-ball" : draw ? "text-line/70" : "text-line/35"
          }
        >
          {team2Won}
        </span>
      </p>
      {draw ? (
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-line/45">
          Uafgjort
        </p>
      ) : null}
      <p
        className={`text-center font-medium leading-tight tabular-nums text-line/45 ${
          detail
            ? "max-w-none text-xs lg:text-sm"
            : "max-w-[5.75rem] text-[0.62rem] lg:max-w-none lg:text-[0.7rem]"
        }`}
      >
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
  if (rating == null && delta == null) return null;

  return (
    <span className="mt-0.5 flex shrink-0 items-baseline gap-x-1 font-sans text-[0.65rem] leading-none tracking-normal lg:mt-0 lg:text-[0.7rem]">
      {rating != null ? (
        <span className="font-normal tabular-nums text-line/45">({rating})</span>
      ) : null}
      {delta != null ? (
        <span
          className={`font-semibold tabular-nums ${ratingDeltaClass(delta)}`}
        >
          {delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "±0"}
        </span>
      ) : null}
    </span>
  );
}
