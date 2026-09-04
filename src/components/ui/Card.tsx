import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "./cx";

const cardClass =
  "rounded-[var(--radius-card)] border border-line/10 bg-court-mid";

export function Card({
  children,
  className,
  to,
}: {
  children: ReactNode;
  className?: string;
  to?: string;
}) {
  if (to) {
    return (
      <Link to={to} className={cx("block", cardClass, className)}>
        {children}
      </Link>
    );
  }

  return <div className={cx(cardClass, className)}>{children}</div>;
}
