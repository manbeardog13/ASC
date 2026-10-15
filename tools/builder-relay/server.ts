// Builder relay for "Send to Toni & Nero".
// Bind is loopback only. Publish it with `tailscale serve` on NERO-SERVER.
// Do not listen on every interface and do not expose this process on the public internet.
//
// Env (never commit these):
//   SUPABASE_URL, SUPABASE_ANON_KEY
//   BUILDER_WEBHOOK_URL or BUILDER_WEBHOOK_FILE (mode 600, outside the repo)
//   BUILDER_RELAY_LOG  optional file for JSON lines; otherwise stdout
//   BUILDER_RELAY_PORT optional, default 8787
//
// Logs stay on the machine. There is no builder_relay_log table.

const BIND = "127.0.0.1";
const asked = Deno.env.get("BUILDER_RELAY_BIND") || BIND;
if (asked !== BIND) {
  console.error("builder-relay refuses to bind anything except 127.0.0.1");
  Deno.exit(1);
}

const PORT = Number(Deno.env.get("BUILDER_RELAY_PORT") || 8787);
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const WINDOW_MS = 5 * 60 * 1000;
const MAX_HITS = 30;
const hits = new Map<string, number[]>();

function cors(req: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

function b64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;

async function loadJwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) return [];
  const body = await res.json();
  const keys = Array.isArray(body.keys) ? body.keys as Jwk[] : [];
  jwksCache = { at: Date.now(), keys };
  return keys;
}

async function verifyJwt(token: string): Promise<{ id: string; email?: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  let payload: { sub?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  } catch {
    return null;
  }
  if (header.alg === "ES256" || header.alg === "RS256") {
    const keys = await loadJwks();
    const jwk = keys.find((k) => k.kid && k.kid === header.kid) || keys[0];
    if (jwk) {
      const alg = header.alg === "ES256"
        ? { name: "ECDSA", hash: "SHA-256" }
        : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      try {
        const key = await crypto.subtle.importKey("jwk", jwk, alg, false, ["verify"]);
        const ok = await crypto.subtle.verify(
          alg,
          key,
          b64url(parts[2]),
          new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
        );
        if (!ok) return null;
      } catch {
        return null;
      }
    }
  }
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  if (payload.sub && payload.sub !== user.id) return null;
  return { id: String(user.id), email: user.email ? String(user.email) : "" };
}

async function isAdmin(token: string, userId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    {
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) return false;
  const rows = await res.json();
  const role = Array.isArray(rows) ? rows[0]?.role : "";
  return role === "admin" || role === "manager";
}

function allow(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

async function webhookUrl(): Promise<string> {
  const direct = (Deno.env.get("BUILDER_WEBHOOK_URL") || "").trim();
  if (direct) return direct;
  const file = (Deno.env.get("BUILDER_WEBHOOK_FILE") || "").trim();
  if (!file) return "";
  return (await Deno.readTextFile(file)).trim();
}

const SECRET_KEY = /token|authorization|credential|secret|password|apikey|bearer/i;

function publicMessage(body: any, user: { id: string; email?: string }) {
  const attachments = Array.isArray(body?.attachments)
    ? body.attachments.slice(0, 4).map((a: any) => ({
      path: String(a?.path || "").slice(0, 300),
      mime: String(a?.mime || "").slice(0, 80),
      name: String(a?.name || "").slice(0, 180),
    })).filter((a: { path: string }) => a.path)
    : [];
  return {
    id: String(body?.id || "").slice(0, 80),
    text: String(body?.text || "").slice(0, 4000),
    page: String(body?.page || "").slice(0, 200),
    timestamp: Number(body?.timestamp || body?.ts) || Date.now(),
    attachments,
    from: { id: user.id, email: user.email || "" },
  };
}

async function logLine(entry: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n";
  const path = Deno.env.get("BUILDER_RELAY_LOG");
  if (path) await Deno.writeTextFile(path, line, { append: true });
  else console.log(line.trim());
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !ANON) return json(req, { error: "relay_not_configured" }, 503);

  const header = req.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return json(req, { error: "Not signed in." }, 401);

  const user = await verifyJwt(token);
  if (!user) return json(req, { error: "Not signed in." }, 401);
  if (!(await isAdmin(token, user.id))) return json(req, { error: "No access." }, 403);
  if (!allow(user.id)) return json(req, { error: "Slow down." }, 429);

  let body: any;
  try { body = await req.json(); }
  catch { return json(req, { error: "Bad request." }, 400); }
  if (body && typeof body === "object") {
    for (const key of Object.keys(body)) {
      if (SECRET_KEY.test(key)) return json(req, { error: "Bad request." }, 400);
    }
  }
  const message = publicMessage(body, user);
  if (!message.id || !message.text) return json(req, { error: "Bad request." }, 400);

  const hook = await webhookUrl();
  if (!hook) return json(req, { error: "relay_not_configured" }, 503);
  const forwarded = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  await logLine({
    user: user.id,
    id: message.id,
    page: message.page,
    status: forwarded.status,
  });
  if (!forwarded.ok) return json(req, { error: "webhook_failed" }, 502);
  return json(req, { ok: true, id: message.id });
}

Deno.serve({ hostname: BIND, port: PORT }, handler);
