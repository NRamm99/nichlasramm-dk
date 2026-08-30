export type MemberProfile = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  banned_at: string | null;
  is_admin: boolean;
};

export type InviteCode = {
  id: string;
  code: string;
  created_at: string;
  created_by: string | null;
  used_at: string | null;
  used_by: string | null;
  member_username: string | null;
  member_first_name: string | null;
  member_last_name: string | null;
  member_avatar_url: string | null;
  banned_at: string | null;
  archived_at: string | null;
  member: MemberProfile | null;
};
