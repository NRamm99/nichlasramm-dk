import { useCallback, useEffect, useState } from "react";
import { danishAuthError } from "../lib/authErrors";
import { ackClubNews, type PendingClubNews } from "../lib/news";
import { Button } from "./ui/Button";

export function NewsDialog({
  news,
  onAcked,
}: {
  news: PendingClubNews;
  onAcked: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const acknowledge = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await ackClubNews(news.id);
      onAcked();
    } catch (ackError) {
      setError(danishAuthError((ackError as Error).message));
      setBusy(false);
    }
  }, [busy, news.id, onAcked]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        void acknowledge();
      }
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [acknowledge]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-court/80 p-4 sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={news.title ? "club-news-title" : undefined}
        aria-describedby="club-news-body"
        className="w-full max-w-lg rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6 shadow-xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ball">
          Nyhed
        </p>
        {news.title ? (
          <h2
            id="club-news-title"
            className="mt-2 font-display text-3xl tracking-wide"
          >
            {news.title}
          </h2>
        ) : null}
        <p
          id="club-news-body"
          className={`whitespace-pre-wrap text-sm text-line/80 ${
            news.title ? "mt-3" : "mt-2"
          }`}
        >
          {news.body}
        </p>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          autoFocus
          block
          className="mt-6"
          disabled={busy}
          onClick={() => void acknowledge()}
        >
          {busy ? "Gemmer…" : "Forstået"}
        </Button>
      </div>
    </div>
  );
}
