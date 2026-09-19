import { afterNotificationsRead } from "./appBadge";
import { supabase } from "./supabase";

export type DirectInboxRow = {
  thread_id: string;
  other_id: string;
  last_message_at: string;
  last_body: string | null;
  unread: boolean;
};

export type DirectMessage = {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type DirectThread = {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
};

export function messagePath(username: string | null | undefined) {
  if (!username) return "/beskeder";
  return `/beskeder/til/${encodeURIComponent(username)}`;
}

export function threadPath(threadId: string) {
  return `/beskeder/${threadId}`;
}

export function otherParticipantId(thread: DirectThread, userId: string) {
  return thread.user_a === userId ? thread.user_b : thread.user_a;
}

const UNREAD_MESSAGES_EVENT = "padel:unread-messages";

export function onUnreadMessagesChanged(listener: () => void) {
  window.addEventListener(UNREAD_MESSAGES_EVENT, listener);
  return () => window.removeEventListener(UNREAD_MESSAGES_EVENT, listener);
}

function notifyUnreadMessagesChanged() {
  window.dispatchEvent(new Event(UNREAD_MESSAGES_EVENT));
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function formatInboxWhen(iso: string) {
  const date = new Date(iso);
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (dayDiff === 0) {
    return new Intl.DateTimeFormat("da-DK", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  if (dayDiff === 1) return "I går";
  if (dayDiff < 7) {
    return new Intl.DateTimeFormat("da-DK", { weekday: "short" }).format(date);
  }
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function sameCalendarDay(a: string, b: string) {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatMessageDay(iso: string) {
  const date = new Date(iso);
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (dayDiff === 0) return "I dag";
  if (dayDiff === 1) return "I går";
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatMessageTime(iso: string) {
  return new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export async function openDirectThread(userId: string) {
  const { data, error } = await supabase.rpc("open_direct_thread", {
    p_user_id: userId,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("THREAD_NOT_FOUND");
  }
  return data;
}

export async function fetchDirectInbox() {
  const { data, error } = await supabase.rpc("list_direct_inbox");
  if (error) throw error;
  return (data ?? []) as DirectInboxRow[];
}

export async function fetchUnreadDirectCount() {
  const { data, error } = await supabase.rpc("unread_direct_count");
  if (error) throw error;
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function fetchDirectThread(threadId: string) {
  const { data, error } = await supabase
    .from("direct_threads")
    .select("id, user_a, user_b, last_message_at")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as DirectThread | null;
}

export async function fetchDirectMessages(threadId: string) {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("id, thread_id, author_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as DirectMessage[];
}

export async function sendDirectMessage(threadId: string, body: string) {
  const { error } = await supabase.rpc("send_direct_message", {
    p_thread_id: threadId,
    p_body: body,
  });
  if (error) throw error;
}

export async function markDirectThreadRead(threadId: string) {
  const { error } = await supabase.rpc("mark_direct_thread_read", {
    p_thread_id: threadId,
  });
  if (error) throw error;
  notifyUnreadMessagesChanged();
  afterNotificationsRead();
}
