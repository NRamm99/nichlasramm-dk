import { Button } from "./ui/Button";
import { cx } from "./ui/cx";
import {
  buildMatchIcs,
  googleCalendarUrl,
  isIos,
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
  const matchUrl = `${origin}/kampe/${matchId}`;
  const summary = matchIcsSummary(players, resolvedKind);

  if (typeof window !== "undefined" && isIos()) {
    const href = googleCalendarUrl({
      summary,
      playedAt,
      durationMinutes,
      details: `${summary}\n${matchUrl}`,
    });
    if (!href) return null;
    return (
      <Button
        variant="secondary"
        className={cx("self-start", className)}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        Tilføj til kalender
      </Button>
    );
  }

  const ics = buildMatchIcs({
    id: matchId,
    playedAt,
    players,
    kind: resolvedKind,
    url: matchUrl,
    durationMinutes,
  });
  if (!ics) return null;

  return (
    <Button
      variant="secondary"
      className={cx("self-start", className)}
      onClick={() => {
        void openIcsFile(`padel-${matchId}.ics`, ics, summary);
      }}
    >
      Tilføj til kalender
    </Button>
  );
}
