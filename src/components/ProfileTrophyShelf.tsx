import { Card } from "./ui/Card";

export type ProfileTrophy = {
  id: string;
  title: string;
};

export function ProfileTrophyShelf({ trophies }: { trophies: ProfileTrophy[] }) {
  if (trophies.length === 0) return null;

  return (
    <Card className="p-5">
      <p className="ui-label">Trofæer</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {trophies.map((trophy) => (
          <span
            key={trophy.id}
            title={trophy.title}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-ball/30 bg-ball/10 text-ball"
          >
            <MedalIcon />
            <span className="sr-only">{trophy.title}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

function MedalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="14" r="5" />
      <path d="m9 4 3 4 3-4" />
    </svg>
  );
}
