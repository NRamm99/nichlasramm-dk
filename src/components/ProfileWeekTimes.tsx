import {
  WEEKDAYS,
  compactHourRange,
  weekdayHours,
  type Slot,
} from "../lib/matchFinder";
import { Card } from "./ui/Card";

export function ProfileWeekTimes({
  slots,
  isOwn,
  onEdit,
}: {
  slots: Slot[];
  isOwn: boolean;
  onEdit?: () => void;
}) {
  const hours = weekdayHours(slots);
  if (!isOwn && hours.size === 0) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="ui-label">Spilletider</p>
        {isOwn && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold text-ball hover:underline touch-manipulation"
          >
            Rediger
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day) => {
          const range = hours.get(day.id);
          return (
            <div
              key={day.id}
              className={`rounded-2xl px-1 py-2.5 text-center ${
                range
                  ? "bg-ball/15 text-ball"
                  : "bg-court text-line/35"
              }`}
            >
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em]">
                {day.label}
              </p>
              <p className="mt-1 text-[0.65rem] font-semibold tabular-nums leading-none sm:text-xs">
                {range ? compactHourRange(range.from, range.to) : "—"}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
