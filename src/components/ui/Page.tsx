import type { ReactNode } from "react";
import { Link } from "react-router-dom";
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

export function BackLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-1.5 py-1 text-sm font-semibold text-ball touch-manipulation"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 5 8 12l7 7" />
      </svg>
      {children}
    </Link>
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
