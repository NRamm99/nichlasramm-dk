import { Link } from "react-router-dom";
import { MemberAvatar, MemberNameLink } from "./MemberAvatar";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import type { DuoRecord } from "../lib/match";
import type { PartnerPreview } from "../lib/profile";
import { formatPartnerSince } from "../lib/profilePlayStyle";

export function ProfilePartnerCard({
  person,
  partner,
  partnerRating,
  duo,
  partneredAt,
  matchesTo,
  hideRecord,
  isOwn,
  confirmRemove,
  onConfirmRemove,
  onCancelRemove,
  onRemove,
}: {
  person: PartnerPreview;
  partner: PartnerPreview | null;
  partnerRating?: number;
  duo: DuoRecord;
  partneredAt?: string | null;
  matchesTo?: string;
  hideRecord?: boolean;
  isOwn: boolean;
  confirmRemove: boolean;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}) {
  const since = formatPartnerSince(partneredAt);
  const matchWord = duo.played === 1 ? "kamp" : "kampe";
  const showDuoStats = Boolean(partner) && (isOwn || !hideRecord);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="ui-label">Fast makker</p>
        {isOwn && partner ? (
          confirmRemove ? (
            <span className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={onCancelRemove}
              >
                Annuller
              </Button>
              <Button
                variant="danger"
                className="border-0 bg-red-400 px-3 py-1.5 text-xs text-court hover:bg-red-300"
                onClick={onRemove}
              >
                Ja, fjern
              </Button>
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" className="text-xs" onClick={onConfirmRemove}>
                Skift
              </Button>
              {matchesTo ? (
                <Link
                  to={matchesTo}
                  className="whitespace-nowrap rounded-full border border-ball/35 px-3 py-1.5 text-xs font-semibold text-ball hover:bg-ball/10"
                >
                  Se kampe →
                </Link>
              ) : null}
            </span>
          )
        ) : matchesTo ? (
          <Link
            to={matchesTo}
            className="shrink-0 whitespace-nowrap rounded-full border border-ball/35 px-3 py-1.5 text-xs font-semibold text-ball hover:bg-ball/10"
          >
            Se kampe →
          </Link>
        ) : null}
      </div>

      {partner ? (
        <div className="mt-4 flex items-center gap-3">
          <div className="flex shrink-0">
            <MemberAvatar person={person} size="md" ring="ball" />
            <span className="-ml-3">
              <MemberAvatar person={partner} size="md" ring="court" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight">
              <MemberNameLink person={partner} />
            </p>
            {since ? (
              <p className="mt-0.5 text-xs text-line/50">{since}</p>
            ) : null}
            {partnerRating != null ? (
              <p className="mt-0.5 text-xs text-line/50">
                Rating {partnerRating}
              </p>
            ) : null}
            {showDuoStats ? (
              duo.winRate === null ? (
                <p className="mt-1 text-xs text-line/45">Ingen kampe sammen</p>
              ) : (
                <p
                  title="Sejrsprocent i de kampe I har spillet på samme hold"
                  className="mt-1.5 inline-flex rounded-full bg-ball/15 px-2 py-0.5 text-[0.7rem] font-semibold text-ball"
                >
                  Duo winrate {duo.winRate}% · {duo.played} {matchWord}
                </p>
              )
            ) : null}
          </div>
        </div>
      ) : isOwn ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-line/55">Ingen fast makker</p>
          <Button to="/find-partner" className="shrink-0 px-4 py-2 text-sm">
            Find partner
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-line/55">Ingen partner</p>
      )}
    </Card>
  );
}
