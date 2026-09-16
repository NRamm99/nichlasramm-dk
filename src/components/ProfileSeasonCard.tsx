import { Link } from "react-router-dom";
import type { FormLetter, PlayerRecord } from "../lib/match";
import { Card } from "./ui/Card";

const formStyle: Record<FormLetter, string> = {
  W: "bg-ball/20 text-ball",
  L: "bg-red-500/15 text-red-300",
  U: "bg-line/10 text-line/65",
};

function tileClass(extra = "") {
  return `rounded-[1.35rem] border border-line/10 bg-court px-4 py-3.5 ${extra}`;
}

export function ProfileSeasonCard({
  record,
  matchesTo,
  hideFromOthers = false,
  onHideFromOthersChange,
}: {
  record: PlayerRecord;
  matchesTo?: string;
  hideFromOthers?: boolean;
  onHideFromOthersChange?: (hide: boolean) => void;
}) {
  const canToggle = Boolean(onHideFromOthersChange);
  const showStats = canToggle || !hideFromOthers;
  const winRate =
    record.played === 0 ? null : Math.round((record.wins / record.played) * 100);
  return (
    <Card className="relative overflow-hidden p-4 sm:p-5">
      <div
        className="pointer-events-none absolute -right-8 top-0 h-40 w-56 rounded-full bg-ball/12 blur-3xl"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-4xl leading-none tracking-wide sm:text-5xl">
            Statistik
          </h2>
        </div>
        {matchesTo ? (
          <Link
            to={matchesTo}
            className="shrink-0 rounded-full border border-ball/35 px-3 py-1.5 text-xs font-semibold text-ball hover:bg-ball/10"
          >
            Alle kampe →
          </Link>
        ) : null}
      </div>

      {canToggle && hideFromOthers ? (
        <p className="relative mt-3 text-xs text-line/45">Kun synlig for dig</p>
      ) : null}

      {showStats ? (
        <div className="relative mt-5 grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(13rem,0.85fr)]">
          <div
            className={tileClass(
              "relative col-span-2 flex flex-col overflow-hidden lg:col-span-1 lg:row-span-2",
            )}
          >
            <p className="ui-label">Winrate</p>
            <div className="mt-2 flex flex-1 items-center justify-between gap-3">
              <div>
                <p className="font-display text-6xl leading-none tracking-wide text-ball sm:text-[4.35rem]">
                  {winRate === null ? "–" : `${winRate}%`}
                </p>
                <p className="mt-3 text-sm text-line/50">
                  {record.played === 0
                    ? "Ingen kampe endnu"
                    : `${record.wins} sejre af ${record.played} kampe`}
                </p>
              </div>
              <WinrateArc value={winRate} />
            </div>
          </div>

          <StreakTile streak={record.streak} className="col-span-2 sm:col-span-1" />

          <FormTile form={record.recentForm} className="col-span-2 sm:col-span-1" />

          <div className="col-span-2 grid grid-cols-2 gap-3">
            <MiniStat label="Kampe" value={record.played} />
            <MiniStat label="Sejre" value={record.wins} />
          </div>
        </div>
      ) : (
        <p className="relative mt-4 text-sm text-line/50">Record er skjult.</p>
      )}

      {onHideFromOthersChange ? (
        <button
          type="button"
          role="switch"
          aria-checked={hideFromOthers}
          onClick={() => onHideFromOthersChange(!hideFromOthers)}
          className="relative mt-4 flex w-full items-center justify-between gap-4 rounded-2xl border border-line/10 bg-court px-4 py-3 text-left touch-manipulation"
        >
          <span>
            <span className="block text-sm font-semibold text-line">
              Skjul for andre
            </span>
            <span className="mt-0.5 block text-xs text-line/50">
              Rating vises stadig
            </span>
          </span>
          <span
            aria-hidden
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${
              hideFromOthers ? "bg-ball" : "bg-line/15"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full shadow-sm transition ${
                hideFromOthers
                  ? "translate-x-5 bg-court"
                  : "translate-x-0 bg-line"
              }`}
            />
          </span>
        </button>
      ) : null}
    </Card>
  );
}

function StreakTile({
  streak,
  className = "",
}: {
  streak: number;
  className?: string;
}) {
  const active = streak > 0;
  const hot = streak >= 3;
  const label = streak === 1 ? "1 sejr i træk" : `${streak} sejre i træk`;

  return (
    <div
      title={active ? label : "Ingen sejrsrække"}
      className={tileClass(
        `relative flex min-h-[5rem] items-center justify-between gap-3 overflow-hidden ${
          active
            ? "border-orange-500/40 bg-gradient-to-br from-orange-500/18 via-red-600/10 to-court"
            : ""
        } ${className}`,
      )}
    >
      {active ? (
        <div
          className={`pointer-events-none absolute -right-5 -top-8 rounded-full blur-2xl ${
            hot ? "h-28 w-28 bg-orange-500/45" : "h-24 w-24 bg-orange-500/30"
          }`}
          aria-hidden
        />
      ) : null}
      <div className="relative">
        <p className={`ui-label ${active ? "!text-orange-300/80" : ""}`}>Streak</p>
        <p
          className={`mt-2 font-display text-4xl leading-none tracking-wide sm:text-5xl ${
            active ? "text-orange-400" : "text-line"
          }`}
        >
          {streak}
        </p>
      </div>
      {active ? (
        <FlameIcon
          className={`relative h-10 w-10 shrink-0 drop-shadow-[0_0_10px_rgba(251,146,60,0.75)] sm:h-11 sm:w-11 ${
            hot ? "text-orange-400" : "text-orange-500"
          }`}
        />
      ) : null}
    </div>
  );
}

function FlameIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M12.7 2.1c.2 3.2-1.4 5.1-3.3 7.1C7.4 11.3 6.4 13.2 6.4 15.5c0 3.3 2.5 5.9 5.6 5.9 3.2 0 5.6-2.5 5.6-5.8 0-2.7-1.3-4.7-2.7-6.4-1.3-1.6-2.4-3.4-2.2-7.1Z"
      />
      <path
        fill="#fde68a"
        d="M12 20.2c-2.2 0-3.7-1.6-3.7-3.7 0-1.6.8-2.8 1.9-3.9.2 1.5.9 2.5 1.9 3 .3.2.3.7 0 .9-.8.4-1.3 1-1.3 1.7 0 .6.5 1.1 1.2 1.1 1.9 0 2.9-1.4 2.9-3.3 0-1.3-.6-2.3-1.5-3.3 1.7 1.4 2.7 3 2.7 4.9 0 2.4-1.6 3.6-4.1 3.6Z"
      />
    </svg>
  );
}

function FormTile({
  form,
  className = "",
}: {
  form: FormLetter[];
  className?: string;
}) {
  return (
    <div
      className={tileClass(
        `flex min-h-[5rem] flex-col justify-center ${className}`,
      )}
    >
      <p className="ui-label">Form</p>
      {form.length === 0 ? (
        <p className="mt-2 text-sm text-line/45">—</p>
      ) : (
        <div
          className="mt-2 flex w-full items-center justify-between gap-1"
          aria-label="Sidste fem kampe"
        >
          {form.map((letter, index) => {
            const latest = index === form.length - 1;
            const resultLabel =
              letter === "W" ? "Vundet" : letter === "L" ? "Tabt" : "Ulige";
            return (
              <span
                key={`${letter}-${index}`}
                title={latest ? `Seneste kamp · ${resultLabel}` : resultLabel}
                aria-current={latest ? "true" : undefined}
                className={`flex aspect-square min-h-8 min-w-8 max-w-10 flex-1 items-center justify-center rounded-full text-[0.7rem] font-bold tracking-wide ${formStyle[letter]} ${
                  latest ? "ring-2 ring-inset ring-ball" : ""
                }`}
              >
                {letter}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className={tileClass()}>
      <p className="ui-label">{label}</p>
      <p className="mt-2 font-display text-4xl leading-none tracking-wide text-line sm:text-5xl">
        {value}
      </p>
    </div>
  );
}

function WinrateArc({ value }: { value: number | null }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const visible = circumference * 0.72;
  const filled = visible * ((value ?? 0) / 100);

  return (
    <svg
      viewBox="0 0 96 96"
      className="mb-1 h-[5.5rem] w-[5.5rem] shrink-0 text-ball sm:h-28 sm:w-28"
      aria-hidden
    >
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${visible} ${circumference}`}
        className="text-line/12"
        transform="rotate(128 48 48)"
      />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        transform="rotate(128 48 48)"
      />
    </svg>
  );
}
