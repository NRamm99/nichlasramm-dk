import { MemberAvatar } from "./MemberAvatar";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { groupLabel, type PlayerLeagueCard } from "../lib/league";
import { messagePath } from "../lib/messages";
import { fullName, type PublicProfile } from "../lib/profile";
import { profileHeroChips, type HeroChipKind } from "../lib/profilePlayStyle";
import { isProvisional, type PlayerRatingSummary } from "../lib/rating";

export function ProfileHero({
  profile,
  isOwn,
  ratingSummary,
  league,
  onEdit,
  onShare,
}: {
  profile: PublicProfile;
  isOwn: boolean;
  ratingSummary: PlayerRatingSummary;
  league: PlayerLeagueCard | null;
  onEdit?: () => void;
  onShare?: () => void;
}) {
  const chips = profileHeroChips(profile);
  const rating = ratingSummary.rating;
  const eyebrow = league?.groupLabel
    ? `Spiller · ${groupLabel(league.groupLabel)}`
    : league
      ? "Spiller · Liga"
      : "Spiller";
  const handle = profile.username ? `@${profile.username}` : null;

  return (
    <header className="relative overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid">
      <div
        className="pointer-events-none absolute inset-0 court-grid opacity-70"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-52 w-80 rounded-full bg-ball/18 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:gap-7 lg:p-7">
        <div className="relative shrink-0 self-start">
          <MemberAvatar size="xl" person={profile} ring="ball" />
          {rating ? (
            <span
              title={
                isProvisional(rating, ratingSummary.settings)
                  ? `Foreløbig indtil ${ratingSummary.settings.provisional_matches} kampe`
                  : "Rating"
              }
              className="absolute -bottom-1 -right-1 rounded-full bg-ball px-2 py-0.5 text-[0.7rem] font-bold tabular-nums text-court"
            >
              {rating.rating}
              {isProvisional(rating, ratingSummary.settings) ? "*" : ""}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="ui-label text-ball/80">{eyebrow}</p>
          <h1 className="mt-1.5 font-display text-[2.6rem] leading-[0.88] tracking-wide sm:text-6xl lg:text-[4.25rem]">
            {fullName(profile)}
          </h1>
          {handle ? (
            <p className="mt-2 text-sm text-line/55">{handle}</p>
          ) : null}
          {profile.bio ? (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-line/70">
              “{profile.bio}”
            </p>
          ) : isOwn ? (
            <p className="mt-3 text-sm italic text-line/40">Ingen bio endnu.</p>
          ) : null}
          {chips.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip.kind}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ball/25 bg-ball/10 px-2.5 py-1 text-xs font-semibold text-ball"
                >
                  <HeroChipIcon kind={chip.kind} />
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 lg:w-40 lg:flex-col lg:items-stretch">
          {isOwn ? (
            <Button className="px-4 py-2 text-sm" onClick={onEdit}>
              Rediger profil
            </Button>
          ) : profile.username ? (
            <Button
              to={messagePath(profile.username)}
              className="px-4 py-2 text-sm"
            >
              Send besked
            </Button>
          ) : null}
          {onShare ? (
            <Button
              variant="secondary"
              className="px-4 py-2 text-sm"
              onClick={onShare}
            >
              Del profil
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function HeroChipIcon({ kind }: { kind: HeroChipKind }) {
  if (kind === "seeking") return null;
  const className = "h-4 w-4 shrink-0";
  if (kind === "handed-left" || kind === "handed-right") {
    return (
      <HandIcon
        className={`${className} ${kind === "handed-left" ? "-scale-x-100" : ""}`}
      />
    );
  }
  return (
    <CourtSideIcon
      className={className}
      side={kind === "side-left" ? "left" : "right"}
    />
  );
}

function HandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13V8a1.5 1.5 0 0 1 3 0v5" />
      <path d="M11 13V6a1.5 1.5 0 0 1 3 0v7" />
      <path d="M14 13V8.5a1.5 1.5 0 0 1 3 0V15a5 5 0 0 1-10 0v-1.5" />
      <path d="M7 13.5H5.8A1.8 1.8 0 0 0 4 15.3V16a7 7 0 0 0 7 7h1" />
    </svg>
  );
}

function CourtSideIcon({
  className,
  side,
}: {
  className?: string;
  side: "left" | "right";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
      <rect
        x={side === "left" ? 5 : 13}
        y="6"
        width="6"
        height="12"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function ProfileSeekingBanner({
  note,
  isOwn,
}: {
  note?: string | null;
  isOwn: boolean;
}) {
  return (
    <Card
      className="border-ball/25 bg-ball/10 p-4 sm:p-5"
      to={isOwn ? "/find-partner" : undefined}
    >
      <p className="text-sm font-semibold text-ball">Søger partner</p>
      {note ? <p className="mt-1 text-sm text-line/70">{note}</p> : null}
      {isOwn ? (
        <p className="mt-2 text-xs text-line/50">Administrer på Find partner</p>
      ) : null}
    </Card>
  );
}
