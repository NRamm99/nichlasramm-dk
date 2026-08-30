const podium = {
  1: {
    label: "1. plads",
    face: "#F4D03F",
    rim: "#FFF1A3",
    ribbon: "#C9A227",
    glow: "drop-shadow-[0_0_6px_rgba(244,208,63,0.45)]",
  },
  2: {
    label: "2. plads",
    face: "#D7DEE5",
    rim: "#F7FBFF",
    ribbon: "#8E99A6",
    glow: "drop-shadow-[0_0_5px_rgba(215,222,229,0.28)]",
  },
  3: {
    label: "3. plads",
    face: "#D0894A",
    rim: "#F0B77A",
    ribbon: "#A45E28",
    glow: "drop-shadow-[0_0_5px_rgba(208,137,74,0.32)]",
  },
} as const;

function Medal({ place }: { place: 1 | 2 | 3 }) {
  const colors = podium[place];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-6 w-6 shrink-0 ${colors.glow}`}
    >
      <path d="M8.2 2.4 12 8.2 15.8 2.4" fill={colors.ribbon} />
      <path d="M8.2 2.4 5.6 5.8 12 8.2Z" fill={colors.face} opacity="0.35" />
      <path d="M15.8 2.4 18.4 5.8 12 8.2Z" fill={colors.rim} opacity="0.45" />
      <circle cx="12" cy="14.2" r="7.1" fill={colors.rim} />
      <circle cx="12" cy="14.2" r="5.6" fill={colors.face} />
      <circle
        cx="12"
        cy="14.2"
        r="4.2"
        fill="none"
        stroke="#07140f"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
      <path
        d="M12 10.6 12.9 13h2.4l-1.95 1.45.75 2.35L12 15.5l-2.1 1.3.75-2.35L8.7 13h2.4Z"
        fill="#07140f"
        fillOpacity="0.28"
      />
    </svg>
  );
}

export function LeaguePlace({ place }: { place: number }) {
  const prize = place === 1 || place === 2 || place === 3 ? podium[place] : null;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={prize?.label ?? `${place}. plads`}
    >
      <span
        className={`w-5 text-right text-xs font-semibold tabular-nums ${
          place === 1
            ? "text-ball"
            : place <= 3
              ? "text-line/80"
              : "text-line/40"
        }`}
      >
        {place}.
      </span>
      {place === 1 || place === 2 || place === 3 ? (
        <Medal place={place} />
      ) : (
        <span className="inline-block w-6" />
      )}
    </span>
  );
}
