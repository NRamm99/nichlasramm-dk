import { Button } from "./ui/Button";
import { cx } from "./ui/cx";
import {
  buildMatchIcs,
  googleCalendarUrl,
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
  const matchUrl = `${origin}/kampe/${matchId}`;
  const ics = buildMatchIcs({
    id: matchId,
    playedAt,
    players,
    kind: resolvedKind,
    url: matchUrl,
    durationMinutes,
  });
  if (!ics) return null;

  const filename = `padel-${matchId}.ics`;
  const summary = matchIcsSummary(players, resolvedKind);
  const onIos = typeof window !== "undefined" && isIos();
  const appleHref = onIos ? iosCalendarHref(filename, ics) : null;
  const googleHref = onIos
    ? googleCalendarUrl({
        summary,
        playedAt,
        durationMinutes,
        details: `${summary}\n${matchUrl}`,
      })
    : null;

  if (appleHref) {
    return (
      <div className={cx("flex flex-col items-start gap-2", className)}>
        <Button
          variant="secondary"
          href={appleHref}
          target={isStandaloneDisplay() ? "_blank" : undefined}
          rel={isStandaloneDisplay() ? "noopener noreferrer" : undefined}
        >
          Tilføj til kalender
        </Button>
        {googleHref ? (
          <Button
            variant="ghost"
            href={googleHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Kalender
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      className={cx("self-start", className)}
      onClick={() => {
        void openIcsFile(filename, ics, summary);
      }}
    >
      Tilføj til kalender
    </Button>
  );
}
