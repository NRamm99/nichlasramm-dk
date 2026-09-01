import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const push = (webpush as { default?: typeof webpush }).default ?? webpush;

type Payload = {
  recipient_id?: string;
  kind?: string;
  payload?: { href?: string; body?: string };
};

type PushSettings = {
  dispatch_secret: string;
  vapid_public: string;
  vapid_private: string;
  vapid_subject: string;
};

function copy(kind: string | undefined) {
  switch (kind) {
    case "matchmaker_rsvp":
      return "Nyt svar på en find-kamp-annonce.";
    case "matchmaker_removed":
      return "Du blev fjernet fra en find-kamp-annonce.";
    case "matchmaker_closed":
      return "En find-kamp-annonce blev lukket.";
    case "matchmaker_converted":
      return "En find-kamp-annonce blev til en planlagt kamp.";
    case "matchmaker_message":
      return "Ny besked i en find-kamp-tråd.";
    case "partnership_request":
      return "Du har fået en partnerskabsanmodning.";
    case "match_comment":
      return "Ny kommentar på en kamp.";
    case "league_message":
      return "Ny besked i en ligadialog.";
    case "admin_broadcast":
      return "Besked fra klubben.";
    case "direct_message":
      return "Ny privatbesked.";
    default:
      return "Noget nyt i klubben.";
  }
}

function message(kind: string | undefined, payload: Payload["payload"]) {
  const custom = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (custom) return custom.slice(0, 280);
  return copy(kind);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: settingsRows, error: settingsError } = await supabase.rpc(
    "read_push_settings",
  );
  if (settingsError) {
    return new Response(settingsError.message, { status: 500 });
  }
  const settings = (
    Array.isArray(settingsRows) ? settingsRows[0] : settingsRows
  ) as PushSettings | null;
  if (!settings) {
    return new Response("Push is not configured", { status: 500 });
  }

  const header = req.headers.get("Authorization") ?? "";
  if (header !== `Bearer ${settings.dispatch_secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json()) as Payload;
  if (!body.recipient_id) {
    return new Response("Missing recipient", { status: 400 });
  }

  const { data: rows, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("profile_id", body.recipient_id);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  push.setVapidDetails(
    settings.vapid_subject,
    settings.vapid_public,
    settings.vapid_private,
  );

  const href =
    typeof body.payload?.href === "string" ? body.payload.href : "/nyt";
  const payload = JSON.stringify({
    title: "Padel By Ramm",
    body: message(body.kind, body.payload),
    href,
  });

  for (const row of rows ?? []) {
    try {
      await push.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        payload,
      );
    } catch (sendError) {
      const status = (sendError as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", row.endpoint);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: rows?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
