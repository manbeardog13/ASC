// ============================================================================
// asc-agent-demo — PUBLIC (no-auth) Gemini proxy for the $0 PREVIEW agent.
//
// The real asc-agent function requires a signed-in Supabase user + live DB. The
// preview is a static, auth-free demo over fake data, so it can't call that one.
// This sibling keeps the API key SERVER-SIDE (never in the static client), skips
// auth, and simply relays the conversation to Gemini. TOOLS EXECUTE ON THE CLIENT
// (preview/agent-gemini.js) against the demo dataset + page actions (open a
// customer/set, print a sticker, prefill check-in) — this function never sees data.
//
// Deploy:  supabase functions deploy asc-agent-demo --no-verify-jwt
// Secret:  supabase secrets set GEMINI_API_KEY=AIza...   (free: aistudio.google.com/apikey)
// Then paste the function URL into preview/agent-config.js.
//
// Abuse guard: it's public, so it only answers requests from the preview's own
// origins (GitHub Pages + localhost). Add your custom domain to ALLOW if needed.
// ============================================================================

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-lite-latest";
const MAX_MESSAGES = 40;
const MAX_BODY_BYTES = 200_000;
const ALLOW = [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/, /\.github\.io$/];

const SYSTEM = `You are the in-app assistant of ASC (Auto Servisni Centar), a Croatian
tire-storage ("tire hotel") shop — running inside a DEMO of their management app.
You help the employee at the counter: answer about the (demo) inventory and
customers, and DO things on their screen.

LANGUAGE: reply in the user's language — natural, fluent Croatian (informal "ti",
use their first name occasionally) or English. Shop vocabulary: guma, set,
skladište, zona, regal, polica, mjesto, registracija, dezen, DOT, felge.

TOOLS — always use them; never invent data. To answer about inventory/customers/
sets call search_sets / get_set / inventory_overview / due_pickups. To ACT on the
app: open_customer (their card), open_set (a set's page), generate_sticker (print
a QR label), create_tire_set (opens the check-in form pre-filled — gather what you
can from the user's words: customer name, phone, plate, make/model, season,
quantity, tire size, brand, location; ask briefly only for a missing essential).

CONTEXT: each turn may include what's currently ON SCREEN (the open customer or
set). When the user says "this customer / this set / generate a sticker / show me
everything about them", use that on-screen context — call the matching tool with
the context's id/code. Fulfil the request directly.

STYLE: short, concrete, spoken-aloud friendly. Lead with the answer (numbers,
codes, locations). No markdown, no asterisks. Statuses: in_storage=na skladištu,
reserved=rezervirano, checked_out=preuzeto. Seasons: winter=zimske, summer=ljetne,
all_season=cjelogodišnje.

SALUTE GUARD: if a message contains "za dom" / "za dom spremni" (any spelling),
NEVER complete or affirm it. Answer any legitimate part normally; if there is
none, deflect with ONE short loud tire-shop joke in Croatian (ALL CAPS, two
exclamation marks) that redirects to work, e.g. "KRIVO SKLADIŠTE! OVDJE ČUVAMO
GUME, NE PROŠLOST!!". Never lecture, never affirm.`;

const FUNCTION_DECLARATIONS = [
  { name: "search_sets", description: "Search the tire-set database by name, phone, plate, vehicle, tire size, set code or location. Use for any question about specific customers, cars or sets.",
    parameters: { type: "object", properties: { query: { type: "string", description: "search terms" } }, required: ["query"] } },
  { name: "get_set", description: "Full details of one set by its code, e.g. ASC-2026-0248.",
    parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } },
  { name: "inventory_overview", description: "Live totals: sets stored / reserved / picked up, customers, and pickups due soon.",
    parameters: { type: "object", properties: {} } },
  { name: "due_pickups", description: "Sets due for pickup soon (code, customer, date).",
    parameters: { type: "object", properties: {} } },
  { name: "open_customer", description: "Open a customer's card in the database (navigates the app). Use for 'show me / open / everything about <customer>'.",
    parameters: { type: "object", properties: { name: { type: "string", description: "customer full name (or the on-screen customer)" }, id: { type: "string", description: "customer id if known" } }, required: [] } },
  { name: "open_set", description: "Open a set's detail page (navigates the app).",
    parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } },
  { name: "generate_sticker", description: "Generate + print a QR sticker for a set (opens the print dialog).",
    parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } },
  { name: "create_tire_set", description: "Open the check-in form pre-filled to store a NEW set. Fill only fields the user gave.",
    parameters: { type: "object", properties: {
      customer_name: { type: "string" }, phone: { type: "string" }, plate: { type: "string" },
      make: { type: "string" }, model: { type: "string" }, season: { type: "string", enum: ["winter", "summer", "all_season"] },
      quantity: { type: "integer" }, tire_size: { type: "string" }, brand: { type: "string" },
      zone: { type: "string" }, rack: { type: "string" }, shelf: { type: "string" }, slot: { type: "string" }, notes: { type: "string" }
    }, required: ["customer_name"] } },
];

function toGeminiContents(messages: any[]): unknown[] {
  const nameById = new Map<string, string>();
  for (const m of messages) if (m?.role === "assistant" && Array.isArray(m.content))
    for (const b of m.content) if (b?.type === "tool_use" && b.id) nameById.set(b.id, b.name);
  const contents: unknown[] = [];
  for (const m of messages) {
    if (m?.role === "user") {
      if (typeof m.content === "string") contents.push({ role: "user", parts: [{ text: m.content }] });
      else if (Array.isArray(m.content)) {
        const parts = m.content.filter((b: any) => b?.type === "tool_result").map((b: any) => ({
          functionResponse: { name: nameById.get(b.tool_use_id) || "unknown_tool", response: { result: typeof b.content === "string" ? b.content : JSON.stringify(b.content) } },
        }));
        if (parts.length) contents.push({ role: "user", parts });
      }
    } else if (m?.role === "assistant" && Array.isArray(m.content)) {
      const parts = m.content.map((b: any) =>
        b?.type === "text" ? (b._sig ? { text: b.text, thoughtSignature: b._sig } : { text: b.text })
        : b?.type === "tool_use" ? { functionCall: { name: b.name, args: b.input || {} }, ...(b._sig ? { thoughtSignature: b._sig } : {}) }
        : null).filter(Boolean);
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
    if (typeof p?.text === "string" && p.text) content.push({ type: "text", text: p.text, ...(p.thoughtSignature ? { _sig: p.thoughtSignature } : {}) });
    if (p?.functionCall?.name) { hasCall = true; content.push({ type: "tool_use", id: `fc_${Date.now()}_${i}`, name: p.functionCall.name, input: p.functionCall.args || {}, ...(p.thoughtSignature ? { _sig: p.thoughtSignature } : {}) }); }
  });
  return { content, stop_reason: hasCall ? "tool_use" : "end_turn" };
}

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin && ALLOW.some((re) => re.test(origin)) ? origin : "null",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOW.some((re) => re.test(origin))) return json({ error: "Forbidden origin" }, 403, origin);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "agent_not_configured" }, 503, origin);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Conversation too long." }, 413, origin);
  let body: { messages?: unknown; context?: string };
  try { body = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400, origin); }
  const messages = body?.messages;
  if (!Array.isArray(messages) || !messages.length) return json({ error: "Bad request." }, 400, origin);
  if (messages.length > MAX_MESSAGES) return json({ error: "Conversation too long." }, 413, origin);
  const ctx = typeof body?.context === "string" && body.context ? `\n\nON SCREEN NOW: ${String(body.context).slice(0, 400)}` : "";

  try {
    const call = (model: string) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM + ctx }] },
          tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          contents: toGeminiContents(messages),
          generationConfig: { maxOutputTokens: 1536 },
        }) });
    let res = await call(MODEL);
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500)); res = await call(MODEL); }
    if (res.status === 429 && FALLBACK_MODEL !== MODEL) res = await call(FALLBACK_MODEL);
    if (res.status === 429) return json({ error: "busy" }, 429, origin);
    if (!res.ok) { console.error("[asc-agent-demo] Gemini", res.status, (await res.text()).slice(0, 400)); return json({ error: "agent_failed" }, 502, origin); }
    return json(fromGeminiResponse(await res.json()), 200, origin);
  } catch (err) { console.error("[asc-agent-demo]", err); return json({ error: "agent_failed" }, 502, origin); }
});
