import { Link } from "react-router-dom";
import { Sheet } from "./ui/Sheet";
import { cx } from "./ui/cx";
import type { MatchmakerRsvpStatus } from "../lib/matchmaker";

const OPTIONS: Array<{ status: MatchmakerRsvpStatus; label: string }> = [
  { status: "going", label: "Deltager" },
  { status: "interested", label: "Interesseret" },
  { status: "declined", label: "Kan ikke" },
];

export function MatchmakerRsvpSheet({
  open,
  onClose,
  title,
  current,
  saving,
  listingHref,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  current: MatchmakerRsvpStatus | null;
  saving: boolean;
  listingHref: string;
  onSelect: (status: MatchmakerRsvpStatus) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="Vælg svar"
      title={title}
      footer={
        <Link
          to={listingHref}
          className="flex min-h-11 items-center justify-center text-sm font-semibold text-ball touch-manipulation"
        >
          Se detaljer
        </Link>
      }
    >
      <div className="grid gap-2 pb-2">
        {OPTIONS.map((option) => {
          const active = current === option.status;
          return (
            <button
              key={option.status}
              type="button"
              disabled={saving}
              onClick={() => onSelect(option.status)}
              className={cx(
                "flex min-h-11 items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold touch-manipulation disabled:opacity-50",
                active
                  ? "bg-ball text-court"
                  : "border border-line/20 bg-court",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
