import { SetScores } from "./MatchFields";
import { MemberAvatar } from "./MemberAvatar";
import { Card } from "./ui/Card";
import { fieldClass } from "./ui/Field";
import {
  MATCH_DURATION_MINUTES,
  type MatchDurationMinutes,
  type PlayerPick,
} from "../lib/match";
import {
  fullName,
  listPlayerName,
  type PartnerPreview,
} from "../lib/profile";

export type DraftSlot = {
  key: string;
  pick: PlayerPick | null;
  locked: boolean;
  you?: boolean;
  label: string;
};

export function MatchDraftCard({
  kind,
  when,
  onWhenChange,
  durationMinutes,
  onDurationChange,
  team1,
  team2,
  people,
  ratings,
  sets,
  onSetsChange,
  onSlotClick,
  hint,
}: {
  kind: "played" | "scheduled";
  when: string;
  onWhenChange: (value: string) => void;
  durationMinutes: MatchDurationMinutes;
  onDurationChange: (value: MatchDurationMinutes) => void;
  team1: DraftSlot[];
  team2: DraftSlot[];
  people: Map<string, PartnerPreview>;
  ratings?: Map<string, number>;
  sets: Array<{ team1: string; team2: string }>;
  onSetsChange: (sets: Array<{ team1: string; team2: string }>) => void;
  onSlotClick: (slot: DraftSlot) => void;
  hint?: string | null;
}) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-x-5 lg:gap-y-2">
        <DraftTeamStack
          slots={team1}
          people={people}
          ratings={ratings}
          align="start"
          onSlotClick={onSlotClick}
        />
        {kind === "played" ? (
          <div className="flex justify-center py-1 lg:px-2 lg:py-0">
            <SetScores
              compact
              sets={sets}
              onChange={onSetsChange}
              team1Label="Hold 1"
              team2Label="Hold 2"
            />
          </div>
        ) : (
          <p className="shrink-0 py-1 text-center font-display text-4xl leading-none tracking-wide text-line/35 lg:px-3 lg:py-0 lg:text-5xl">
            vs
          </p>
        )}
        <DraftTeamStack
          slots={team2}
          people={people}
          ratings={ratings}
          align="end"
          onSlotClick={onSlotClick}
        />
      </div>

      <div className="mt-5 space-y-3 border-t border-line/10 pt-4">
        <label className="block text-sm font-medium text-line/80">
          Dato og tid
          <input
            type="datetime-local"
            required
            value={when}
            onChange={(event) => onWhenChange(event.target.value)}
            className={fieldClass()}
          />
        </label>
        {kind === "scheduled" ? (
          <div>
            <p className="text-sm font-medium text-line/80">Varighed</p>
            <div
              role="radiogroup"
              aria-label="Varighed"
              className="mt-2 flex flex-wrap gap-1.5"
            >
              {MATCH_DURATION_MINUTES.map((minutes) => {
                const active = minutes === durationMinutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onDurationChange(minutes)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition touch-manipulation ${
                      active
                        ? "bg-ball text-court"
                        : "border border-line/20 text-line/70 hover:text-line"
                    }`}
                  >
                    {durationChipLabel(minutes)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {hint ? <p className="mt-3 text-xs text-line/50">{hint}</p> : null}
    </Card>
  );
}

function DraftTeamStack({
  slots,
  people,
  ratings,
  align,
  onSlotClick,
}: {
  slots: DraftSlot[];
  people: Map<string, PartnerPreview>;
  ratings?: Map<string, number>;
  align: "start" | "end";
  onSlotClick: (slot: DraftSlot) => void;
}) {
  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-2 rounded-2xl bg-line/[0.04] px-3 py-2.5 lg:w-auto lg:rounded-none lg:bg-transparent lg:px-2.5 lg:py-2 ${
        align === "end" ? "items-start lg:items-end" : "items-start"
      }`}
    >
      {slots.map((slot) => (
        <DraftSlotRow
          key={slot.key}
          slot={slot}
          people={people}
          ratings={ratings}
          align={align}
          onSlotClick={onSlotClick}
        />
      ))}
    </div>
  );
}

function DraftSlotRow({
  slot,
  people,
  ratings,
  align,
  onSlotClick,
}: {
  slot: DraftSlot;
  people: Map<string, PartnerPreview>;
  ratings?: Map<string, number>;
  align: "start" | "end";
  onSlotClick: (slot: DraftSlot) => void;
}) {
  const person = personFromSlot(slot, people);
  const empty = !slot.pick;
  const rating =
    slot.pick?.kind === "member" ? ratings?.get(slot.pick.id) : undefined;
  const name = slot.you
    ? "Dig"
    : person
      ? listPlayerName(fullName(person), person)
      : slot.pick?.kind === "guest"
        ? slot.pick.name
        : "Vælg";
  const inner = (
    <>
      {person && !empty ? (
        <MemberAvatar
          person={person}
          size="sm"
          ring="court"
          className="max-lg:h-9 max-lg:w-9"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-line/25 text-line/35 max-lg:h-9 max-lg:w-9"
        >
          +
        </span>
      )}
      <span
        className={`flex min-w-0 flex-1 items-baseline justify-between gap-2 lg:flex-none lg:justify-start lg:gap-1 ${
          align === "end" ? "lg:flex-row-reverse" : ""
        }`}
      >
        <span
          className={`min-w-0 truncate text-sm lg:text-base ${
            empty ? "text-line/40" : "font-semibold text-line/85"
          }`}
        >
          {empty ? "Vælg" : name}
        </span>
        {rating != null ? (
          <span className="shrink-0 font-sans text-[0.65rem] tabular-nums text-line/45 lg:text-[0.7rem]">
            ({rating})
          </span>
        ) : null}
      </span>
    </>
  );

  const rowClass = `flex min-w-0 items-center gap-2.5 ${
    align === "end" ? "w-full lg:w-auto lg:flex-row-reverse" : "w-full lg:w-auto"
  }`;

  if (slot.locked) {
    return <div className={rowClass}>{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSlotClick(slot)}
      aria-label={empty ? `Vælg ${slot.label}` : `Skift ${slot.label}`}
      className={`${rowClass} rounded-2xl text-left transition hover:bg-line/10 touch-manipulation`}
    >
      {inner}
    </button>
  );
}

function personFromSlot(
  slot: DraftSlot,
  people: Map<string, PartnerPreview>,
): PartnerPreview | null {
  if (slot.pick?.kind === "member") {
    return people.get(slot.pick.id) ?? null;
  }
  if (slot.pick?.kind === "guest") {
    const parts = slot.pick.name.trim().split(/\s+/).filter(Boolean);
    return {
      id: `guest:${slot.key}`,
      username: null,
      first_name: parts[0] ?? slot.pick.name,
      last_name: parts.length > 1 ? parts[parts.length - 1] : null,
      avatar_url: null,
    };
  }
  return null;
}

function durationChipLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours} t`;
  return `${Math.floor(hours)}½ t`;
}
