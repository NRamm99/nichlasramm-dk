import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { danishAuthError } from "../lib/authErrors";
import type { HomeMatchFinder } from "../lib/home";
import {
  COURT_SIZE,
  MATCH_FINDER_COPY,
  buildSuggestions,
  clearTemporary,
  dismissTemporaryStrip,
  formatSlots,
  listingCreatePath,
  matchCountCopy,
  slotKey,
  slotLabel,
  slotOccupancyCopy,
  temporaryActive,
  temporaryExpiryCopy,
  temporaryStripDismissed,
  type Slot,
  type SlotKey,
  type Suggestion,
} from "../lib/matchFinder";
import { messagePath } from "../lib/messages";
import { fullName, shortDisplayName, type PartnerPreview } from "../lib/profile";
import { withRating } from "../lib/rating";
import { ChatBubbleIcon } from "./ChatBubbleIcon";
import { MatchFinderSheet } from "./MatchFinderSheet";
import { MemberAvatar } from "./MemberAvatar";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { SlotGrid } from "./ui/SlotGrid";

const PREVIEW_ROWS = 4;

export function MatchFinderCard({
  userId,
  matchFinder,
  ratings,
  onChanged,
  onHiddenChange,
  className,
}: {
  userId: string;
  matchFinder: HomeMatchFinder;
  ratings: Map<string, number>;
  onChanged: () => void;
  onHiddenChange?: (hidden: boolean) => void;
  className?: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preselect, setPreselect] = useState<Slot | null>(null);
  const [filter, setFilter] = useState<SlotKey | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [stripHidden, setStripHidden] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expiry is only checked against the moment the data arrived; Landing
  // refetches on focus, so a stale overlay disappears on the next visit.
  const result = useMemo(
    () => buildSuggestions(userId, matchFinder.byProfile, ratings, new Date()),
    [userId, matchFinder.byProfile, ratings],
  );
  const now = new Date();
  const people = matchFinder.people;
  const suggestions = useMemo(
    () => result.people.filter((row) => people.has(row.profileId)),
    [result.people, people],
  );
  const mine = result.mine;
  const mineKeys = useMemo(() => new Set(mine.map(slotKey)), [mine]);
  const hasPrefs = mine.length > 0;

  const titles = useMemo(() => {
    const map = new Map<SlotKey, string>();
    for (const [key, ids] of result.bySlot) {
      const names = ids
        .map((id) => people.get(id))
        .filter((person): person is PartnerPreview => Boolean(person))
        .map(shortDisplayName);
      if (names.length > 0) map.set(key, names.join(", "));
    }
    return map;
  }, [result.bySlot, people]);

  // My slots that at least one other member shares, best first.
  const sharedSlots = useMemo(() => {
    const rows = mine
      .map((slot) => {
        const key = slotKey(slot);
        const ids = (result.bySlot.get(key) ?? []).filter((id) => people.has(id));
        return { slot, key, count: ids.length, ids };
      })
      .filter((row) => row.count > 0);
    rows.sort((a, b) => b.count - a.count);
    return rows;
  }, [mine, result.bySlot, people]);

  const activeFilter = filter && sharedSlots.some((row) => row.key === filter) ? filter : null;
  const activeSlotRow = activeFilter
    ? sharedSlots.find((row) => row.key === activeFilter) ?? null
    : null;
  const listingSlot = activeSlotRow?.slot ?? sharedSlots[0]?.slot ?? null;

  const visibleSuggestions = useMemo(() => {
    if (!activeFilter) return suggestions;
    const order = new Map(activeSlotRow?.ids.map((id, index) => [id, index]) ?? []);
    return suggestions
      .filter((row) => order.has(row.profileId))
      .sort((a, b) => (order.get(a.profileId) ?? 0) - (order.get(b.profileId) ?? 0));
  }, [suggestions, activeFilter, activeSlotRow]);

  const courtSplit =
    activeSlotRow && activeSlotRow.count + 1 >= COURT_SIZE
      ? {
          court: visibleSuggestions.slice(0, COURT_SIZE - 1),
          rest: visibleSuggestions.slice(COURT_SIZE - 1),
        }
      : null;

  const tempActive = temporaryActive(matchFinder.mine, now);
  const tempExpiresAt = matchFinder.mine.temporaryExpiresAt;
  const showStrip =
    tempActive &&
    tempExpiresAt != null &&
    !stripHidden &&
    !temporaryStripDismissed(tempExpiresAt);

  function openSheet(slot: Slot | null = null) {
    setPreselect(slot);
    setSheetOpen(true);
  }

  async function handleClearTemporary() {
    if (clearing) return;
    setError(null);
    setClearing(true);
    try {
      await clearTemporary();
      onChanged();
    } catch (clearError) {
      setError(danishAuthError((clearError as Error).message));
    } finally {
      setClearing(false);
    }
  }

  const sheet = (
    <MatchFinderSheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      prefs={matchFinder.mine}
      hidden={matchFinder.hidden}
      onSaved={onChanged}
      onHiddenChange={onHiddenChange}
      preselect={preselect}
    />
  );

  if (!hasPrefs) {
    return (
      <>
        <Card
          className={`flex min-w-0 flex-col border-ball/35 bg-ball/15 p-5 ring-1 ring-ball/35 motion-safe:animate-home-nudge lg:p-6 ${className ?? ""}`}
        >
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-10">
            <div>
              <p className="text-sm font-semibold text-ball">
                {MATCH_FINDER_COPY.title}
              </p>
              <p className="mt-2 font-display text-3xl tracking-wide text-line sm:text-4xl">
                {MATCH_FINDER_COPY.noPrefsTitle}
              </p>
              <p className="mt-2 max-w-sm text-sm text-line/65">
                {MATCH_FINDER_COPY.noPrefsBody}
                {result.heat.size > 0
                  ? " Tryk på et felt for at starte med den tid."
                  : ""}
              </p>
              <div className="mt-5 hidden lg:block">
                <Button onClick={() => openSheet()}>
                  {MATCH_FINDER_COPY.setTimes}
                </Button>
              </div>
            </div>
            <div className="mt-4 lg:mt-0">
              <SlotGrid
                compact
                heat={result.heat}
                titles={titles}
                onCellClick={(slot) => openSheet(slot)}
              />
              <p className="mt-2 text-xs text-line/45">
                {result.heat.size > 0
                  ? "Lysere felter = flere i klubben kan spille"
                  : "Ingen i klubben har sat tider endnu – vær den første."}
              </p>
            </div>
          </div>
          <div className="mt-5 lg:hidden">
            <Button block onClick={() => openSheet()}>
              {MATCH_FINDER_COPY.setTimes}
            </Button>
          </div>
        </Card>
        {sheet}
      </>
    );
  }

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm font-semibold text-ball">{MATCH_FINDER_COPY.title}</p>
      {suggestions.length > 0 ? (
        <span className="rounded-full bg-ball px-2.5 py-0.5 text-xs font-bold text-court">
          {matchCountCopy(suggestions.length)}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => openSheet()}
        className="ml-auto hidden text-xs font-semibold text-line/55 transition hover:text-ball touch-manipulation lg:block"
      >
        {MATCH_FINDER_COPY.editTimes}
      </button>
    </div>
  );

  const strip = showStrip && tempExpiresAt ? (
    <div className="mt-3 flex items-center gap-2 rounded-2xl border border-ball/25 bg-ball/10 px-3 py-2 text-xs text-line/80">
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold text-ball">Midlertidig:</span>{" "}
        {formatSlots(matchFinder.mine.temporary)} ·{" "}
        {temporaryExpiryCopy(tempExpiresAt, now)}
      </span>
      <button
        type="button"
        disabled={clearing}
        onClick={() => void handleClearTemporary()}
        className="shrink-0 font-semibold text-ball hover:underline disabled:opacity-60"
      >
        {clearing ? "Fjerner…" : "Fjern"}
      </button>
      <button
        type="button"
        aria-label="Skjul"
        onClick={() => {
          dismissTemporaryStrip(tempExpiresAt);
          setStripHidden(true);
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-line/50 hover:bg-line/10 hover:text-line"
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  ) : null;

  const hiddenNote = matchFinder.hidden ? (
    <p className="mt-2 text-xs text-line/45">{MATCH_FINDER_COPY.hiddenNote}</p>
  ) : null;

  if (suggestions.length === 0) {
    return (
      <>
        <Card className={`flex min-w-0 flex-col p-5 lg:p-6 ${className ?? ""}`}>
          {header}
          {strip}
          {hiddenNote}
          <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
            <div>
              <SlotGrid
                value={mineKeys}
                heat={result.heat}
                titles={titles}
                onCellClick={(slot) => openSheet(slot)}
              />
              <HeatLegend />
            </div>
            <div className="mt-5 lg:mt-0">
              <p className="text-sm text-line/70">{MATCH_FINDER_COPY.noOverlap}</p>
              <p className="mt-1 text-xs text-line/45">
                Du får besked her, så snart nogen i klubben kan på samme tid.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => openSheet()}>
                  {MATCH_FINDER_COPY.editTimes}
                </Button>
              </div>
            </div>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
        </Card>
        {sheet}
      </>
    );
  }

  const stackPeople = suggestions
    .slice(0, 5)
    .map((row) => people.get(row.profileId))
    .filter((person): person is PartnerPreview => Boolean(person));
  const summaryNames = summarizeNames(stackPeople, suggestions.length);
  const rows = expanded ? visibleSuggestions : visibleSuggestions.slice(0, PREVIEW_ROWS);
  const hiddenCount = visibleSuggestions.length - rows.length;

  const listingButton = listingSlot ? (
    <Button to={listingCreatePath(listingSlot, now)} className="whitespace-nowrap">
      {MATCH_FINDER_COPY.createListing}
      <span className="ml-1.5 font-normal opacity-70">· {slotLabel(listingSlot)}</span>
    </Button>
  ) : null;

  return (
    <>
      <Card className={`flex min-w-0 flex-col p-5 lg:p-6 ${className ?? ""}`}>
        {header}
        {strip}
        {hiddenNote}
        {error ? (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-10">
          <div>
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex shrink-0">
                {stackPeople.map((person, index) => (
                  <span
                    key={person.id}
                    className={index > 0 ? "-ml-2" : undefined}
                    style={{ zIndex: stackPeople.length - index }}
                  >
                    <MemberAvatar person={person} size="xs" ring="court" />
                  </span>
                ))}
              </div>
              <p className="min-w-0 truncate text-sm text-line/70">{summaryNames}</p>
            </div>

            <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
              {sharedSlots.map((row) => {
                const active = row.key === activeFilter;
                return (
                  <button
                    key={row.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(active ? null : row.key)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition touch-manipulation ${
                      active
                        ? "bg-ball text-court"
                        : "border border-line/20 text-line/70 hover:border-ball hover:text-ball"
                    }`}
                  >
                    {slotLabel(row.slot)} · {row.count}
                  </button>
                );
              })}
            </div>

            <div className="hidden lg:block">
              <SlotGrid
                value={mineKeys}
                heat={result.heat}
                highlight={activeFilter ? new Set([activeFilter]) : undefined}
                titles={titles}
                onCellClick={(slot) => {
                  const key = slotKey(slot);
                  if (!mineKeys.has(key)) {
                    openSheet(slot);
                    return;
                  }
                  setFilter((current) => (current === key ? null : key));
                }}
              />
              <HeatLegend
                extra={[
                  "Klik på en af dine tider for at filtrere listen",
                  "Klik på en tom tid for at tilføje den",
                ]}
              />
            </div>
          </div>

          <div className="mt-4 lg:mt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-line/70">
                {activeSlotRow ? (
                  <>
                    <span className="font-semibold text-line">
                      {slotLabel(activeSlotRow.slot)}
                    </span>
                    <span className="text-line/50">
                      {" "}
                      · {slotOccupancyCopy(activeSlotRow.count + 1)}
                    </span>
                  </>
                ) : (
                  <span className="text-line/50">
                    Alle der deler mindst én af dine tider
                  </span>
                )}
              </p>
              {activeFilter ? (
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="text-xs font-semibold text-line/55 hover:text-ball"
                >
                  Vis alle
                </button>
              ) : null}
            </div>

            {courtSplit ? (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-ball">
                  {MATCH_FINDER_COPY.suggestedCourt}
                </p>
                <ul className="mt-1 divide-y divide-line/10">
                  {courtSplit.court.map((row) => (
                    <SuggestionRow
                      key={row.profileId}
                      row={row}
                      person={people.get(row.profileId)}
                      rating={ratings.get(row.profileId)}
                      filterKey={activeFilter}
                    />
                  ))}
                </ul>
                {courtSplit.rest.length > 0 ? (
                  <>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-line/45">
                      {MATCH_FINDER_COPY.alsoAvailable}
                    </p>
                    <ul className="mt-1 divide-y divide-line/10">
                      {(expanded
                        ? courtSplit.rest
                        : courtSplit.rest.slice(0, PREVIEW_ROWS)
                      ).map((row) => (
                        <SuggestionRow
                          key={row.profileId}
                          row={row}
                          person={people.get(row.profileId)}
                          rating={ratings.get(row.profileId)}
                          filterKey={activeFilter}
                        />
                      ))}
                    </ul>
                    {courtSplit.rest.length > PREVIEW_ROWS ? (
                      <ShowAllButton
                        expanded={expanded}
                        total={courtSplit.rest.length}
                        onToggle={() => setExpanded((open) => !open)}
                      />
                    ) : null}
                  </>
                ) : null}
              </>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-line/10">
                  {rows.map((row) => (
                    <SuggestionRow
                      key={row.profileId}
                      row={row}
                      person={people.get(row.profileId)}
                      rating={ratings.get(row.profileId)}
                      filterKey={activeFilter}
                    />
                  ))}
                </ul>
                {hiddenCount > 0 || expanded ? (
                  <ShowAllButton
                    expanded={expanded}
                    total={visibleSuggestions.length}
                    onToggle={() => setExpanded((open) => !open)}
                  />
                ) : null}
              </>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {listingButton}
              <Button variant="secondary" onClick={() => openSheet()}>
                {MATCH_FINDER_COPY.editTimes}
              </Button>
            </div>
          </div>
        </div>
      </Card>
      {sheet}
    </>
  );
}

function HeatLegend({ extra = [] }: { extra?: string[] }) {
  return (
    <ul className="mt-3 space-y-1.5 text-xs text-line/50">
      <li className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-[0.3rem] bg-line/[0.06] ring-2 ring-inset ring-ball"
        />
        Dine tider
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="flex shrink-0 gap-0.5">
          <span className="h-3.5 w-3.5 rounded-[0.3rem] bg-ball/15" />
          <span className="h-3.5 w-3.5 rounded-[0.3rem] bg-ball/30" />
          <span className="h-3.5 w-3.5 rounded-[0.3rem] bg-ball/50" />
          <span className="h-3.5 w-3.5 rounded-[0.3rem] bg-ball/80" />
        </span>
        Flere i klubben kan · fuld farve = nok til en bane
      </li>
      {extra.map((line) => (
        <li key={line} className="flex items-center gap-2">
          <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {line}
        </li>
      ))}
    </ul>
  );
}

function ShowAllButton({
  expanded,
  total,
  onToggle,
}: {
  expanded: boolean;
  total: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 text-sm font-semibold text-ball hover:underline touch-manipulation"
    >
      {expanded
        ? MATCH_FINDER_COPY.showFewer
        : `${MATCH_FINDER_COPY.showAll} (${total})`}
    </button>
  );
}

function SuggestionRow({
  row,
  person,
  rating,
  filterKey,
}: {
  row: Suggestion;
  person: PartnerPreview | undefined;
  rating: number | undefined;
  filterKey: SlotKey | null;
}) {
  if (!person) return null;
  const name = fullName(person);
  const otherSlots = filterKey
    ? row.sharedSlots.filter((slot) => slotKey(slot) !== filterKey)
    : row.sharedSlots;
  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <MemberAvatar person={person} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight text-line">
          {withRating(name, rating)}
        </span>
        <span className="mt-0.5 block truncate text-xs text-line/50">
          {!filterKey
            ? formatSlots(row.sharedSlots)
            : otherSlots.length > 0
              ? `Også ${formatSlots(otherSlots)}`
              : "Passer med din tid"}
        </span>
      </span>
      {person.username ? (
        <Link
          to={messagePath(person.username)}
          aria-label={`${MATCH_FINDER_COPY.message} til ${name}`}
          title={MATCH_FINDER_COPY.message}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/15 text-line/70 transition hover:border-ball hover:text-ball touch-manipulation"
        >
          <ChatBubbleIcon />
        </Link>
      ) : null}
    </li>
  );
}

function summarizeNames(people: PartnerPreview[], total: number) {
  const names = people.slice(0, 2).map((person) => person.first_name?.trim() || shortDisplayName(person));
  const rest = total - names.length;
  if (names.length === 0) return "";
  if (rest <= 0) return names.join(names.length === 2 ? " og " : "");
  return `${names.join(", ")} og ${rest} ${rest === 1 ? "anden" : "andre"}`;
}
