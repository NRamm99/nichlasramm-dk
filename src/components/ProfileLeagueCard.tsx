import { Link } from "react-router-dom";
import { MemberAvatar } from "./MemberAvatar";
import { Card } from "./ui/Card";
import { groupLabel, type PlayerLeagueCard } from "../lib/league";

function leagueName(card: PlayerLeagueCard) {
  const named = card.leagueName.trim();
  if (!named || named.toLowerCase() === "liga") return null;
  return named;
}

export function ProfileLeagueCard({
  card,
  isOwn,
}: {
  card: PlayerLeagueCard | null;
  isOwn: boolean;
}) {
  if (!card && !isOwn) return null;

  const actionTo = isOwn && card ? "/liga/kampe" : "/liga";
  const actionLabel = isOwn && card ? "Ligakampe" : card ? "Se liga" : "Tilmeld";
  const named = card ? leagueName(card) : null;
  const group = card?.groupLabel ? groupLabel(card.groupLabel) : null;

  return (
    <Card className="relative overflow-hidden p-4 sm:p-5">
      <div
        className="pointer-events-none absolute -right-10 top-0 h-36 w-48 rounded-full bg-ball/12 blur-3xl"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-4xl leading-none tracking-wide sm:text-5xl">
              Liga
            </h2>
            {group ? (
              <span className="rounded-full border border-ball/30 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ball">
                {group}
              </span>
            ) : null}
          </div>
          {!card ? (
            <p className="mt-2 text-sm text-line/55">Ikke tilmeldt</p>
          ) : named ? (
            <p className="mt-2 text-sm text-line/55">{named}</p>
          ) : group ? null : (
            <p className="mt-2 text-sm text-line/55">Tilmeldt — venter på gruppe</p>
          )}
        </div>
        <Link
          to={actionTo}
          className="shrink-0 whitespace-nowrap rounded-full border border-ball/35 px-3 py-1.5 text-xs font-semibold text-ball hover:bg-ball/10"
        >
          {actionLabel} →
        </Link>
      </div>

      {card ? (
        card.place != null ? (
          <Link
            to="/liga"
            className="relative mt-5 flex items-center gap-4 touch-manipulation sm:gap-5"
          >
            <span className="shrink-0">
              <span className="ui-label block">Plads</span>
              <span className="mt-1 block font-display text-7xl leading-none tracking-wide text-ball sm:text-8xl">
                #{card.place}
              </span>
            </span>
            <TeamAvatars people={card.teamMates} />
          </Link>
        ) : (
          <div className="relative mt-5">
            <p className="text-sm text-line/55">
              {card.groupLabel ? "Venter på stilling" : "Tilmeldt — venter på gruppe"}
            </p>
            {card.teamMates.length > 0 ? (
              <div className="mt-3">
                <TeamAvatars people={card.teamMates} />
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </Card>
  );
}

function TeamAvatars({
  people,
}: {
  people: PlayerLeagueCard["teamMates"];
}) {
  if (people.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center">
      {people.map((person, index) => (
        <span
          key={person.id}
          className={`relative ${index > 0 ? "-ml-4 sm:-ml-5" : ""}`}
          style={{ zIndex: people.length - index }}
        >
          <MemberAvatar
            person={person}
            size="stack"
            ring={index === 0 ? "ball" : "line"}
          />
        </span>
      ))}
    </div>
  );
}
