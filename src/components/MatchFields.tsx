import type { PartnerPreview } from "../lib/profile";
import { fullName } from "../lib/profile";
import type { PlayerPick } from "../lib/match";
import { withRating } from "../lib/rating";

type PlayerPickerProps = {
  label: string;
  members: PartnerPreview[];
  excludeIds: string[];
  value: PlayerPick | null;
  onChange: (value: PlayerPick | null) => void;
  ratings?: Map<string, number>;
};

export function PlayerPicker({
  label,
  members,
  excludeIds,
  value,
  onChange,
  ratings,
}: PlayerPickerProps) {
  const selectedMember = value?.kind === "member" ? value.id : "";
  const guestName = value?.kind === "guest" ? value.name : "";
  const mode = value?.kind === "guest" ? "guest" : "member";
  const available = members.filter(
    (member) =>
      !excludeIds.includes(member.id) ||
      (value?.kind === "member" && value.id === member.id),
  );

  return (
    <div>
      <p className="text-sm font-medium text-line/80">{label}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            mode === "member"
              ? "bg-ball text-court"
              : "border border-line/20 text-line/80"
          }`}
        >
          Medlem
        </button>
        <button
          type="button"
          onClick={() => onChange({ kind: "guest", name: guestName })}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            mode === "guest"
              ? "bg-ball text-court"
              : "border border-line/20 text-line/80"
          }`}
        >
          Gæst
        </button>
      </div>
      {mode === "guest" ? (
        <input
          type="text"
          value={guestName}
          placeholder="Navn"
          onChange={(event) =>
            onChange({ kind: "guest", name: event.target.value })
          }
          className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
        />
      ) : (
        <select
          value={selectedMember}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next ? { kind: "member", id: next } : null);
          }}
          className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
        >
          <option value="">Vælg spiller</option>
          {available.map((member) => (
            <option key={member.id} value={member.id}>
              {withRating(fullName(member), ratings?.get(member.id))}
              {member.username ? ` (@${member.username})` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

type SetScoresProps = {
  sets: Array<{ team1: string; team2: string }>;
  onChange: (sets: Array<{ team1: string; team2: string }>) => void;
  team1Label: string;
  team2Label: string;
};

export function SetScores({
  sets,
  onChange,
  team1Label,
  team2Label,
}: SetScoresProps) {
  function update(index: number, side: "team1" | "team2", value: string) {
    const next = [...sets];
    next[index] = { ...sets[index], [side]: value.replace(/[^\d]/g, "") };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-line/65">
        Færdigt sæt: mindst 6 partier og forskel. Sidste sæt må stå ufærdigt.
        Det tæller kun, hvis kampen ellers ville være uafgjort.
      </p>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line/10 bg-court p-3">
        <div
          className="grid min-w-[18rem] items-center gap-2"
          style={{
            gridTemplateColumns: `minmax(6.5rem,1fr) repeat(${sets.length}, 3.4rem)`,
          }}
        >
          <span />
          {sets.map((_, index) => {
            const last = index === sets.length - 1;
            return (
              <p
                key={index}
                className={`text-center text-[0.62rem] font-semibold uppercase tracking-[0.12em] ${
                  last ? "text-ball/80" : "text-line/40"
                }`}
              >
                {last && sets.length > 1 ? "Sidste" : `Sæt ${index + 1}`}
              </p>
            );
          })}
          <p className="truncate text-sm font-semibold text-line/85">
            {team1Label}
          </p>
          {sets.map((row, index) => (
            <input
              key={`t1-${index}`}
              inputMode="numeric"
              aria-label={`${team1Label}, sæt ${index + 1}`}
              value={row.team1}
              onChange={(event) => update(index, "team1", event.target.value)}
              className="h-12 rounded-xl border border-line/15 bg-court text-center font-display text-3xl leading-none outline-none focus:border-ball"
            />
          ))}
          <p className="truncate text-sm font-semibold text-line/85">
            {team2Label}
          </p>
          {sets.map((row, index) => (
            <input
              key={`t2-${index}`}
              inputMode="numeric"
              aria-label={`${team2Label}, sæt ${index + 1}`}
              value={row.team2}
              onChange={(event) => update(index, "team2", event.target.value)}
              className="h-12 rounded-xl border border-line/15 bg-court text-center font-display text-3xl leading-none outline-none focus:border-ball"
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {sets.length < 5 ? (
          <button
            type="button"
            onClick={() => onChange([...sets, { team1: "", team2: "" }])}
            className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
          >
            Tilføj sæt
          </button>
        ) : null}
        {sets.length > 1 ? (
          <button
            type="button"
            onClick={() => onChange(sets.slice(0, -1))}
            className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
          >
            Fjern sidste sæt
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MatchRosterFields({
  members,
  picks,
  onChange,
  ratings,
}: {
  members: PartnerPreview[];
  picks: Array<PlayerPick | null>;
  onChange: (picks: Array<PlayerPick | null>) => void;
  ratings?: Map<string, number>;
}) {
  const labels =
    picks.length === 2
      ? ["Spiller 1", "Spiller 2"]
      : [
          "Hold 1 · spiller 1",
          "Hold 1 · spiller 2",
          "Hold 2 · spiller 1",
          "Hold 2 · spiller 2",
        ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {labels.map((label, index) => {
        const excludeIds = picks.flatMap((pick, pickIndex) =>
          pickIndex !== index && pick?.kind === "member" ? [pick.id] : [],
        );
        return (
          <PlayerPicker
            key={label}
            label={label}
            members={members}
            excludeIds={excludeIds}
            ratings={ratings}
            value={picks[index] ?? null}
            onChange={(value) => {
              const next = [...picks];
              next[index] = value;
              onChange(next);
            }}
          />
        );
      })}
    </div>
  );
}
