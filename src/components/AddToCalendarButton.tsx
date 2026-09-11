import { Button } from "./ui/Button";
import { cx } from "./ui/cx";
import {
  buildMatchIcs,
  iosCalendarHref,
  isIos,
  isStandaloneDisplay,
  matchIcsKind,
  matchIcsSummary,
  openIcsFile,
  type MatchIcsKind,
} from "../lib/ics";
import type { MatchPlayer, MatchStatus } from "../lib/match";

type AddToCalendarButtonProps = {
  matchId: string;
  playedAt: string;
  status: MatchStatus;
  players: MatchPlayer[];
  durationMinutes?: number | null;
  league?: boolean;
  kind?: MatchIcsKind;
  className?: string;
};

export function AddToCalendarButton({
  matchId,
  playedAt,
  status,
  players,
  durationMinutes,
  league,
  kind,
  className,
}: AddToCalendarButtonProps) {
  if (status !== "scheduled") return null;

  const resolvedKind = kind ?? matchIcsKind(players, Boolean(league));
  const start = new Date(playedAt);
  if (Number.isNaN(start.getTime())) return null;

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const ics = buildMatchIcs({
    id: matchId,
    playedAt,
    players,
    kind: resolvedKind,
    url: `${origin}/kampe/${matchId}`,
    durationMinutes,
  });
  if (!ics) return null;

  const filename = `padel-${matchId}.ics`;
  const onIos = typeof window !== "undefined" && isIos();
  const iosHref = onIos ? iosCalendarHref(filename, ics) : null;
  const openInSafari = onIos && isStandaloneDisplay();

  if (iosHref) {
    return (
      <Button
        variant="secondary"
        className={cx("self-start", className)}
        href={iosHref}
        target={openInSafari ? "_blank" : undefined}
        rel={openInSafari ? "noopener noreferrer" : undefined}
      >
        Tilføj til kalender
      </Button>
    );
  }

  return (
    <Button
      variant="secondary"
      className={cx("self-start", className)}
      onClick={() => {
        void openIcsFile(filename, ics, matchIcsSummary(players, resolvedKind));
      }}
    >
      Tilføj til kalender
    </Button>
  );
}
