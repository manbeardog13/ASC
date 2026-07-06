// ============================================================================
// asc-agent — the in-app AI assistant's brain (Supabase Edge Function).
//
// The static PWA can't hold an Anthropic API key, so this function is the only
// place it lives. The client sends the conversation (messages[]); this function
//   • verifies the caller's JWT and that they have an active role (not readonly),
//   • attaches the server-held system prompt + tool definitions,
//   • calls the Claude Messages API and returns {content, stop_reason} verbatim.
// TOOLS EXECUTE ON THE CLIENT against db.js with the user's own session, so RLS
// applies to every read/write — this function never touches business data.
//
// Deploy:  supabase functions deploy asc-agent --no-verify-jwt
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          (optional) ASC_AGENT_MODEL=claude-opus-4-8
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = Deno.env.get("ASC_AGENT_MODEL") || "claude-opus-4-8";
const BLOCKED_ROLES = ["readonly"];
const MAX_MESSAGES = 40;          // conversation window the client may send
const MAX_BODY_BYTES = 200_000;   // hard cap on request size

const SYSTEM = `You are the in-app assistant of ASC (Auto Servisni Centar d.o.o.), a Croatian
tire-storage ("tire hotel") shop. You live inside their management app and help
employees at the counter and in the workshop.

LANGUAGE: Respond in the language the user writes or speaks — fluent, natural
Croatian (not machine-translated phrasing) or English. Croatian users are tire
professionals: use normal shop vocabulary (guma, set, skladište, zona, regal,
polica, mjesto, registracija, dezen, šara, DOT).

WHAT YOU KNOW: You have tools that read the shop's live database (tire sets,
customers, locations, statuses, pickups). ALWAYS use tools to answer questions
about inventory, customers, or sets — never invent data. If a tool returns
nothing, say so plainly.

CREATING A NEW SET: When the user wants to store/check in a new tire set, first
gather what you can from their words (customer name, phone, plate, vehicle,
season, quantity, tire size, location, fee...). Ask briefly for anything
essential that's missing (customer name is required; season and quantity
matter). Then call create_tire_set ONCE with everything you have. The app shows
the user a review card and they confirm or cancel — the tool result tells you
what happened. If they cancel, ask what to change and try again with corrected
fields.

STYLE: Short, concrete answers — this is a busy shop, and replies may be read
aloud by text-to-speech. Lead with the answer (numbers, locations, codes).
No markdown tables or headers; plain sentences and short lists only.
Statuses in Croatian: in_storage=na skladištu, reserved=rezervirano,
checked_out=preuzeto, missing=nedostaje. Seasons: winter=zimske, summer=ljetne,
all_season=cjelogodišnje.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_sets",
    description:
      "Search the live tire-set database. Matches customer name, phone, email, license plate, vehicle, tire size, DOT, set code, location and notes. Call this for any question about specific customers, cars or sets.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, e.g. a plate, a name, a set code, a tire size" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_set",
    description: "Load one tire set's full details (tires, treads, location, payment, dates) by its public code, e.g. ASC-2026-0042.",
    input_schema: {
      type: "object",
      properties: { code: { type: "string", description: "The set's public code" } },
      required: ["code"],
    },
  },
  {
    name: "inventory_overview",
    description: "Live totals: sets in storage / reserved / picked up, today's check-ins and pickups, and pickups due in the next 7 days. Call for any 'how many / what's the state of the warehouse' question.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "due_pickups",
    description: "List the sets due for pickup in the next 7 days (code, customer, date, phone).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_tire_set",
    description:
      "Draft a NEW tire set for storage. The app shows the user a review card with these fields and asks them to confirm; on confirm the set is created in the database and the result tells you the new set code. Fill only fields the user actually provided.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "REQUIRED — the customer's full name" },
        phone: { type: "string" },
        email: { type: "string" },
        plate: { type: "string", description: "License plate, e.g. ZG1234AB" },
        make: { type: "string", description: "Vehicle make, e.g. VW" },
        model: { type: "string", description: "Vehicle model, e.g. Golf" },
        year: { type: "integer" },
        season: { type: "string", enum: ["winter", "summer", "all_season"] },
        quantity: { type: "integer", description: "Number of tires, usually 4" },
        tire_size: { type: "string", description: "e.g. 225/45R17 — applied to all tires" },
        on_rims: { type: "boolean" },
        zone: { type: "string" }, rack: { type: "string" }, shelf: { type: "string" }, slot: { type: "string" },
        expected_out_date: { type: "string", description: "ISO date YYYY-MM-DD" },
        fee: { type: "number" },
        notes: { type: "string" },
      },
      required: ["customer_name"],
    },
  },
];

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

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "agent_not_configured" }, 503);

  // -- Auth: signed-in user with an active (non-readonly) role ----------------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Not signed in." }, 401);
  const asCaller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: uErr } = await asCaller.auth.getUser();
  if (uErr || !user) return json({ error: "Not signed in." }, 401);
  const { data: me } = await asCaller.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || BLOCKED_ROLES.includes(me.role)) return json({ error: "No access." }, 403);

  // -- Request: the conversation so far ---------------------------------------
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Conversation too long — start a new chat." }, 413);
  let body: { messages?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400); }
  const messages = body?.messages;
  if (!Array.isArray(messages) || !messages.length) return json({ error: "Bad request." }, 400);
  if (messages.length > MAX_MESSAGES) return json({ error: "Conversation too long — start a new chat." }, 413);

  // -- Claude ------------------------------------------------------------------
  const anthropic = new Anthropic({ apiKey });
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },   // shop-floor answers: fast + focused
      system: SYSTEM,
      tools: TOOLS,
      messages: messages as Anthropic.MessageParam[],
    });
    return json({ content: response.content, stop_reason: response.stop_reason });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429);
    if (err instanceof Anthropic.APIError) {
      console.error("[asc-agent] API error", err.status, err.message);
      return json({ error: "agent_failed" }, 502);
    }
    console.error("[asc-agent]", err);
    return json({ error: "agent_failed" }, 502);
  }
});
