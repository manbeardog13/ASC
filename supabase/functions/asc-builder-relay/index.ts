// ============================================================================
// asc-builder-relay — admin forward to Toni's builder assistant.
//
// The browser never sees the webhook. Deploy is intentionally not run from
// the app repo workflow:
//   supabase functions deploy asc-builder-relay --no-verify-jwt
//   supabase secrets set BUILDER_WEBHOOK_URL=... BUILDER_WEBHOOK_KEY=...
// JWT verification is in this file (getUser + asc_is_admin) so CORS preflight
// is not blocked by the gateway. Do not deploy or set those secrets here.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_HITS = 30;
const PATH_OK = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,180}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const hook = (Deno.env.get("BUILDER_WEBHOOK_URL") || "").trim();
  const key = (Deno.env.get("BUILDER_WEBHOOK_KEY") || "").trim();
  if (!supabaseUrl || !anon || !hook || !key) return json({ error: "relay_not_configured" }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Not signed in." }, 401);
  const asCaller = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: uErr } = await asCaller.auth.getUser();
  if (uErr || !user) return json({ error: "Not signed in." }, 401);

  const { data: allowed, error: adminErr } = await asCaller.rpc("asc_is_admin");
  if (adminErr || allowed !== true) return json({ error: "No access." }, 403);

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error: countErr } = await asCaller
    .from("builder_relay_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (countErr) return json({ error: "relay_not_configured" }, 503);
  if ((count || 0) >= MAX_HITS) return json({ error: "Slow down." }, 429);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const text = String(body?.text || "").trim().slice(0, 4000);
  if (!text) return json({ error: "Bad request." }, 400);
  const pageUrl = String(body?.pageUrl || body?.page || "").slice(0, 500);
  const appVersion = String(body?.appVersion || "").slice(0, 80);

  const { data: me } = await asCaller.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const userName = String(
    me?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || "",
  ).trim().slice(0, 120);

  const attachments = Array.isArray(body?.attachments) ? body.attachments.slice(0, 4) : [];
  const links: { name: string; mime: string; url: string }[] = [];
  for (const item of attachments) {
    const path = String(item?.path || "");
    if (!PATH_OK.test(path) || path.split("/")[0] !== user.id) continue;
    const signed = await asCaller.storage.from("nero-attachments").createSignedUrl(path, 3600);
    if (!signed.data?.signedUrl) continue;
    links.push({
      name: String(item?.name || "").slice(0, 180),
      mime: String(item?.mime || "").slice(0, 80),
      url: signed.data.signedUrl,
    });
  }

  const forwarded = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      text,
      userName,
      pageUrl,
      appVersion,
      attachments: links,
    }),
  });

  const { error: logErr } = await asCaller.from("builder_relay_log").insert({
    user_id: user.id,
    user_name: userName,
    page_url: pageUrl,
    app_version: appVersion,
    body: text,
    attachment_count: links.length,
    status: forwarded.status,
  });
  if (logErr) console.error("[asc-builder-relay] log", logErr.message);
  if (!forwarded.ok) return json({ error: "webhook_failed" }, 502);
  return json({ ok: true });
});
