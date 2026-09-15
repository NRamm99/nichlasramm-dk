import type { ReactNode } from "react";
import {
  BANDS,
  WEEKDAYS,
  slotKey,
  slotLongLabel,
  type Slot,
  type SlotKey,
} from "../../lib/matchFinder";
import { cx } from "./cx";

type SlotGridProps = {
  /** Selected slots (editor) or the viewer's own slots (heatmap). */
  value?: ReadonlySet<SlotKey>;
  /** Editor mode: fires for a single cell, or a whole row/column via the headers. */
  onToggle?: (slots: Slot[], selected: boolean) => void;
  /** Heatmap mode: how many members are available per slot. */
  heat?: ReadonlyMap<SlotKey, number>;
  /** Cells to outline, e.g. the active filter. */
  highlight?: ReadonlySet<SlotKey>;
  /** Heatmap mode: tap a cell. */
  onCellClick?: (slot: Slot) => void;
  /** Hover text per cell (desktop). */
  titles?: ReadonlyMap<SlotKey, string>;
  compact?: boolean;
  className?: string;
};

// Absolute steps: 1, 2, 3 and 4+ members, so full colour always means
// "enough for a court" regardless of how busy the busiest slot is.
const HEAT_STEPS = [
  "bg-line/[0.04]",
  "bg-ball/15",
  "bg-ball/30",
  "bg-ball/50",
  "bg-ball/80",
];

function heatClass(count: number) {
  if (count <= 0) return HEAT_STEPS[0];
  return HEAT_STEPS[Math.min(count, HEAT_STEPS.length - 1)];
}

export function SlotGrid({
  value,
  onToggle,
  heat,
  highlight,
  onCellClick,
  titles,
  compact = false,
  className,
}: SlotGridProps) {
  const editable = Boolean(onToggle);
  const selected = value ?? new Set<SlotKey>();

  const rowSlots = (band: Slot["band"]): Slot[] =>
    WEEKDAYS.map((day) => ({ weekday: day.id, band }));
  const columnSlots = (weekday: Slot["weekday"]): Slot[] =>
    BANDS.map((band) => ({ weekday, band: band.id }));
  const allSelected = (slots: Slot[]) =>
    slots.every((slot) => selected.has(slotKey(slot)));

  const headerClass = cx(
    "flex items-center justify-center rounded-lg font-semibold uppercase tracking-[0.12em] text-line/50",
    compact ? "h-6 text-[0.55rem]" : "h-8 text-[0.62rem]",
    editable && "transition hover:bg-line/10 hover:text-line touch-manipulation",
  );
  const bandLabelClass = cx(
    "flex items-center rounded-lg pr-1 text-left font-semibold text-line/60",
    compact ? "text-[0.6rem]" : "text-xs",
    editable && "transition hover:bg-line/10 hover:text-line touch-manipulation",
  );

  return (
    <div
      role={editable ? "group" : undefined}
      className={cx(
        "grid grid-cols-[auto_repeat(7,minmax(0,1fr))] select-none",
        compact ? "gap-1" : "gap-1.5",
        className,
      )}
    >
      <span aria-hidden />
      {WEEKDAYS.map((day) =>
        editable ? (
          <button
            key={day.id}
            type="button"
            onClick={() => {
              const slots = columnSlots(day.id);
              onToggle?.(slots, !allSelected(slots));
            }}
            aria-label={`Vælg alle ${day.long}`}
            className={headerClass}
          >
            {day.label}
          </button>
        ) : (
          <span key={day.id} className={headerClass} aria-hidden>
            {day.label}
          </span>
        ),
      )}

      {BANDS.map((band) => (
        <BandRow
          key={band.id}
          label={compact ? band.short : band.label}
          labelClass={bandLabelClass}
          editable={editable}
          onRowToggle={() => {
            const slots = rowSlots(band.id);
            onToggle?.(slots, !allSelected(slots));
          }}
        >
          {WEEKDAYS.map((day) => {
            const slot: Slot = { weekday: day.id, band: band.id };
            const key = slotKey(slot);
            const isSelected = selected.has(key);
            const isHighlighted = highlight?.has(key) ?? false;
            const count = heat?.get(key) ?? 0;
            const interactive = editable || Boolean(onCellClick);
            const label = slotLongLabel(slot);
            const title = titles?.get(key);

            const base = cx(
              "relative flex items-center justify-center rounded-xl text-xs font-semibold tabular-nums transition",
              compact ? "min-h-8" : "min-h-11 lg:min-h-10",
              interactive &&
                "touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-ball",
              editable
                ? isSelected
                  ? "bg-ball text-court hover:bg-line"
                  : "bg-line/[0.06] text-line/30 hover:bg-line/15"
                : heatClass(count),
              !editable && isSelected && "ring-2 ring-inset ring-ball",
              isHighlighted && "outline outline-2 outline-offset-1 outline-line",
            );

            const content =
              editable && isSelected ? <CheckIcon compact={compact} /> : null;

            const srText = editable
              ? label
              : `${label}${
                  count > 0 ? ` · ${count === 1 ? "1 ledig" : `${count} ledige`}` : ""
                }${
                  isSelected ? " · din tid" : ""
                }`;

            if (!interactive) {
              return (
                <span key={key} className={base} title={title ?? srText}>
                  {content}
                  <span className="sr-only">{srText}</span>
                </span>
              );
            }

            return (
              <button
                key={key}
                type="button"
                aria-pressed={editable ? isSelected : isHighlighted}
                aria-label={srText}
                title={title ?? (editable ? undefined : srText)}
                onClick={() => {
                  if (editable) onToggle?.([slot], !isSelected);
                  else onCellClick?.(slot);
                }}
                className={base}
              >
                {content}
              </button>
            );
          })}
        </BandRow>
      ))}
    </div>
  );
}

function BandRow({
  label,
  labelClass,
  editable,
  onRowToggle,
  children,
}: {
  label: string;
  labelClass: string;
  editable: boolean;
  onRowToggle: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {editable ? (
        <button
          type="button"
          onClick={onRowToggle}
          aria-label={`Vælg alle ${label.toLowerCase()}`}
          className={labelClass}
        >
          {label}
        </button>
      ) : (
        <span className={labelClass} aria-hidden>
          {label}
        </span>
      )}
      {children}
    </>
  );
}

function CheckIcon({ compact }: { compact: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={compact ? "h-3 w-3" : "h-4 w-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}
