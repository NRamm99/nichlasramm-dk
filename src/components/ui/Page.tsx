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
          ? "min-h-[calc(100vh-5.5rem)] items-center justify-center lg:min-h-[calc(100vh-6.5rem)]"
          : "min-h-[calc(100vh-5.5rem)] lg:min-h-[calc(100vh-6.5rem)]",
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
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header>
      {eyebrow ? <p className="ui-label">{eyebrow}</p> : null}
      <div
        className={cx(
          "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
          eyebrow && "mt-2",
        )}
      >
        <h1 className="font-display text-4xl tracking-wide sm:text-5xl lg:text-4xl">
          {title}
        </h1>
        {action ? <div className="shrink-0 sm:pt-1">{action}</div> : null}
      </div>
      {subtitle ? (
        <p className="mt-2 max-w-xl text-sm text-line/55">{subtitle}</p>
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
