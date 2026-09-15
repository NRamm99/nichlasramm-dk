import type { CSSProperties, ReactNode } from "react";
import { ListGroup } from "./ListGroup";
import { cx } from "./cx";

const bone = "bg-line/10 motion-safe:animate-pulse";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden className={cx("rounded-md", bone, className)} style={style} />
  );
}

export function SkeletonText({
  lines = 1,
  widths,
  className,
}: {
  lines?: number;
  widths?: Array<string | number>;
  className?: string;
}) {
  return (
    <div className={cx("space-y-2", className)}>
      {Array.from({ length: lines }, (_, index) => {
        const width = widths?.[index] ?? (index === lines - 1 && lines > 1 ? "70%" : "100%");
        return (
          <Skeleton
            key={index}
            className="h-3"
            style={{ width: typeof width === "number" ? `${width}%` : width }}
          />
        );
      })}
    </div>
  );
}

export function SkeletonCircle({
  size = "2.5rem",
  className,
}: {
  size?: string;
  className?: string;
}) {
  return (
    <Skeleton
      className={cx("shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonCard({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-[var(--radius-card)] border border-line/10 bg-court-mid",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SkeletonListRows({
  count = 4,
  avatar = true,
}: {
  count?: number;
  avatar?: boolean;
}) {
  return (
    <ListGroup>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="flex min-h-14 items-center gap-3 px-4 py-3">
          {avatar ? (
            <SkeletonCircle />
          ) : (
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          )}
          <span className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </span>
        </li>
      ))}
    </ListGroup>
  );
}

export function SkeletonRegion({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true" role="status">
      <p className="sr-only">Indlæser…</p>
      {children}
    </div>
  );
}

export function MatchListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-3 space-y-5">
      <section>
        <Skeleton className="mb-2 h-3 w-24" />
        <ListGroup>
          {Array.from({ length: rows }, (_, index) => (
            <li key={index} className="px-3 py-3 lg:px-4 lg:py-3.5">
              <div className="mb-2 flex justify-end">
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 lg:gap-3">
                <div className="flex items-center gap-1.5">
                  <SkeletonCircle size="2rem" />
                  <SkeletonCircle size="2rem" />
                </div>
                <Skeleton className="h-5 w-8 lg:h-8 lg:w-10" />
                <div className="flex items-center justify-end gap-1.5">
                  <SkeletonCircle size="2rem" />
                  <SkeletonCircle size="2rem" />
                </div>
              </div>
            </li>
          ))}
        </ListGroup>
      </section>
    </div>
  );
}

export function HomeDashboardSkeleton() {
  return (
    <SkeletonRegion>
      <Skeleton className="h-10 w-48 sm:h-12 lg:h-10" />
      <Skeleton className="mt-2 h-4 w-40" />

      <div className="mt-6 grid gap-3 lg:grid-cols-2 lg:items-stretch">
        <SkeletonCard className="flex flex-col p-5 lg:p-6">
          <div className="flex flex-1 flex-row items-center gap-3 sm:gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-40 sm:h-10" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-4 h-10 w-28 rounded-full" />
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2">
              <div className="flex">
                <SkeletonCircle size="2.25rem" />
                <SkeletonCircle size="2.25rem" className="-ml-1.5" />
              </div>
              <Skeleton className="h-3 w-6" />
              <div className="flex">
                <SkeletonCircle size="2.25rem" />
                <SkeletonCircle size="2.25rem" className="-ml-1.5" />
              </div>
            </div>
          </div>
        </SkeletonCard>

        <SkeletonCard className="flex flex-col p-5 lg:p-6">
          <Skeleton className="h-4 w-14" />
          <div className="mt-3 space-y-0">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex items-center gap-2 border-t border-line/10 py-2.5 first:border-t-0"
              >
                <Skeleton className="h-8 w-10 shrink-0 rounded-lg" />
                <div className="flex shrink-0">
                  <SkeletonCircle size="1.5rem" />
                  <SkeletonCircle size="1.5rem" className="-ml-1.5" />
                </div>
                <Skeleton className="h-4 min-w-0 flex-1" />
                <Skeleton className="h-5 w-8 shrink-0" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-4 h-2 w-full rounded-full" />
          <Skeleton className="mt-2 h-3 w-36" />
          <div className="mt-auto pt-6">
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </SkeletonCard>
      </div>
    </SkeletonRegion>
  );
}

export function LeaguePageSkeleton() {
  return (
    <SkeletonRegion>
      <div className="lg:mt-10 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <div>
          <Skeleton className="mt-10 h-8 w-24 lg:mt-0" />
          <SkeletonCard className="mt-4 overflow-hidden">
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="flex items-center gap-3 border-t border-line/10 px-3 py-3 first:border-t-0"
              >
                <Skeleton className="h-8 w-10 shrink-0 rounded-lg" />
                <Skeleton className="h-4 min-w-0 flex-1" />
                <Skeleton className="h-6 w-8 shrink-0" />
              </div>
            ))}
          </SkeletonCard>
        </div>
        <div>
          <Skeleton className="mt-10 h-8 w-36 lg:mt-0" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <ul className="mt-4 space-y-3">
            {[0, 1, 2].map((row) => (
              <li key={row}>
                <SkeletonCard className="flex items-center justify-between gap-3 rounded-2xl px-5 py-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </SkeletonCard>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SkeletonRegion>
  );
}
