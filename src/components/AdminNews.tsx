import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { danishAuthError } from "../lib/authErrors";
import {
  closeClubNews,
  createClubNews,
  fetchAdminClubNews,
  NEWS_BODY_MAX,
  NEWS_TITLE_MAX,
  newsListTitle,
  type AdminClubNews,
  type ClubNewsPerson,
} from "../lib/news";
import { fullName, type PartnerPreview } from "../lib/profile";
import { supabase } from "../lib/supabase";
import { MemberAvatar } from "./MemberAvatar";
import { Button } from "./ui/Button";
import { Field, fieldClass } from "./ui/Field";

export function AdminNews() {
  const [rows, setRows] = useState<AdminClubNews[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [members, setMembers] = useState<PartnerPreview[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const live = rows.filter((row) => row.open);
  const archived = rows.filter((row) => !row.open);

  const load = useCallback(async () => {
    try {
      setRows(await fetchAdminClubNews());
    } catch (loadError) {
      setError(danishAuthError((loadError as Error).message));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void supabase
      .from("profiles")
      .select("id, username, first_name, last_name, avatar_url")
      .is("banned_at", null)
      .order("first_name")
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError(danishAuthError(loadError.message));
          return;
        }
        setMembers((data ?? []) as PartnerPreview[]);
      });
  }, [open]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return members;
    return members.filter((member) => {
      const name = fullName(member).toLowerCase();
      const username = (member.username ?? "").toLowerCase();
      return name.includes(query) || username.includes(query);
    });
  }, [members, query]);

  const audienceSize = scope === "all" ? members.length : selected.size;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const cleanedTitle = title.trim();
    const cleanedBody = body.trim();
    if (!cleanedTitle) {
      setError(danishAuthError("NEWS_TITLE_REQUIRED"));
      return;
    }
    if (!cleanedBody) {
      setError(danishAuthError("NEWS_BODY_REQUIRED"));
      return;
    }
    if (scope === "selected" && selected.size === 0) {
      setError(danishAuthError("NEWS_RECIPIENTS_REQUIRED"));
      return;
    }

    setSaving(true);
    try {
      await createClubNews({
        title: cleanedTitle,
        body: cleanedBody,
        profileIds: scope === "all" ? null : [...selected],
      });
      setTitle("");
      setBody("");
      setSelected(new Set());
      setInfo("Nyheden vises som popup og sendes som push til dem, der har slået beskeder til.");
      await load();
    } catch (sendError) {
      setError(danishAuthError((sendError as Error).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-10 rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ball">
        Nyhed
      </p>
      <h2 className="mt-2 font-display text-3xl tracking-wide">Popup</h2>
      <p className="mt-2 text-sm text-line/65">
        Vises som popup, indtil de trykker Forstået. Der sendes samtidig en
        push-besked med overskriften og teksten “Åbn appen for at se”.
      </p>

      {!open ? (
        <>
          {error ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-5 rounded-full bg-ball px-6 py-3 text-sm font-semibold text-court"
          >
            Skriv nyhed
          </button>
        </>
      ) : (
        <form onSubmit={(event) => void handleSend(event)} className="mt-5 space-y-4">
          <Field label="Overskrift">
            <input
              value={title}
              onChange={(event) =>
                setTitle(event.target.value.slice(0, NEWS_TITLE_MAX))
              }
              required
              className={fieldClass("mt-1")}
            />
            <span className="mt-1 block text-xs text-line/45">
              {title.trim().length}/{NEWS_TITLE_MAX}
            </span>
          </Field>
          <Field label="Tekst">
            <textarea
              value={body}
              onChange={(event) =>
                setBody(event.target.value.slice(0, NEWS_BODY_MAX))
              }
              rows={4}
              required
              className={fieldClass("mt-1")}
            />
            <span className="mt-1 block text-xs text-line/45">
              {body.trim().length}/{NEWS_BODY_MAX}
            </span>
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm text-line/70">Modtagere</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="news-scope"
                checked={scope === "all"}
                onChange={() => setScope("all")}
              />
              Alle aktive medlemmer
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="news-scope"
                checked={scope === "selected"}
                onChange={() => setScope("selected")}
              />
              Udvalgte medlemmer
            </label>
          </fieldset>

          {scope === "selected" ? (
            <div>
              <label className="block text-sm text-line/70">
                Søg
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-line/10 bg-court px-4 py-3 text-base outline-none focus:border-ball/50"
                />
              </label>
              <p className="mt-2 text-xs text-line/45">
                {selected.size} valgt
              </p>
              <ul className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-line/10">
                {visible.map((member) => {
                  const checked = selected.has(member.id);
                  return (
                    <li
                      key={member.id}
                      className="border-b border-line/10 last:border-b-0"
                    >
                      <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(member.id)}
                        />
                        <MemberAvatar person={member} size="sm" />
                        <span className="text-sm">
                          {fullName(member)}
                          {member.username ? (
                            <span className="ml-1 text-line/45">
                              @{member.username}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : members.length > 0 ? (
            <p className="text-xs text-line/45">
              {audienceSize === 1
                ? "Sendes til 1 medlem."
                : `Sendes til ${audienceSize} medlemmer.`}
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="text-sm text-ball" role="status">
              {info}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-ball px-6 py-3 text-sm font-semibold text-court disabled:opacity-60"
            >
              {saving ? "Sender…" : "Send nyhed"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-line/15 px-6 py-3 text-sm font-semibold text-line/80"
            >
              Luk
            </button>
          </div>
        </form>
      )}

      {live.length > 0 ? (
        <ul className="mt-8 space-y-4">
          {live.map((row) => (
            <NewsReceiptCard
              key={row.id}
              row={row}
              onChanged={() => void load()}
            />
          ))}
        </ul>
      ) : null}

      {archived.length > 0 ? (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display text-2xl tracking-wide">Arkiv</h3>
            <button
              type="button"
              onClick={() => setShowArchive((value) => !value)}
              className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold text-line/80"
            >
              {showArchive ? "Skjul" : `Vis (${archived.length})`}
            </button>
          </div>
          {showArchive ? (
            <ul className="mt-4 space-y-4">
              {archived.map((row) => (
                <NewsReceiptCard
                  key={row.id}
                  row={row}
                  onChanged={() => void load()}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function NewsReceiptCard({
  row,
  onChanged,
}: {
  row: AdminClubNews;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = Math.max(0, row.sent - row.acked);

  async function close() {
    setError(null);
    setBusy(true);
    try {
      await closeClubNews(row.id);
      onChanged();
    } catch (closeError) {
      setError(danishAuthError((closeError as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-line/10 bg-court">
      <div className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] ${
              row.open ? "bg-ball/15 text-ball" : "bg-line/10 text-line/55"
            }`}
          >
            {row.open ? "Aktiv" : "Afsluttet"}
          </span>
          {row.open ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void close()}
              className="ml-auto text-xs font-semibold text-line/55 hover:text-ball disabled:opacity-60"
            >
              {busy ? "Arbejder…" : "Afslut nu"}
            </button>
          ) : null}
        </div>
        <p className="mt-2 font-semibold text-line">{newsListTitle(row)}</p>
        <p className="mt-1 text-sm text-line/60">
          {row.sent} sendt · {row.shown} vist · {row.acked} læst
          {missing > 0 ? ` · ${missing} mangler` : ""}
        </p>
        {error ? (
          <p className="mt-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          variant="ghost"
          className="mt-2 text-xs"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Skjul kvitteringer" : "Se kvitteringer"}
        </Button>
      </div>
      {expanded ? (
        <div className="space-y-4 border-t border-line/10 px-4 py-4 text-sm">
          <PersonGroup title="Læst" people={row.acked_people} />
          <PersonGroup
            title="Vist, ikke læst"
            people={row.shown_people}
          />
          <PersonGroup title="Ikke vist" people={row.unseen_people} />
        </div>
      ) : null}
    </li>
  );
}

function PersonGroup({
  title,
  people,
}: {
  title: string;
  people: ClubNewsPerson[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-line/45">
        {title}
      </p>
      {people.length === 0 ? (
        <p className="mt-1 text-line/50">Ingen</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {people.map((person) => (
            <li key={person.id}>{person.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
