import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";

// Bottom sheet on phones, centered dialog from `sm` up. Escape and a tap on
// the backdrop both close it; body scroll is locked while open. Rendered in a
// portal so transformed/animated ancestors cannot clip the fixed overlay.
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  /** Pinned below the scrollable body, e.g. the primary action. */
  footer?: ReactNode;
  className?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-court/80 motion-safe:animate-sheet-fade sm:items-center sm:p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "flex w-full max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden rounded-t-[1.75rem] border border-line/10 bg-court-mid shadow-xl motion-safe:animate-sheet-up sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[var(--radius-card)]",
          className,
        )}
      >
        <div className="flex shrink-0 justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-line/20" />
        </div>
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-3 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ball">
                {eyebrow}
              </p>
            ) : null}
            <h2
              id={titleId}
              className={cx(
                "font-display text-2xl tracking-wide sm:text-3xl",
                eyebrow ? "mt-2" : null,
              )}
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk"
            className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-line/50 transition hover:bg-line/10 hover:text-line touch-manipulation"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div
          className={cx(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 sm:px-6",
            footer ? "pb-4" : "pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6",
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-line/10 bg-court-mid px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
