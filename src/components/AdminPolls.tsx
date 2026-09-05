import { useCallback, useEffect, useState, type FormEvent } from "react";
import { danishAuthError } from "../lib/authErrors";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "../lib/match";
import {
  archivePoll,
  closePoll,
  commentModeLabel,
  createPoll,
  deletePoll,
  fetchAdminPolls,
  formatPollEnds,
  unarchivePoll,
  type AdminPoll,
  type PollCommentMode,
} from "../lib/poll";
import { Button } from "./ui/Button";
import { Field, fieldClass } from "./ui/Field";

function defaultEndsAt() {
  const when = new Date();
  when.setDate(when.getDate() + 1);
  when.setHours(20, 0, 0, 0);
  return toDatetimeLocalValue(when);
}

function ModeToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-line/15 bg-court p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            value === option.id
              ? "bg-ball text-court"
              : "text-line/60 hover:text-line"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AdminPolls() {
  const [polls, setPolls] = useState<AdminPoll[]>([]);
  const [question, setQuestion] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [commentMode, setCommentMode] = useState<PollCommentMode>("off");
  const [commentTitle, setCommentTitle] = useState("Kommentar");
  const [endsAt, setEndsAt] = useState(defaultEndsAt);
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const visiblePolls = polls.filter((poll) => !poll.archived_at);
  const archivedPolls = polls.filter((poll) => Boolean(poll.archived_at));

  const load = useCallback(async () => {
    try {
      setPolls(await fetchAdminPolls());
    } catch (loadError) {
      setError(danishAuthError((loadError as Error).message));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const iso = fromDatetimeLocalValue(endsAt);
    if (!iso) {
      setError("Vælg en gyldig slutdato og et tidspunkt.");
      return;
    }
    setSaving(true);
    try {
      await createPoll({
        question,
        anonymous,
        endsAt: iso,
        options,
        commentMode,
        commentTitle,
      });
      setQuestion("");
      setAnonymous(true);
      setCommentMode("off");
      setCommentTitle("Kommentar");
      setEndsAt(defaultEndsAt());
      setOptions(["", ""]);
      setInfo("Meningsmålingen er oprettet og vises på forsiden.");
      await load();
    } catch (saveError) {
      setError(danishAuthError((saveError as Error).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-3xl tracking-wide">Afstemning</h2>
      <p className="mt-2 max-w-xl text-sm text-line/65">
        En aktiv måling vises øverst på forsiden, indtil medlemmet stemmer eller
        afviser.
      </p>

      <form
        onSubmit={(event) => void handleCreate(event)}
        className="mt-6 space-y-5 rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-5"
      >
        <Field label="Spørgsmål">
          <input
            required
            maxLength={280}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className={fieldClass("mt-2")}
          />
        </Field>

        {commentMode === "only" ? null : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-line/80">Svarmuligheder</p>
            {options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <input
                  required={index < 2}
                  maxLength={80}
                  value={option}
                  placeholder={`Svar ${index + 1}`}
                  onChange={(event) => {
                    const next = [...options];
                    next[index] = event.target.value;
                    setOptions(next);
                  }}
                  className={fieldClass("flex-1")}
                />
                {options.length > 2 ? (
                  <button
                    type="button"
                    className="shrink-0 text-sm font-semibold text-line/50 hover:text-ball"
                    onClick={() =>
                      setOptions(options.filter((_, item) => item !== index))
                    }
                  >
                    Fjern
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="text-sm font-semibold text-ball"
              onClick={() => setOptions([...options, ""])}
            >
              Tilføj svar
            </button>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-line/80">Kommentar</p>
          <ModeToggle
            value={commentMode}
            onChange={(value) => setCommentMode(value as PollCommentMode)}
            options={[
              { id: "off", label: "Fra" },
              { id: "optional", label: "Valgfri" },
              { id: "only", label: "Kun kommentar" },
            ]}
          />
          {commentMode !== "off" ? (
            <Field label="Titel på kommentarfelt" className="mt-3">
              <input
                required
                maxLength={80}
                value={commentTitle}
                onChange={(event) => setCommentTitle(event.target.value)}
                className={fieldClass("mt-2")}
              />
            </Field>
          ) : null}
        </div>

        <Field label="Slutdato og tidspunkt">
          <input
            required
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className={fieldClass("mt-2")}
          />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-line/80">Svar</p>
          <ModeToggle
            value={anonymous ? "anon" : "named"}
            onChange={(value) => setAnonymous(value === "anon")}
            options={[
              { id: "anon", label: "Anonym" },
              { id: "named", label: "Med navn" },
            ]}
          />
        </div>

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
        <Button type="submit" disabled={saving}>
          {saving ? "Opretter…" : "Opret meningsmåling"}
        </Button>
      </form>

      {visiblePolls.length > 0 ? (
        <ul className="mt-8 space-y-5">
          {visiblePolls.map((poll) => (
            <AdminPollCard
              key={poll.id}
              poll={poll}
              onChanged={(kind) => {
                if (kind === "archive") setShowArchive(true);
                void load();
              }}
            />
          ))}
        </ul>
      ) : null}

      {archivedPolls.length > 0 ? (
        <div className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display text-3xl tracking-wide">Arkiv</h3>
            <button
              type="button"
              onClick={() => setShowArchive((open) => !open)}
              className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold text-line/80"
            >
              {showArchive ? "Skjul" : `Vis (${archivedPolls.length})`}
            </button>
          </div>
          {showArchive ? (
            <ul className="mt-5 space-y-5">
              {archivedPolls.map((poll) => (
                <AdminPollCard
                  key={poll.id}
                  poll={poll}
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

function AdminPollCard({
  poll,
  onChanged,
}: {
  poll: AdminPoll;
  onChanged: (kind?: "archive") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voteTotal = poll.options.reduce((sum, option) => sum + option.votes, 0);
  const hasResults =
    voteTotal > 0 || poll.declined > 0 || poll.answered > 0 || poll.comments.length > 0;
  const archived = Boolean(poll.archived_at);

  async function run(action: () => Promise<void>, kind?: "archive") {
    setError(null);
    setBusy(true);
    try {
      await action();
      onChanged(kind);
    } catch (actionError) {
      setError(danishAuthError((actionError as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid">
      <div className="border-b border-line/10 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] ${
              poll.open ? "bg-ball/15 text-ball" : "bg-line/10 text-line/55"
            }`}
          >
            {poll.open ? "Aktiv" : archived ? "Arkiveret" : "Afsluttet"}
          </span>
          <span className="rounded-full border border-line/15 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-line/55">
            {poll.anonymous ? "Anonym" : "Med navn"}
          </span>
          {poll.comment_mode !== "off" ? (
            <span className="rounded-full border border-line/15 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-line/55">
              {commentModeLabel(poll.comment_mode)}
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {poll.open ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => closePoll(poll.id))}
                className="text-xs font-semibold text-line/55 hover:text-ball disabled:opacity-60"
              >
                {busy ? "Arbejder…" : "Afslut nu"}
              </button>
            ) : confirmDelete ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs font-semibold text-line/55 hover:text-line disabled:opacity-60"
                >
                  Annuller
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => deletePoll(poll.id))}
                  className="text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-60"
                >
                  {busy ? "Sletter…" : "Bekræft sletning"}
                </button>
              </>
            ) : (
              <>
                {archived ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => unarchivePoll(poll.id))}
                    className="text-xs font-semibold text-line/55 hover:text-ball disabled:opacity-60"
                  >
                    Gendan
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => archivePoll(poll.id), "archive")}
                    className="text-xs font-semibold text-line/55 hover:text-ball disabled:opacity-60"
                  >
                    Arkiver
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs font-semibold text-red-300/80 hover:text-red-300 disabled:opacity-60"
                >
                  Slet
                </button>
              </>
            )}
          </div>
        </div>
        <p className="mt-3 font-display text-3xl tracking-wide">{poll.question}</p>
        <p className="mt-2 text-xs text-line/45">
          {poll.open ? "Slutter" : "Sluttede"} {formatPollEnds(poll.ends_at)}
        </p>
        {error ? (
          <p className="mt-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-line/10 px-5 py-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-line/40">
            Svar
          </p>
          <p className="mt-1 font-display text-2xl tabular-nums text-ball">
            {poll.answered}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-line/40">
            Vil ikke svare
          </p>
          <p className="mt-1 font-display text-2xl tabular-nums text-line">
            {poll.declined}
          </p>
        </div>
      </div>

      {poll.options.length > 0 ? (
        <ul className="space-y-3 px-5 py-4">
          {poll.options.map((option) => {
            const share = voteTotal > 0 ? option.votes / voteTotal : 0;
            return (
              <li key={option.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{option.label}</span>
                  <span className="tabular-nums text-ball">{option.votes}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/10">
                  <div
                    className="h-full rounded-full bg-ball"
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {poll.comments && poll.comments.length > 0 ? (
        <div className="border-t border-line/10 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-line/45">
            {poll.comment_title || "Kommentarer"}
          </p>
          <ul className="mt-3 space-y-3">
            {poll.comments.map((row, index) => (
              <li
                key={`${row.name ?? "anon"}-${index}`}
                className="rounded-2xl bg-court px-4 py-3"
              >
                {row.name ? (
                  <p className="text-xs font-semibold text-ball">{row.name}</p>
                ) : poll.anonymous ? (
                  <p className="text-xs font-semibold text-line/40">Anonym</p>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap text-sm text-line/80">
                  {row.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {poll.voters && poll.voters.length > 0 && poll.comment_mode !== "only" ? (
        <div className="border-t border-line/10 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-line/45">
            Hvem svarede
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-line/70">
            {poll.voters.map((voter) => {
              const choice = voter.declined
                ? "vil ikke svare"
                : poll.options.find((option) => option.id === voter.option_id)
                    ?.label ?? "svar";
              return (
                <li key={voter.id} className="flex justify-between gap-3">
                  <span>{voter.name || "Medlem"}</span>
                  <span className="text-line/45">{choice}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {hasResults ? null : (
        <p className="px-5 py-4 text-sm text-line/45">Ingen svar endnu.</p>
      )}
    </li>
  );
}
