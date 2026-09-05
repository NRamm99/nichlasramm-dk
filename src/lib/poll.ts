import { supabase } from "./supabase";

export type PollCommentMode = "off" | "optional" | "only";

export type PendingPollOption = {
  id: string;
  label: string;
};

export type PendingPoll = {
  id: string;
  question: string;
  anonymous: boolean;
  ends_at: string;
  comment_mode: PollCommentMode;
  comment_title: string | null;
  options: PendingPollOption[];
};

export type AdminPollOption = PendingPollOption & {
  votes: number;
};

export type AdminPollVoter = {
  id: string;
  name: string;
  declined: boolean;
  option_id: string | null;
  comment: string | null;
};

export type AdminPollComment = {
  name: string | null;
  text: string;
};

export type AdminPoll = {
  id: string;
  question: string;
  anonymous: boolean;
  ends_at: string;
  created_at: string;
  comment_mode: PollCommentMode;
  comment_title: string | null;
  archived_at: string | null;
  open: boolean;
  declined: number;
  answered: number;
  options: AdminPollOption[];
  comments: AdminPollComment[];
  voters: AdminPollVoter[] | null;
};

function asCommentMode(value: unknown): PollCommentMode {
  if (value === "optional" || value === "only") return value;
  return "off";
}

function asPendingPoll(value: unknown): PendingPoll | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.question !== "string") return null;
  const options = Array.isArray(row.options)
    ? row.options.filter(
        (option): option is PendingPollOption =>
          Boolean(
            option &&
              typeof option === "object" &&
              typeof (option as PendingPollOption).id === "string" &&
              typeof (option as PendingPollOption).label === "string",
          ),
      )
    : [];
  return {
    id: row.id,
    question: row.question,
    anonymous: Boolean(row.anonymous),
    ends_at: typeof row.ends_at === "string" ? row.ends_at : "",
    comment_mode: asCommentMode(row.comment_mode),
    comment_title:
      typeof row.comment_title === "string" ? row.comment_title : null,
    options,
  };
}

export async function fetchPendingPoll() {
  const { data, error } = await supabase.rpc("pending_poll");
  if (error) throw error;
  return asPendingPoll(data);
}

export async function votePoll(
  pollId: string,
  optionId: string | null,
  comment?: string,
) {
  const { error } = await supabase.rpc("vote_poll", {
    p_poll_id: pollId,
    p_option_id: optionId,
    p_comment: comment?.trim() || null,
  });
  if (error) throw error;
}

export async function declinePoll(pollId: string) {
  const { error } = await supabase.rpc("decline_poll", {
    p_poll_id: pollId,
  });
  if (error) throw error;
}

export async function createPoll(input: {
  question: string;
  anonymous: boolean;
  endsAt: string;
  options: string[];
  commentMode: PollCommentMode;
  commentTitle: string;
}) {
  const { error } = await supabase.rpc("create_poll", {
    p_question: input.question,
    p_anonymous: input.anonymous,
    p_ends_at: input.endsAt,
    p_options: input.commentMode === "only" ? [] : input.options,
    p_comment_mode: input.commentMode,
    p_comment_title: input.commentTitle,
  });
  if (error) throw error;
}

export async function closePoll(pollId: string) {
  const { error } = await supabase.rpc("close_poll", {
    p_poll_id: pollId,
  });
  if (error) throw error;
}

export async function archivePoll(pollId: string) {
  const { error } = await supabase.rpc("archive_poll", {
    p_poll_id: pollId,
  });
  if (error) throw error;
}

export async function unarchivePoll(pollId: string) {
  const { error } = await supabase.rpc("unarchive_poll", {
    p_poll_id: pollId,
  });
  if (error) throw error;
}

export async function deletePoll(pollId: string) {
  const { error } = await supabase.rpc("delete_poll", {
    p_poll_id: pollId,
  });
  if (error) throw error;
}

export async function fetchAdminPolls() {
  const { data, error } = await supabase.rpc("list_admin_polls");
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as AdminPoll[];
}

export function formatPollEnds(iso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function commentModeLabel(mode: PollCommentMode | string | null) {
  if (mode === "optional") return "Valgfri kommentar";
  if (mode === "only") return "Kun kommentar";
  return "Uden kommentar";
}
