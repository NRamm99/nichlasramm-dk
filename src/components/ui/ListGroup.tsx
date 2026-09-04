import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "./cx";

export function ListGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cx(
        "divide-y divide-line/10 overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function ListRow({
  to,
  onClick,
  icon,
  label,
  hint,
  badge,
  chevron = true,
  trailing,
}: {
  to?: string;
  onClick?: () => void;
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  badge?: number;
  chevron?: boolean;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      {icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center text-line/70">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-tight text-line">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block truncate text-sm text-line/55">
            {hint}
          </span>
        ) : null}
      </span>
      {badge != null && badge > 0 ? (
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-ball px-1.5 text-[0.7rem] font-bold text-court">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
      {trailing}
      {chevron ? (
        <span className="shrink-0 text-line/35" aria-hidden>
          ›
        </span>
      ) : null}
    </>
  );

  const classes =
    "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left touch-manipulation transition hover:bg-line/[0.03]";

  if (to) {
    return (
      <li>
        <Link to={to} className={classes}>
          {inner}
        </Link>
      </li>
    );
  }

  if (onClick) {
    return (
      <li>
        <button type="button" onClick={onClick} className={classes}>
          {inner}
        </button>
      </li>
    );
  }

  return <li className={cx(classes, "cursor-default")}>{inner}</li>;
}

export function ListEmpty({ children }: { children: ReactNode }) {
  return (
    <li className="px-4 py-4 text-sm text-line/60">{children}</li>
  );
}
