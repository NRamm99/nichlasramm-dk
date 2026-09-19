import { afterNotificationsRead } from "./appBadge";
import { supabase } from "./supabase";

export const NEWS_TITLE_MAX = 80;
export const NEWS_BODY_MAX = 800;

const CLUB_NEWS_EVENT = "padel:club-news";

export function onClubNewsChanged(listener: () => void) {
  window.addEventListener(CLUB_NEWS_EVENT, listener);
  return () => window.removeEventListener(CLUB_NEWS_EVENT, listener);
}

export function notifyClubNewsChanged() {
  window.dispatchEvent(new Event(CLUB_NEWS_EVENT));
}

export type PendingClubNews = {
  id: string;
  title: string | null;
  body: string;
};

export type ClubNewsPerson = {
  id: string;
  name: string;
};

export type AdminClubNews = {
  id: string;
  title: string | null;
  body: string;
  created_at: string;
  closed_at: string | null;
  open: boolean;
  sent: number;
  shown: number;
  acked: number;
  acked_people: ClubNewsPerson[];
  shown_people: ClubNewsPerson[];
  unseen_people: ClubNewsPerson[];
};

function asPerson(value: unknown): ClubNewsPerson | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  return { id: row.id, name: row.name };
}

function asPeople(value: unknown): ClubNewsPerson[] {
  if (!Array.isArray(value)) return [];
  return value.map(asPerson).filter((row): row is ClubNewsPerson => Boolean(row));
}

function asPending(value: unknown): PendingClubNews | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.body !== "string") return null;
  return {
    id: row.id,
    title: typeof row.title === "string" ? row.title : null,
    body: row.body,
  };
}

function asAdminNews(value: unknown): AdminClubNews | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.body !== "string") return null;
  return {
    id: row.id,
    title: typeof row.title === "string" ? row.title : null,
    body: row.body,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    closed_at: typeof row.closed_at === "string" ? row.closed_at : null,
    open: Boolean(row.open),
    sent: typeof row.sent === "number" ? row.sent : 0,
    shown: typeof row.shown === "number" ? row.shown : 0,
    acked: typeof row.acked === "number" ? row.acked : 0,
    acked_people: asPeople(row.acked_people),
    shown_people: asPeople(row.shown_people),
    unseen_people: asPeople(row.unseen_people),
  };
}

export async function fetchPendingClubNews() {
  const { data, error } = await supabase.rpc("pending_club_news");
  if (error) throw error;
  return asPending(data);
}

export async function markClubNewsShown(newsId: string) {
  const { error } = await supabase.rpc("mark_club_news_shown", {
    p_news_id: newsId,
  });
  if (error) throw error;
}

export async function ackClubNews(newsId: string) {
  const { error } = await supabase.rpc("ack_club_news", {
    p_news_id: newsId,
  });
  if (error) throw error;
  afterNotificationsRead();
}

export async function createClubNews(input: {
  title: string;
  body: string;
  profileIds: string[] | null;
}) {
  const { error } = await supabase.rpc("create_club_news", {
    p_title: input.title,
    p_body: input.body,
    p_profile_ids: input.profileIds,
  });
  if (error) throw error;
  notifyClubNewsChanged();
}

export async function closeClubNews(newsId: string) {
  const { error } = await supabase.rpc("close_club_news", {
    p_news_id: newsId,
  });
  if (error) throw error;
}

export async function fetchAdminClubNews() {
  const { data, error } = await supabase.rpc("admin_club_news");
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map(asAdminNews)
    .filter((row): row is AdminClubNews => Boolean(row));
}

export function newsListTitle(row: Pick<AdminClubNews, "title" | "body">) {
  if (row.title?.trim()) return row.title.trim();
  const body = row.body.trim();
  if (body.length <= 48) return body;
  return `${body.slice(0, 47)}…`;
}
