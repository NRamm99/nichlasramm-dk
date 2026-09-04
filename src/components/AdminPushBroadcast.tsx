import { useEffect, useMemo, useState, type FormEvent } from "react";
import { danishAuthError } from "../lib/authErrors";
import { fullName, type PartnerPreview } from "../lib/profile";
import { supabase } from "../lib/supabase";
import { MemberAvatar } from "./MemberAvatar";

const MAX_BODY = 280;

export function AdminPushBroadcast() {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [members, setMembers] = useState<PartnerPreview[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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

    const cleaned = body.trim();
    if (!cleaned) {
      setError(danishAuthError("PUSH_BODY_REQUIRED"));
      return;
    }
    if (scope === "selected" && selected.size === 0) {
      setError(danishAuthError("PUSH_RECIPIENTS_REQUIRED"));
      return;
    }

    setSending(true);
    const { data, error: sendError } = await supabase.rpc("send_admin_push", {
      p_body: cleaned,
      p_profile_ids: scope === "all" ? null : [...selected],
    });
    setSending(false);

    if (sendError) {
      setError(danishAuthError(sendError.message));
      return;
    }

    const count = typeof data === "number" ? data : Number(data);
    setInfo(
      count === 1
        ? "Beskeden er sendt til 1 medlem."
        : `Beskeden er sendt til ${count} medlemmer.`,
    );
    setBody("");
    setSelected(new Set());
  }

  return (
    <section id="push" className="mt-10 rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ball">
        Beskeder
      </p>
      <h2 className="mt-2 font-display text-3xl tracking-wide">Push-besked</h2>
      <p className="mt-2 text-sm text-line/65">
        Sendes som push til dem der har slået beskeder til, og vises under Nyt.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 rounded-full bg-ball px-6 py-3 text-sm font-semibold text-court"
        >
          Send push-besked
        </button>
      ) : (
        <form onSubmit={(event) => void handleSend(event)} className="mt-5 space-y-4">
          <label className="block text-sm text-line/70">
            Besked
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value.slice(0, MAX_BODY))}
              rows={3}
              required
              className="mt-1 w-full rounded-2xl border border-line/10 bg-court px-4 py-3 text-base text-line outline-none focus:border-ball/50"
            />
            <span className="mt-1 block text-xs text-line/45">
              {body.trim().length}/{MAX_BODY}
            </span>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm text-line/70">Modtagere</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="push-scope"
                checked={scope === "all"}
                onChange={() => setScope("all")}
              />
              Alle aktive medlemmer
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="push-scope"
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
                    <li key={member.id} className="border-b border-line/10 last:border-b-0">
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
              disabled={sending}
              className="rounded-full bg-ball px-6 py-3 text-sm font-semibold text-court disabled:opacity-60"
            >
              {sending ? "Sender…" : "Send push-besked"}
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
    </section>
  );
}
