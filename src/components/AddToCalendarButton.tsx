import { Button } from "./ui/Button";
import { cx } from "./ui/cx";
import {
  buildMatchIcs,
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

  async function handleClick() {
    const url = `${window.location.origin}/kampe/${matchId}`;
    const ics = buildMatchIcs({
      id: matchId,
      playedAt,
      players,
      kind: resolvedKind,
      url,
      durationMinutes,
    });
    if (!ics) return;
    await openIcsFile(
      `padel-${matchId}.ics`,
      ics,
      matchIcsSummary(players, resolvedKind),
    );
  }

  return (
    <Button
      variant="secondary"
      className={cx("self-start", className)}
      onClick={() => void handleClick()}
    >
      Tilføj til kalender
    </Button>
  );
}
