import {
  formatRatingDelta,
  isProvisional,
  type PlayerRating,
  type PlayerRatingSummary,
  type RatingSettings,
} from "../lib/rating";

export function ratingDeltaClass(delta: number) {
  if (delta > 0) return "text-ball";
  if (delta < 0) return "text-red-300";
  return "text-line/45";
}

export function RatingMark({
  value,
  className = "",
}: {
  value?: number | null;
  className?: string;
}) {
  if (value == null) return null;
  return (
    <span className={`font-normal tabular-nums text-line/45 ${className}`}>
      {" "}({value})
    </span>
  );
}

export function RatingDelta({
  delta,
  className = "",
}: {
  delta: number;
  className?: string;
}) {
  const tone =
    delta > 0
      ? "bg-ball/20 text-ball"
      : delta < 0
        ? "bg-red-500/15 text-red-300"
        : "bg-line/10 text-line/65";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone} ${className}`}
    >
      {formatRatingDelta(delta)}
    </span>
  );
}

export function RatingValue({
  rating,
  settings,
  className = "",
}: {
  rating: PlayerRating | null;
  settings: RatingSettings;
  className?: string;
}) {
  if (!rating) {
    return <span className={`text-line/40 ${className}`}>–</span>;
  }

  return (
    <span className={`tabular-nums ${className}`}>
      {rating.rating}
      {isProvisional(rating, settings) ? (
        <span
          title={`Foreløbig indtil ${settings.provisional_matches} kampe`}
          className="ml-0.5 align-super text-[0.7em] text-line/45"
        >
          *
        </span>
      ) : null}
    </span>
  );
}

export function RatingInline({ summary }: { summary: PlayerRatingSummary }) {
  const { rating, trend, trendMatches, settings } = summary;
  if (!rating) return null;

  const matchWord = trendMatches === 1 ? "kamp" : "kampe";
  const trendTone =
    trend === null
      ? "text-line/50"
      : trend > 0
        ? "text-ball"
        : trend < 0
          ? "text-red-300"
          : "text-line/50";

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 font-sans text-sm font-normal tracking-normal">
      <span className="ui-label">Rating</span>
      <RatingValue
        rating={rating}
        settings={settings}
        className="font-semibold text-ball"
      />
      {trend !== null && trendMatches > 0 ? (
        <span className={trendTone}>
          ({formatRatingDelta(trend)} seneste {trendMatches} {matchWord})
        </span>
      ) : null}
    </span>
  );
}
