import type { ReactNode } from "react";
import { cx } from "./cx";

export function Field({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block text-sm font-medium text-line/80", className)}>
      {label}
      {children}
    </label>
  );
}

export function fieldClass(extra?: string) {
  return cx("ui-field", extra);
}
