import type { PlayerRecord } from "../lib/match";

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
