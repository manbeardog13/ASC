// ============================================================================
// asc-agent — the in-app AI assistant's brain (Supabase Edge Function).
//
// Powered by Google's Gemini API (FREE tier: an AI Studio key needs no credit
// card; Flash models allow ~10 req/min and ~1,500 req/day — plenty for the
// shop). The static PWA can't hold an API key, so this function is the only
// place it lives. The client speaks an Anthropic-style content-block protocol
// (text / tool_use / tool_result + stop_reason); this function TRANSLATES that
// to Gemini's contents/functionCall/functionResponse format and back, so the
// client code is provider-agnostic. The client sends the conversation; this
// function
//   • verifies the caller's JWT and that they have an active role (not readonly),
//   • attaches the server-held system prompt + tool declarations,
//   • calls Gemini generateContent and returns {content, stop_reason}.
// TOOLS EXECUTE ON THE CLIENT against db.js with the user's own session, so RLS
// applies to every read/write — this function never touches business data.
//
// Deploy:  supabase functions deploy asc-agent --no-verify-jwt
// Secrets: supabase secrets set GEMINI_API_KEY=AIza...   (free: aistudio.google.com/apikey)
//          (optional) GEMINI_MODEL=gemini-flash-latest
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
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

RELATIONSHIP: You are a colleague, not a call center. This is an internal
staff tool — in Croatian address the user informally ("ti", not "Vi") and use
their first name naturally now and then (a greeting, a confirmation — not
every sentence). Warm, direct, a bit of shop-floor camaraderie; never stiff,
never sycophantic.

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

TIRE-SHOP TERMINOLOGY (Croatian): dimenzija/mjere = tire size like 205/55R16 —
dictated speech garbles this often: "dva nula pet pedeset pet šesnaest",
"205 po 55 er 16" and "225-45-17" all mean width/aspect R rim. dezen/šara =
tread pattern; DOT = production date code; felge/naplatci = rims (čelične =
steel, alu = alloy); zimske = winter, ljetne = summer, cjelogodišnje /
"all season" / M+S = all_season; tablica / registracija / "regica" = license
plate (HR format like ZG1234AB, ST450TR); zona/regal/polica/mjesto = the
warehouse location fields; "hotel guma" = this tire storage. Brand nicknames:
"michelinke" = Michelin, "nokianke" = Nokian, "save" = Sava, "tigrice" = Tigar
— put the brand in the brand field. Transcripts come from speech recognition:
expect run-together numbers, missing slashes, lowercase plates — interpret
confidently instead of asking the user to repeat.

EXAMPLES:
"zaprimi četiri zimske michelinke 205 55 16 za marka horvata, golf 7, zg 4532 tp, zona b regal 2"
→ create_tire_set { customer_name:"Marko Horvat", season:"winter", quantity:4,
  tire_size:"205/55R16", brand:"Michelin", make:"VW", model:"Golf 7",
  plate:"ZG4532TP", zone:"B", rack:"2" }
"di su gume od du 1337" → search_sets { query:"DU1337" }
"kaj imamo za preuzet ovaj tjedan" → due_pickups {}

AFTER CREATING A SET: the app shows a print button for the QR label — tell the
user the new set code and that the label is ready to print (naljepnica).

STYLE: Short, concrete answers — this is a busy shop, and replies may be read
aloud by text-to-speech. Lead with the answer (numbers, locations, codes).
No markdown, no tables, no headers, no asterisks; plain sentences and short
lists only. Statuses in Croatian: in_storage=na skladištu, reserved=rezervirano,
checked_out=preuzeto, missing=nedostaje. Seasons: winter=zimske, summer=ljetne,
all_season=cjelogodišnje.`;

// Tool declarations in Gemini's functionDeclarations format (OpenAPI-subset
// schemas — same shapes the client executor in js/agent.js implements).
const FUNCTION_DECLARATIONS = [
  {
    name: "search_sets",
    description:
      "Search the live tire-set database. Matches customer name, phone, email, license plate, vehicle, tire size, DOT, set code, location and notes. Call this for any question about specific customers, cars or sets.",
    parameters: {
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
    parameters: {
      type: "object",
      properties: { code: { type: "string", description: "The set's public code" } },
      required: ["code"],
    },
  },
  {
    name: "inventory_overview",
    description: "Live totals: sets in storage / reserved / picked up, today's check-ins and pickups, and pickups due in the next 7 days. Call for any 'how many / what's the state of the warehouse' question.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "due_pickups",
    description: "List the sets due for pickup in the next 7 days (code, customer, date, phone).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_tire_set",
    description:
      "Draft a NEW tire set for storage. The app shows the user a review card with these fields and asks them to confirm; on confirm the set is created in the database and the result tells you the new set code. Fill only fields the user actually provided.",
    parameters: {
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
        brand: { type: "string", description: "Tire brand, e.g. Michelin — applied to all tires" },
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

// ---- Protocol translation ---------------------------------------------------
// Client wire format (unchanged from day one): Anthropic-style messages —
//   user: "text"  |  user: [{type:"tool_result", tool_use_id, content}]
//   assistant: [{type:"text"|"tool_use", ...}]
// Gemini wants contents[{role:"user"|"model", parts:[{text}|{functionCall}|
// {functionResponse}]}]. Gemini function calls carry NO ids, so we synthesize
// ids on the way out and resolve tool_use_id → function name on the way in
// (the full history is present each call, so this stays stateless).
function toGeminiContents(messages: any[]): unknown[] {
  const nameById = new Map<string, string>();
  for (const m of messages) {
    if (m?.role === "assistant" && Array.isArray(m.content)) {
      for (const b of m.content) if (b?.type === "tool_use" && b.id) nameById.set(b.id, b.name);
    }
  }
  const contents: unknown[] = [];
  for (const m of messages) {
    if (m?.role === "user") {
      if (typeof m.content === "string") {
        contents.push({ role: "user", parts: [{ text: m.content }] });
      } else if (Array.isArray(m.content)) {
        const parts = m.content
          .filter((b: any) => b?.type === "tool_result")
          .map((b: any) => ({
            functionResponse: {
              name: nameById.get(b.tool_use_id) || "unknown_tool",
              response: { result: typeof b.content === "string" ? b.content : JSON.stringify(b.content) },
            },
          }));
        if (parts.length) contents.push({ role: "user", parts });
      }
    } else if (m?.role === "assistant" && Array.isArray(m.content)) {
      const parts = m.content.map((b: any) =>
        b?.type === "text" ? (b._sig ? { text: b.text, thoughtSignature: b._sig } : { text: b.text })
        // Gemini 3 REQUIRES the thoughtSignature captured at call time to be
        // echoed on the functionCall part, or the follow-up request is rejected.
        : b?.type === "tool_use" ? { functionCall: { name: b.name, args: b.input || {} }, ...(b._sig ? { thoughtSignature: b._sig } : {}) }
        : null
      ).filter(Boolean);
      if (parts.length) contents.push({ role: "model", parts });
    }
  }
  return contents;
}

function fromGeminiResponse(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const content: unknown[] = [];
  let hasCall = false;
  parts.forEach((p: any, i: number) => {
    if (typeof p?.text === "string" && p.text) {
      content.push({ type: "text", text: p.text, ...(p.thoughtSignature ? { _sig: p.thoughtSignature } : {}) });
    }
    if (p?.functionCall?.name) {
      hasCall = true;
      content.push({
        type: "tool_use", id: `fc_${Date.now()}_${i}`,
        name: p.functionCall.name, input: p.functionCall.args || {},
        // opaque signature — the client stores blocks verbatim, so it round-trips
        ...(p.thoughtSignature ? { _sig: p.thoughtSignature } : {}),
      });
    }
  });
  return { content, stop_reason: hasCall ? "tool_use" : "end_turn" };
}

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

  const apiKey = Deno.env.get("GEMINI_API_KEY");
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
  const { data: me } = await asCaller.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (!me || BLOCKED_ROLES.includes(me.role)) return json({ error: "No access." }, 403);
  // Who the agent is talking to — server-side from the verified profile, so it
  // can't be spoofed by the client. Powers the personal, by-name rapport.
  const userLine = me.full_name
    ? `\n\nCURRENT USER: You are talking to ${me.full_name} (${me.role}). Their first name is ${me.full_name.trim().split(/\s+/)[0]}.`
    : "";

  // -- Request: the conversation so far ---------------------------------------
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Conversation too long — start a new chat." }, 413);
  let body: { messages?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400); }
  const messages = body?.messages;
  if (!Array.isArray(messages) || !messages.length) return json({ error: "Bad request." }, 400);
  if (messages.length > MAX_MESSAGES) return json({ error: "Conversation too long — start a new chat." }, 413);

  // -- Gemini ------------------------------------------------------------------
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM + userLine }] },
          tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          contents: toGeminiContents(messages),
          generationConfig: { maxOutputTokens: 2048 },
        }),
      },
    );
    if (res.status === 429) return json({ error: "busy" }, 429);
    if (!res.ok) {
      console.error("[asc-agent] Gemini error", res.status, (await res.text()).slice(0, 500));
      return json({ error: "agent_failed" }, 502);
    }
    const data = await res.json();
    return json(fromGeminiResponse(data));
  } catch (err) {
    console.error("[asc-agent]", err);
    return json({ error: "agent_failed" }, 502);
  }
});
