import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MemberAvatar } from "./MemberAvatar";
import { fullName, type PartnerPreview } from "../lib/profile";

function slotPerson(
  id: string,
  people: PartnerPreview[],
): PartnerPreview {
  return (
    people.find((row) => row.id === id) ?? {
      id,
      username: null,
      first_name: null,
      last_name: null,
      avatar_url: null,
    }
  );
}

function slotInitials(person: PartnerPreview) {
  const first = person.first_name?.trim()?.[0];
  const last = person.last_name?.trim()?.[0];
  if (first && last) return `${first}${last}`.toUpperCase();
  return (first ?? person.username?.[0] ?? "?").toUpperCase();
}

function slotFirstName(person: PartnerPreview) {
  return person.first_name?.trim() || person.username || "Medlem";
}

function OccupiedSlot({
  person,
  rating,
  badge,
  action,
  href,
}: {
  person: PartnerPreview;
  rating?: number;
  badge?: string;
  action?: ReactNode;
  href?: string;
}) {
  const name = fullName(person);
  const identity = (
    <>
      {person.avatar_url ? (
        <MemberAvatar person={person} size="sm" ring="ball" />
      ) : (
        <div
          title={name}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-ball text-sm font-bold tracking-wide text-court"
        >
          {slotInitials(person)}
        </div>
      )}
      <span className="max-w-full truncate text-xs font-semibold text-line">
        {slotFirstName(person)}
      </span>
      {badge ? (
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-ball/80">
          {badge}
        </span>
      ) : null}
      {rating != null ? (
        <span className="text-[0.65rem] font-semibold tabular-nums text-ball">
          {rating}
        </span>
      ) : (
        <span className="text-[0.65rem] text-line/35">—</span>
      )}
    </>
  );

  return (
    <div className="flex min-h-[6.5rem] flex-col items-center justify-center gap-1 px-2 py-3">
      {href ? (
        <Link
          to={href}
          className="flex min-w-0 flex-col items-center gap-1 touch-manipulation hover:text-ball"
        >
          {identity}
        </Link>
      ) : (
        identity
      )}
      {action}
    </div>
  );
}

function EmptySlotMark() {
  return (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-ball/40 text-lg font-semibold leading-none text-ball/55 transition group-hover:border-ball group-hover:text-ball">
        +
      </span>
      <span className="text-xs text-line/45 transition group-hover:text-ball">
        Ledig
      </span>
    </>
  );
}

function EmptySlot({
  onJoin,
  disabled,
}: {
  onJoin?: () => void;
  disabled?: boolean;
}) {
  if (!onJoin) {
    return (
      <div
        aria-hidden
        className="flex min-h-[6.5rem] flex-col items-center justify-center gap-1 px-2 py-3"
      >
        <EmptySlotMark />
      </div>
    );
  }

  return (
    <>
      <div
        aria-hidden
        className="flex min-h-[6.5rem] flex-col items-center justify-center gap-1 px-2 py-3 lg:hidden"
      >
        <EmptySlotMark />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onJoin}
        aria-label="Deltag i kampen"
        className="group hidden min-h-[6.5rem] w-full flex-col items-center justify-center gap-1 px-2 py-3 transition hover:text-ball disabled:opacity-50 lg:flex"
      >
        <EmptySlotMark />
      </button>
    </>
  );
}

export function MatchmakerCourtDiagram({
  slots,
  people,
  ratings,
  label,
  hrefForPerson,
  extrasForPerson,
  onEmptySlotClick,
  emptySlotDisabled,
}: {
  slots: Array<string | null>;
  people: PartnerPreview[];
  ratings: Map<string, number>;
  label?: string;
  hrefForPerson?: (person: PartnerPreview) => string | undefined;
  extrasForPerson?: (id: string) => { badge?: string; action?: ReactNode } | null;
  onEmptySlotClick?: () => void;
  emptySlotDisabled?: boolean;
}) {
  return (
    <div>
      {label ? (
        <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-line/45">
          {label}
        </p>
      ) : null}
      <div className="relative overflow-hidden rounded-2xl border border-ball/35 bg-court">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-3 left-1/2 w-px -translate-x-px bg-ball/55"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-px bg-ball/25"
        />
        <div className="grid grid-cols-2 grid-rows-2">
          {slots.slice(0, 4).map((id, index) => {
            if (!id) {
              return (
                <div key={`empty-${index}`} className="min-w-0">
                  <EmptySlot
                    onJoin={onEmptySlotClick}
                    disabled={emptySlotDisabled}
                  />
                </div>
              );
            }
            const person = slotPerson(id, people);
            const extras = extrasForPerson?.(id);
            return (
              <div key={id} className="min-w-0">
                <OccupiedSlot
                  person={person}
                  rating={ratings.get(id)}
                  badge={extras?.badge}
                  action={extras?.action}
                  href={hrefForPerson?.(person)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
