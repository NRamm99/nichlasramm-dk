export function LeagueMatchTitle() {
  return (
    <div className="-mt-2 mb-2 flex justify-center lg:-mt-2.5">
      <LeagueBadge variant="title" />
    </div>
  );
}

export function LeagueBadge({
  variant = "chip",
}: {
  variant?: "chip" | "title";
}) {
  const title = variant === "title";

  return (
    <span
      className={
        title
          ? "inline-flex items-center gap-1 rounded-full bg-ball px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-court shadow-[0_6px_18px_rgba(214,255,61,0.28)]"
          : "inline-flex items-center gap-1 rounded-full bg-ball/15 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ball"
      }
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className={title ? "h-3.5 w-3.5" : "h-3 w-3"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
        <path d="M12 11v2.5" />
        <path d="M9 19h6" />
      </svg>
      Liga
    </span>
  );
}
