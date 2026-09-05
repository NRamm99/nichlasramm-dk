import { useState } from "react";
import { danishAuthError } from "../lib/authErrors";
import {
  declinePoll,
  formatPollEnds,
  votePoll,
  type PendingPoll,
} from "../lib/poll";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Field, fieldClass } from "./ui/Field";

export function HomePoll({
  poll,
  onDone,
}: {
  poll: PendingPoll;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const commentOn = poll.comment_mode !== "off";
  const commentOnly = poll.comment_mode === "only";
  const commentTitle = poll.comment_title?.trim() || "Kommentar";

  async function submit(optionId: string | null, declined: boolean) {
    setError(null);
    setBusy(true);
    try {
      if (declined) await declinePoll(poll.id);
      else await votePoll(poll.id, optionId, commentOn ? comment : undefined);
      onDone();
    } catch (voteError) {
      setError(danishAuthError((voteError as Error).message));
    } finally {
      setBusy(false);
    }
  }

  function handleOption(optionId: string) {
    if (commentOn) {
      setPicked(optionId);
      return;
    }
    void submit(optionId, false);
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-ball">Afstemning</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] ${
            poll.anonymous
              ? "bg-ball/15 text-ball"
              : "border border-line/20 text-line/70"
          }`}
        >
          {poll.anonymous ? "Anonym" : "Ikke anonym"}
        </span>
      </div>
      <p className="mt-2 font-display text-3xl tracking-wide sm:text-4xl">
        {poll.question}
      </p>
      <p className="mt-2 text-sm text-line/60">
        {poll.anonymous
          ? "Dit svar vises uden navn."
          : "Dit navn vises sammen med dit svar for administratoren."}
      </p>
      {poll.ends_at ? (
        <p className="mt-1 text-xs text-line/45">
          Slutter {formatPollEnds(poll.ends_at)}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {commentOnly ? null : (
        <div className="mt-4 grid gap-2">
          {poll.options.map((option) => (
            <Button
              key={option.id}
              variant={picked === option.id ? "primary" : "secondary"}
              block
              disabled={busy}
              onClick={() => handleOption(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
      {commentOn ? (
        <Field label={commentTitle} className="mt-4">
          <textarea
            rows={3}
            maxLength={500}
            required={commentOnly}
            value={comment}
            disabled={busy}
            onChange={(event) => setComment(event.target.value)}
            className={fieldClass("mt-2")}
          />
        </Field>
      ) : null}
      <div className="mt-4 grid gap-2">
        {commentOn ? (
          <Button
            block
            disabled={
              busy ||
              (commentOnly ? !comment.trim() : !picked)
            }
            onClick={() => void submit(picked, false)}
          >
            Send svar
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="justify-center text-line/60 hover:text-ball"
          disabled={busy}
          onClick={() => void submit(null, true)}
        >
          Vil ikke stemme
        </Button>
      </div>
    </Card>
  );
}
