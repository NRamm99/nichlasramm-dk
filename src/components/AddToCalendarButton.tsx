import { Button } from "./ui/Button";
import { cx } from "./ui/cx";
import {
  buildMatchIcs,
  googleCalendarUrl,
  isIos,
  matchIcsKind,
  matchIcsSummary,
  openExternalUrl,
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
  const googleHref = googleCalendarUrl({
    summary,
    playedAt,
    durationMinutes,
    details: `${summary}\n${matchUrl}`,
  });

  if (typeof window !== "undefined" && isIos()) {
    if (!googleHref) return null;
    return (
      <Button
        variant="secondary"
        className={cx("self-start", className)}
        onClick={() => openExternalUrl(googleHref)}
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
