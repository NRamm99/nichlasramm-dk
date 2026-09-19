import { useMemo, useState } from "react";
import type { PlayerPick } from "../lib/match";
import { fullName, type PartnerPreview } from "../lib/profile";
import { withRating } from "../lib/rating";
import { MemberAvatar } from "./MemberAvatar";
import { Button } from "./ui/Button";
import { fieldClass } from "./ui/Field";
import { Sheet } from "./ui/Sheet";

export function PlayerSearchSheet({
  open,
  onClose,
  title = "Vælg spiller",
  members,
  excludeIds,
  ratings,
  allowGuest = false,
  value,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  members: PartnerPreview[];
  excludeIds: string[];
  ratings?: Map<string, number>;
  allowGuest?: boolean;
  value: PlayerPick | null;
  onSelect: (pick: PlayerPick | null) => void;
}) {
  if (!open) return null;
  return (
    <PlayerSearchEditor
      onClose={onClose}
      title={title}
      members={members}
      excludeIds={excludeIds}
      ratings={ratings}
      allowGuest={allowGuest}
      value={value}
      onSelect={onSelect}
    />
  );
}

function PlayerSearchEditor({
  onClose,
  title,
  members,
  excludeIds,
  ratings,
  allowGuest,
  value,
  onSelect,
}: {
  onClose: () => void;
  title: string;
  members: PartnerPreview[];
  excludeIds: string[];
  ratings?: Map<string, number>;
  allowGuest: boolean;
  value: PlayerPick | null;
  onSelect: (pick: PlayerPick | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [guestName, setGuestName] = useState(
    value?.kind === "guest" ? value.name : "",
  );

  const available = useMemo(() => {
    const selectedId = value?.kind === "member" ? value.id : null;
    return members.filter(
      (member) =>
        !excludeIds.includes(member.id) || member.id === selectedId,
    );
  }, [excludeIds, members, value]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return available;
    return available.filter((member) => {
      const rating = ratings?.get(member.id);
      const hay = `${fullName(member)} ${member.username ?? ""} ${
        rating ?? ""
      }`.toLowerCase();
      return hay.includes(needle);
    });
  }, [available, query, ratings]);

  function pickMember(member: PartnerPreview) {
    onSelect({ kind: "member", id: member.id });
    onClose();
  }

  function addGuest() {
    const name = guestName.trim();
    if (!name) return;
    onSelect({ kind: "guest", name });
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow="Kamp"
      title={title}
      footer={
        allowGuest || value ? (
          <div className="space-y-3">
            {allowGuest ? (
              <div className="flex gap-2">
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addGuest();
                    }
                  }}
                  placeholder="Gæstens navn"
                  className={fieldClass("mt-0")}
                  aria-label="Gæstens navn"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!guestName.trim()}
                  onClick={addGuest}
                >
                  Gæst
                </Button>
              </div>
            ) : null}
            {value ? (
              <Button
                type="button"
                variant="ghost"
                className="text-sm text-line/60"
                onClick={() => {
                  onSelect(null);
                  onClose();
                }}
              >
                Fjern spiller
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <label className="block">
        <span className="sr-only">Søg medlem</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Søg navn eller @brugernavn"
          autoComplete="off"
          autoFocus
          className={fieldClass("mt-0 text-sm placeholder:text-line/40")}
        />
      </label>
      <ul className="mt-4 space-y-1">
        {filtered.length === 0 ? (
          <li className="px-1 py-6 text-center text-sm text-line/55">
            Ingen medlemmer matcher.
          </li>
        ) : (
          filtered.map((member) => {
            const selected = value?.kind === "member" && value.id === member.id;
            return (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => pickMember(member)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition touch-manipulation ${
                    selected
                      ? "bg-ball/15 ring-1 ring-ball/40"
                      : "hover:bg-line/10"
                  }`}
                >
                  <MemberAvatar person={member} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-line">
                      {withRating(fullName(member), ratings?.get(member.id))}
                    </span>
                    {member.username ? (
                      <span className="block truncate text-xs text-line/50">
                        @{member.username}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </Sheet>
  );
}
