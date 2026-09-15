import {
  groupQualifyTitle,
  type LeagueQualifyMark,
} from "../lib/league";

export function LeaguePlace({
  place,
  mark = null,
  groupCount = 2,
}: {
  place: number;
  mark?: LeagueQualifyMark | null;
  groupCount?: number;
}) {
  const title =
    groupQualifyTitle(mark, groupCount) ?? `${place}. plads`;
  const highlighted = mark != null;

  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span
        className={`w-5 text-right text-xs font-semibold tabular-nums ${
          mark === "qualify"
            ? "text-ball"
            : mark === "best-second"
              ? "text-ball/80"
              : "text-line/40"
        }`}
      >
        {place}.
      </span>
      {highlighted ? (
        <QualifyMarkIcon mark={mark} />
      ) : (
        <span className="inline-block w-6" />
      )}
    </span>
  );
}

function QualifyMarkIcon({ mark }: { mark: LeagueQualifyMark }) {
  const contender = mark === "best-second";
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-5 w-5 shrink-0 ${
        contender ? "text-ball/55" : "text-ball"
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 5h10v3.5a5 5 0 0 1-10 0V5Z" />
      <path d="M7 7H5a2.5 2.5 0 0 0 2.5 2.5" />
      <path d="M17 7h2a2.5 2.5 0 0 1-2.5 2.5" />
      <path d="M12 13.5V17" />
      <path d="M8.5 19h7" />
    </svg>
  );
}
