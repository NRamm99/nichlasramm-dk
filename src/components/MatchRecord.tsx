import type { FormLetter, PlayerRecord } from "../lib/match";
import { Button } from "./ui/Button";

const formStyle: Record<FormLetter, string> = {
  W: "bg-ball/20 text-ball",
  L: "bg-red-500/15 text-red-300",
  U: "bg-line/10 text-line/65",
};

export function MatchRecord({
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

  return (
    <div className="rounded-[var(--radius-card)] border border-line/10 bg-court px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="ui-label">Record</p>
        {canToggle && hideFromOthers ? (
          <p className="text-xs text-line/45">Kun synlig for dig</p>
        ) : null}
      </div>
      {showStats ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat value={record.wins} label="Vundet" />
            <Stat value={record.draws} label="Ulige" />
            <Stat value={record.losses} label="Tabt" />
          </div>
          <div className="mt-4 border-t border-line/10 pt-3">
            <p className="ui-label">Sidste 5 kampe</p>
            {record.recentForm.length === 0 ? (
              <p className="mt-2 text-sm text-line/50">Ingen kampe endnu.</p>
            ) : (
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="flex gap-1.5" aria-label="Sidste fem kampe">
                  {record.recentForm.map((letter, index) => (
                    <span
                      key={`${letter}-${index}`}
                      title={
                        letter === "W"
                          ? "Vundet"
                          : letter === "L"
                            ? "Tabt"
                            : "Ulige"
                      }
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold tracking-wide ${formStyle[letter]}`}
                    >
                      {letter}
                    </span>
                  ))}
                </div>
                <div className="text-right">
                  <p className="ui-label">Sejrsprocent</p>
                  <p className="font-display text-4xl leading-none tracking-wide text-ball">
                    {record.recentWinRate === null
                      ? "–"
                      : `${record.recentWinRate}%`}
                  </p>
                </div>
              </div>
            )}
          </div>
          {record.recentForm.length === 0 ? (
            <div className="mt-4 flex items-baseline justify-between border-t border-line/10 pt-3">
              <p className="text-xs text-line/50">Sidste 10 kampe</p>
              <p className="font-display text-4xl leading-none tracking-wide text-ball">
                {record.recentWinRate === null ? "–" : `${record.recentWinRate}%`}
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-line/50">Record er skjult.</p>
      )}
      {onHideFromOthersChange ? (
        <button
          type="button"
          role="switch"
          aria-checked={hideFromOthers}
          onClick={() => onHideFromOthersChange(!hideFromOthers)}
          className="mt-4 flex w-full items-center justify-between gap-4 rounded-2xl border border-line/10 bg-court-mid px-4 py-3 text-left touch-manipulation"
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
      {matchesTo ? (
        <Button to={matchesTo} block className="mt-4">
          Se kampe
        </Button>
      ) : null}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-5xl leading-none tracking-wide text-line">
        {value}
      </p>
      <p className="ui-label mt-1">{label}</p>
    </div>
  );
}
