import { supabase } from "./supabase";

export type PartnerPreview = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export type PublicProfile = PartnerPreview & {
  bio: string | null;
  partner_id: string | null;
  partner: PartnerPreview | null;
  seeking_partner?: boolean;
  seeking_note?: string | null;
};

export type PartnershipRequest = {
  id: string;
  requester_id: string;
  recipient_id: string;
  created_at: string;
  requester: PartnerPreview | null;
  recipient: PartnerPreview | null;
};

export const PROFILE_SELECT =
  "id, username, first_name, last_name, avatar_url, bio, partner_id, seeking_partner, seeking_note";

export const REQUEST_SELECT =
  "id, requester_id, recipient_id, created_at";

export function fullName(person: {
  first_name: string | null;
  last_name: string | null;
  username?: string | null;
}) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  if (name) return name;
  if (person.username) return `@${person.username}`;
  return "Ukendt";
}

export function shortDisplayName(person: {
  first_name: string | null;
  last_name: string | null;
  username?: string | null;
}) {
  const first = person.first_name?.trim();
  const last = person.last_name?.trim();
  if (first && last) return `${first[0].toUpperCase()}. ${last}`;
  return fullName(person);
}

export function profilePath(username: string | null | undefined) {
  if (!username) return "/profil";
  return `/profil/${encodeURIComponent(username)}`;
}

export function profileMatchesPath(username: string | null | undefined) {
  if (!username) return "/kampe";
  return `${profilePath(username)}/kampe`;
}

export async function fetchMembersByIds(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const byId = new Map<string, PartnerPreview>();
  if (unique.length === 0) return byId;

  const { data } = await supabase
    .from("profiles")
    .select("id, username, first_name, last_name, avatar_url")
    .in("id", unique);

  for (const row of data ?? []) {
    byId.set(row.id, row);
  }
  return byId;
}

export function attachPartner(
  profile: Omit<PublicProfile, "partner"> & { partner?: PartnerPreview | null },
  people: Map<string, PartnerPreview>,
): PublicProfile {
  return {
    ...profile,
    partner: profile.partner_id ? (people.get(profile.partner_id) ?? null) : null,
  };
}

export function attachRequestPeople(
  request: Omit<PartnershipRequest, "requester" | "recipient">,
  people: Map<string, PartnerPreview>,
): PartnershipRequest {
  return {
    ...request,
    requester: people.get(request.requester_id) ?? null,
    recipient: people.get(request.recipient_id) ?? null,
  };
}
