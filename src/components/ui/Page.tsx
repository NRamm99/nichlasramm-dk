import type { ReactNode } from "react";
import { cx } from "./cx";

export function Page({
  children,
  className,
  center,
}: {
  children: ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <main
      className={cx(
        "ui-page flex flex-col",
        center
          ? "min-h-[calc(100vh-5.5rem)] items-center justify-center"
          : "min-h-[calc(100vh-5.5rem)]",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header>
      {eyebrow ? <p className="ui-label">{eyebrow}</p> : null}
      <h1
        className={cx(
          "font-display text-4xl tracking-wide sm:text-5xl",
          eyebrow && "mt-2",
        )}
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-sm text-line/55">{subtitle}</p>
      ) : null}
    </header>
  );
}

export function PageStatus({ children }: { children: ReactNode }) {
  return (
    <Page center>
      <p className="text-sm text-line/60">{children}</p>
    </Page>
  );
}
