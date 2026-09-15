import { cx } from "./cx";

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  block = false,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ id: T; label: string }>;
  block?: boolean;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "flex flex-wrap gap-1 rounded-full border border-line/15 bg-court p-1",
        block ? "w-full" : "w-fit",
      )}
    >
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={cx(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition touch-manipulation",
              block && "flex-1 py-2",
              active ? "bg-ball text-court" : "text-line/60 hover:text-line",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
