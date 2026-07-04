// ============================================================================
// admin-users — privileged user management (Supabase Edge Function).
//
// This is the ONLY place the service-role key is used, and it never leaves the
// server. The static PWA (anon key) can't create/delete auth accounts or send
// invite emails on its own; it calls this function, which:
//   • verifies the caller's JWT and that the caller is an ADMIN (admin|manager),
//   • action "invite" → assigns the role (allowed_emails) and emails an invite,
//   • action "delete" → deletes the auth login + profile (never the owner).
//
// The app works WITHOUT this function (self-signup + access-revoke fallback); it
// only adds real invite emails and full account deletion. Deploy notes: SETUP.md.
//
// Deploy:  supabase functions deploy admin-users --no-verify-jwt
//   (JWT is verified inside this function so the CORS preflight isn't blocked.)
// No secrets to set — SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY are injected.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER_EMAIL = "cryptonii13@gmail.com";           // permanent owner; also DB-enforced
const ADMIN_ROLES = ["admin", "manager"];
const ASSIGNABLE = ["admin", "manager", "employee", "reception"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Not signed in." }, 401);

  // Identify the caller by verifying their JWT against the auth server.
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: uErr } = await asCaller.auth.getUser();
  if (uErr || !user) return json({ error: "Not signed in." }, 401);

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  // Only admins (admin|manager) may manage users.
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !ADMIN_ROLES.includes(me.role)) return json({ error: "Only admins can manage users." }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  // -- Invite: assign the role now, then email an invite ---------------------
  if (body?.action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const full_name = (String(body.full_name ?? "").trim()) || null;
    let role = String(body.role ?? "employee");
    if (!ASSIGNABLE.includes(role)) role = "employee";
    const redirectTo = typeof body.appUrl === "string" ? body.appUrl : undefined;

    if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (email === OWNER_EMAIL) return json({ error: "That is the owner account — it already has full access." }, 400);

    // The signup trigger consumes this row and applies the role at account creation.
    const { error: aeErr } = await admin.from("allowed_emails")
      .upsert({ email, full_name, role, invited_by: user.id }, { onConflict: "email" });
    if (aeErr) return json({ error: aeErr.message }, 400);

    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo });
    if (invErr) {
      // Already has an account → just apply the role to the existing profile.
      if (/registered|already|exists/i.test(invErr.message)) {
        await admin.from("profiles").update({ role, full_name }).eq("email", email);
        await admin.from("allowed_emails").delete().eq("email", email);
        return json({ status: "exists" });
      }
      return json({ error: invErr.message }, 400);
    }
    return json({ status: "invited" });
  }

  // -- Delete: remove the auth login + profile (never the owner) --------------
  if (body?.action === "delete") {
    const userId = String(body.user_id ?? "");
    if (!userId) return json({ error: "Missing user." }, 400);
    if (userId === user.id) return json({ error: "You can't remove yourself." }, 400);

    // Owner check against the auth record itself, not client-supplied data.
    const { data: target } = await admin.auth.admin.getUserById(userId);
    const targetEmail = (target?.user?.email ?? "").toLowerCase();
    if (targetEmail === OWNER_EMAIL) return json({ error: "The owner account can't be removed." }, 403);

    await admin.from("profiles").delete().eq("id", userId);
    if (targetEmail) await admin.from("allowed_emails").delete().eq("email", targetEmail);
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: delErr.message }, 400);
    return json({ status: "deleted" });
  }

  return json({ error: "Unknown action." }, 400);
});
