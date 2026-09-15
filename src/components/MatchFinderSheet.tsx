import { useMemo, useState } from "react";
import { danishAuthError } from "../lib/authErrors";
import {
  MATCH_FINDER_COPY,
  TEMPORARY_MAX_DAYS,
  clearTemporary,
  expiryFromDateInput,
  expiryIsValid,
  saveMatchFinderPreferences,
  setMatchFinderHidden,
  slotCountCopy,
  slotKey,
  slotsFromKeys,
  temporaryActive,
  temporaryPresets,
  temporaryUntilCopy,
  toDateInput,
  type MatchFinderKind,
  type MemberPrefs,
  type Slot,
  type SlotKey,
} from "../lib/matchFinder";
import { Button } from "./ui/Button";
import { fieldClass } from "./ui/Field";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { SlotGrid } from "./ui/SlotGrid";

const KIND_OPTIONS: ReadonlyArray<{ id: MatchFinderKind; label: string }> = [
  { id: "permanent", label: "Fast" },
  { id: "temporary", label: "Kun midlertidigt" },
];

export function MatchFinderSheet({
  open,
  onClose,
  prefs,
  hidden,
  onSaved,
  onHiddenChange,
  initialKind,
  preselect,
}: {
  open: boolean;
  onClose: () => void;
  prefs: MemberPrefs;
  hidden: boolean;
  onSaved: () => void;
  onHiddenChange?: (hidden: boolean) => void;
  initialKind?: MatchFinderKind;
  /** A slot tapped on the dashboard heatmap; starts selected. */
  preselect?: Slot | null;
}) {
  // Mounting the editor only while open resets its draft state on every open.
  if (!open) return null;
  return (
    <MatchFinderEditor
      prefs={prefs}
      hidden={hidden}
      onSaved={onSaved}
      onHiddenChange={onHiddenChange}
      onClose={onClose}
      initialKind={initialKind}
      preselect={preselect ?? null}
    />
  );
}

function keysFor(slots: Slot[], extra: Slot | null) {
  const keys = new Set<SlotKey>(slots.map(slotKey));
  if (extra) keys.add(slotKey(extra));
  return keys;
}

function MatchFinderEditor({
  prefs,
  hidden: initialHidden,
  onSaved,
  onHiddenChange,
  onClose,
  initialKind,
  preselect,
}: {
  prefs: MemberPrefs;
  hidden: boolean;
  onSaved: () => void;
  onHiddenChange?: (hidden: boolean) => void;
  onClose: () => void;
  initialKind?: MatchFinderKind;
  preselect: Slot | null;
}) {
  const now = useMemo(() => new Date(), []);
  const tempActive = temporaryActive(prefs, now);
  const presets = useMemo(() => temporaryPresets(now), [now]);

  const [kind, setKind] = useState<MatchFinderKind>(
    initialKind ?? (tempActive ? "temporary" : "permanent"),
  );
  const [permanentKeys, setPermanentKeys] = useState<Set<SlotKey>>(() =>
    keysFor(prefs.permanent, kind === "permanent" ? preselect : null),
  );
  const [temporaryKeys, setTemporaryKeys] = useState<Set<SlotKey>>(() =>
    keysFor(
      tempActive ? prefs.temporary : [],
      kind === "temporary" ? preselect : null,
    ),
  );
  const [expiresAt, setExpiresAt] = useState<string | null>(() => {
    if (tempActive && prefs.temporaryExpiresAt) return prefs.temporaryExpiresAt;
    return presets.find((preset) => preset.id === "week")?.expiresAt
      ?? presets[0]?.expiresAt
      ?? null;
  });
  const [hidden, setHidden] = useState(initialHidden);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keys = kind === "permanent" ? permanentKeys : temporaryKeys;
  const setKeys = kind === "permanent" ? setPermanentKeys : setTemporaryKeys;
  const slots = useMemo(() => slotsFromKeys(keys), [keys]);
  const activePreset = presets.find((preset) => preset.expiresAt === expiresAt);
  const customDate = expiresAt && !activePreset ? toDateInput(new Date(expiresAt)) : "";

  const maxDate = useMemo(() => {
    const date = new Date(now);
    date.setDate(date.getDate() + TEMPORARY_MAX_DAYS);
    return toDateInput(date);
  }, [now]);

  function toggle(changed: Slot[], selected: boolean) {
    setKeys((current) => {
      const next = new Set(current);
      for (const slot of changed) {
        const key = slotKey(slot);
        if (selected) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  async function handleSave() {
    if (saving) return;
    setError(null);
    if (kind === "temporary" && slots.length > 0) {
      if (!expiresAt || !expiryIsValid(expiresAt)) {
        setError(danishAuthError("INVALID_EXPIRY"));
        return;
      }
    }
    setSaving(true);
    try {
      await saveMatchFinderPreferences(
        kind,
        slots,
        kind === "temporary" ? expiresAt : null,
      );
      onSaved();
      onClose();
    } catch (saveError) {
      setError(danishAuthError((saveError as Error).message));
      setSaving(false);
    }
  }

  async function handleClearTemporary() {
    if (clearing) return;
    setError(null);
    setClearing(true);
    try {
      await clearTemporary();
      onSaved();
      onClose();
    } catch (clearError) {
      setError(danishAuthError((clearError as Error).message));
      setClearing(false);
    }
  }

  async function handleHidden(nextHidden: boolean) {
    setError(null);
    setHidden(nextHidden);
    onHiddenChange?.(nextHidden);
    try {
      await setMatchFinderHidden(nextHidden);
    } catch (hideError) {
      setHidden(!nextHidden);
      onHiddenChange?.(!nextHidden);
      setError(danishAuthError((hideError as Error).message));
    }
  }

  const visible = !hidden;
  const busy = saving || clearing;

  const footer = (
    <div className="space-y-2">
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
        <Button
          block
          disabled={busy}
          onClick={() => void handleSave()}
          className="sm:flex-1"
        >
          {saving
            ? "Gemmer…"
            : kind === "temporary" && slots.length === 0 && tempActive
              ? "Fjern midlertidige tider"
              : "Gem"}
        </Button>
        {tempActive && !(kind === "temporary" && slots.length === 0) ? (
          <Button
            variant="ghost"
            block
            disabled={busy}
            onClick={() => void handleClearTemporary()}
            className="sm:flex-1"
          >
            {clearing ? "Fjerner…" : "Fjern midlertidig"}
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title="Hvornår vil du spille?"
      footer={footer}
    >
    <div className="space-y-4">
      <div className="space-y-2">
        <SegmentedControl
          block
          label="Type af tider"
          value={kind}
          onChange={setKind}
          options={KIND_OPTIONS}
        />
        <p className="text-xs text-line/55 sm:text-sm">
          {kind === "permanent"
            ? "Tryk på en dag eller et tidsrum for at vælge hele rækken."
            : expiresAt
              ? `Erstatter dine faste tider indtil ${temporaryUntilCopy(expiresAt, now)}.`
              : "Erstatter dine faste tider i en periode."}
        </p>
      </div>

      <SlotGrid value={keys} onToggle={toggle} />

      <p className="text-sm text-line/55" aria-live="polite">
        {slots.length === 0
          ? "Ingen tider valgt"
          : `${slotCountCopy(slots.length)} valgt`}
      </p>

      {kind === "temporary" ? (
        <div className="space-y-3 rounded-2xl border border-line/10 bg-court px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-line/45">
            Gælder til
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => {
              const active = preset.expiresAt === expiresAt;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setExpiresAt(preset.expiresAt)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition touch-manipulation ${
                    active
                      ? "bg-ball text-court"
                      : "border border-line/20 text-line/70 hover:border-ball hover:text-ball"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <label className="block text-xs font-medium text-line/60">
            Eller vælg en dato
            <input
              type="date"
              value={customDate}
              min={toDateInput(now)}
              max={maxDate}
              onChange={(event) => {
                const iso = expiryFromDateInput(event.target.value);
                if (iso) setExpiresAt(iso);
              }}
              className={fieldClass("bg-court-mid py-2.5 text-sm")}
            />
          </label>
        </div>
      ) : null}

      <button
        type="button"
        role="switch"
        aria-checked={visible}
        onClick={() => void handleHidden(visible)}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line/10 bg-court px-4 py-3 text-left touch-manipulation"
      >
        <span>
          <span className="block text-sm font-semibold text-line">
            Vis mig i {MATCH_FINDER_COPY.title}
          </span>
          <span className="mt-0.5 block text-xs text-line/50">
            {visible
              ? "Andre kan se hvornår du kan spille"
              : MATCH_FINDER_COPY.hiddenNote}
          </span>
        </span>
        <span
          aria-hidden
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            visible ? "bg-ball" : "bg-line/15"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full shadow-sm transition ${
              visible ? "translate-x-5 bg-court" : "translate-x-0 bg-line"
            }`}
          />
        </span>
      </button>
    </div>
    </Sheet>
  );
}
