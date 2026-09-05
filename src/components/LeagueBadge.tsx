export function LeagueBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ball/15 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ball">
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-3 w-3"
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
