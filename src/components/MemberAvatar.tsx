import { Link } from "react-router-dom";
import { fullName, profilePath, type PartnerPreview } from "../lib/profile";

type MemberAvatarProps = {
  person: PartnerPreview;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "stack";
  ring?: "ball" | "court" | "line";
  className?: string;
};

export function MemberAvatar({
  person,
  size = "md",
  ring,
  className = "",
}: MemberAvatarProps) {
  const dim =
    size === "xs"
      ? "h-7 w-7"
      : size === "sm"
        ? "h-11 w-11"
        : size === "lg"
          ? "h-28 w-28"
          : size === "xl"
            ? "h-[6.75rem] w-[6.75rem] sm:h-32 sm:w-32 lg:h-40 lg:w-40"
            : size === "stack"
              ? "h-[4.5rem] w-[4.5rem] lg:h-28 lg:w-28"
              : "h-16 w-16";
  const initialsSize =
    size === "xl"
      ? "text-3xl lg:text-4xl"
      : size === "lg"
        ? "text-2xl"
        : size === "stack"
          ? "text-lg lg:text-2xl"
          : size === "xs"
            ? "text-[0.65rem]"
            : "text-sm";
  const photoRing =
    ring === "court"
      ? "ring-2 ring-court-mid"
      : ring === "line"
        ? "ring-2 ring-line/10"
        : ring === "ball"
          ? "ring-[3px] ring-ball"
          : size === "xs"
            ? "ring-2 ring-court-mid"
            : "ring-2 ring-ball/30";
  const initialsRing =
    ring === "court"
      ? "ring-2 ring-court-mid"
      : ring === "ball"
        ? "ring-[3px] ring-ball"
        : size === "xs"
          ? "ring-2 ring-court-mid"
          : "ring-2 ring-line/10";
  const name = fullName(person);
  const wideInitials = size === "lg" || size === "xl" || size === "stack";
  const first = person.first_name?.trim()?.[0];
  const last = person.last_name?.trim()?.[0];
  const letters =
    wideInitials && first && last
      ? `${first}${last}`.toUpperCase()
      : (first ?? person.username?.[0] ?? "?").toUpperCase();

  if (person.avatar_url) {
    return (
      <img
        src={person.avatar_url}
        alt={name}
        title={name}
        className={`${dim} rounded-full object-cover ${photoRing} ${className}`}
      />
    );
  }

  return (
    <div
      title={name}
      className={`flex ${dim} items-center justify-center rounded-full bg-court ${initialsSize} font-semibold tracking-wide text-line/50 ${initialsRing} ${className}`}
    >
      {letters}
    </div>
  );
}

type MemberNameLinkProps = {
  person: PartnerPreview;
  rating?: number | null;
};

export function TeamAvatarStack({ people }: { people: PartnerPreview[] }) {
  return (
    <div className="flex shrink-0">
      {people.map((person, index) => (
        <span
          key={person.id}
          className={`relative ${index > 0 ? "-ml-4 lg:-ml-6" : ""}`}
          style={{ zIndex: people.length - index }}
        >
          <MemberAvatar person={person} size="stack" ring="court" />
        </span>
      ))}
    </div>
  );
}

export function MemberNameLink({ person, rating }: MemberNameLinkProps) {
  const name = fullName(person);
  const labeled = (
    <>
      {name}
      {rating != null ? (
        <span className="font-normal tabular-nums text-line/45"> ({rating})</span>
      ) : null}
    </>
  );
  if (!person.username) {
    return <span className="font-semibold text-line">{labeled}</span>;
  }

  return (
    <Link
      to={profilePath(person.username)}
      className="font-semibold text-line hover:text-ball hover:underline"
    >
      {labeled}
    </Link>
  );
}
