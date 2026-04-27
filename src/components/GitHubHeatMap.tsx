import { useEffect, useState } from "react";

type ContributionDay = {
  date: string;
  contributionCount: number;
};

type ContributionWeek = {
  contributionDays: ContributionDay[];
};

export default function GitHubHeatMap() {
  const [weeks, setWeeks] = useState<ContributionWeek[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/github")
      .then((res) => res.json())
      .then((data) => {
        const calendar =
          data.data.user.contributionsCollection.contributionCalendar;

        setWeeks(calendar.weeks);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p>Loading GitHub activity...</p>;
  }

  if (weeks.length === 0) {
    return <p>GitHub activity unavailable right now.</p>;
  }

  return (
    <section className="github-section">
      <h2>GitHub Activity</h2>

      <div className="heatmap">
        {weeks.map((week) =>
          week.contributionDays.map((day) => (
            <div
              key={day.date}
              className={`heatmap-day level-${getLevel(day.contributionCount)}`}
              title={`${day.date}: ${day.contributionCount} contributions`}
            />
          ))
        )}
      </div>
    </section>
  );
}

function getLevel(count: number) {
  if (count === 0) return 0;
  if (count < 3) return 1;
  if (count < 6) return 2;
  if (count < 10) return 3;
  return 4;
}