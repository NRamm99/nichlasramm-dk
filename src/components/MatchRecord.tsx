import type { FormLetter, PlayerRecord } from "../lib/match";

const formStyle: Record<FormLetter, string> = {
  W: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25",
  L: "bg-red-500/15 text-red-300 ring-1 ring-red-400/25",
  U: "bg-line/10 text-line/65 ring-1 ring-line/15",
};

export function MatchRecord({ record }: { record: PlayerRecord }) {
  return (
    <div className="rounded-2xl border border-line/10 bg-court/50 px-4 py-4">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-line/40">
        Record
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat value={record.wins} label="Vundet" />
        <Stat value={record.draws} label="Ulige" />
        <Stat value={record.losses} label="Tabt" />
      </div>
      <div className="mt-4 border-t border-line/10 pt-3">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-line/40">
          Sidste 5 kampe
        </p>
        {record.recentForm.length === 0 ? (
          <p className="mt-2 text-sm text-line/50">Ingen kampe endnu.</p>
        ) : (
          <div className="mt-2 flex gap-1.5" aria-label="Sidste fem kampe">
            {record.recentForm.map((letter, index) => (
              <span
                key={`${letter}-${index}`}
                title={
                  letter === "W" ? "Vundet" : letter === "L" ? "Tabt" : "Ulige"
                }
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold tracking-wide ${formStyle[letter]}`}
              >
                {letter}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t border-line/10 pt-3">
        <p className="text-xs text-line/50">
          {record.recentPlayed === 0
            ? "Sidste 10 kampe"
            : record.recentPlayed < 10
              ? `Sidste ${record.recentPlayed} kampe`
              : "Sidste 10 kampe"}
        </p>
        <p className="font-display text-4xl leading-none tracking-wide text-ball">
          {record.recentWinRate === null ? "–" : `${record.recentWinRate}%`}
        </p>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-5xl leading-none tracking-wide">{value}</p>
      <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-line/45">
        {label}
      </p>
    </div>
  );
}
