import { Link } from "react-router-dom";
import { fullName, profilePath, type PartnerPreview } from "../lib/profile";

type MemberAvatarProps = {
  person: PartnerPreview;
  size?: "sm" | "md" | "lg";
};

export function MemberAvatar({ person, size = "md" }: MemberAvatarProps) {
  const dim =
    size === "sm" ? "h-11 w-11" : size === "lg" ? "h-28 w-28" : "h-16 w-16";
  const initialsSize = size === "lg" ? "text-2xl" : "text-sm";
  const name = fullName(person);

  if (person.avatar_url) {
    return (
      <img
        src={person.avatar_url}
        alt={name}
        className={`${dim} rounded-full object-cover ring-2 ring-ball/30`}
      />
    );
  }

  return (
    <div
      className={`flex ${dim} items-center justify-center rounded-full bg-court ${initialsSize} font-semibold text-line/50 ring-2 ring-line/10`}
    >
      {(person.first_name?.[0] ?? person.username?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

type MemberNameLinkProps = {
  person: PartnerPreview;
};

export function MemberNameLink({ person }: MemberNameLinkProps) {
  const name = fullName(person);
  if (!person.username) {
    return <span className="font-semibold text-line">{name}</span>;
  }

  return (
    <Link
      to={profilePath(person.username)}
      className="font-semibold text-line hover:text-ball hover:underline"
    >
      {name}
    </Link>
  );
}
