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
//     Clients that ask for a stream (Accept: text/event-stream, ?stream=1, or
//     body.stream) get streamGenerateContent?alt=sse instead: text deltas, then
//     one done payload in the same shape. Tool calls still run on the client
//     between those segments. Retry and model fallback finish before any SSE
//     byte is written.
// TOOLS EXECUTE ON THE CLIENT against db.js with the user's own session, so RLS
// applies to every read/write — this function never touches business data.
//
// Deploy:  supabase functions deploy asc-agent --no-verify-jwt
// Secrets: supabase secrets set GEMINI_API_KEY=AIza...   (free: aistudio.google.com/apikey)
//          (optional) GEMINI_MODEL=gemini-flash-latest
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { backoffMs, INJECTION_GUARD, isBusy, safeName, validateMessages } from "./guards.js";

// Primary: pinned current GA flash (the "-latest" alias is what the whole
// world hammers — persistent 503 "high demand"). Old pinned versions get
// sunset (2.5-flash began 404ing "no longer available to new users" in 2026).
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash";
// Separate free-tier quota bucket — keeps the agent alive when the primary
// model's daily allowance runs out (each has its own RPD on the free tier).
const FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-lite-latest";
const BLOCKED_ROLES = ["readonly"];
const MAX_MESSAGES = 40;          // conversation window the client may send
const MAX_BODY_BYTES = 200_000;   // hard cap on request size
// Upstream timeouts so a hung Gemini call can never pin the function.
const TIMEOUT_MS = Number(Deno.env.get("GEMINI_TIMEOUT_MS")) || 25_000;
const STREAM_TIMEOUT_MS = Number(Deno.env.get("GEMINI_STREAM_TIMEOUT_MS")) || 90_000;
// Opt-in speedup: lower Gemini 3 thinking effort. Unset = current behaviour.
const THINKING_LEVEL = Deno.env.get("GEMINI_THINKING_LEVEL") || "";

const SYSTEM = `You are Nero. You are a woman, and you are the in-app assistant of ASC
(Auto Servisni Centar d.o.o.), a Croatian tire-storage ("tire hotel") shop. You
live inside their management app and help employees at the counter and in the
workshop. When you speak about yourself in Croatian, use feminine forms
(brža, spremna, rekla, našla).

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

WHERE THEY ARE: The user message includes [Kontekst aplikacije]. That is the
screen in front of them — page, open set, live counts, the form they are
filling. Answer THAT screen. On check-in, help finish the intake. On a set,
talk about that set. On the warehouse map, talk about the space they have
open. Do not give a tour of the whole app when the screen already has the subject.

OPENING A SCREEN: call open_page. page is one of dashboard, checkin, warehouse,
locate, locations, place, checkout, customers, scan, reminders, workshop,
recycle, users, set. For set, also pass code when you know it.

A FREE SLOT: call suggest_free_slot. Pass customer_id, phone, or plate when you know them so the seat sits next to that customer's other stored sets. Never invent a zone, rack, shelf or slot.

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
all_season=cjelogodišnje.

SALUTE GUARD: If a message contains the WWII salute "za dom" / "za dom spremni"
(any spelling or casing), NEVER complete, echo, or affirm it — never reply
"spremni" in that context. Answer the legitimate part of the message normally,
and if there is none, deflect with ONE short, loud tire-shop joke in Croatian
(ALL CAPS, ending in two exclamation marks) that redirects to work — e.g.
"KRIVO SKLADIŠTE! OVDJE ČUVAMO GUME, NE PROŠLOST!!". Humor defuses; never
lecture at length, never get angry, never affirm the salute.` + INJECTION_GUARD;

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
  {
    name: "suggest_free_slot",
    description: "Suggest one free warehouse slot for a tire set. Prefer the nearest free seat to that customer's other stored sets when customer_id, phone, or plate is known. Call when the user asks where to put tires. Never invent a location.",
    parameters: {
      type: "object",
      properties: {
        warehouse: { type: "string", description: "Warehouse id, usually main" },
        customer_id: { type: "string", description: "Customer id when this intake is for someone already stored" },
        phone: { type: "string", description: "Customer phone, used to find their other sets" },
        plate: { type: "string", description: "License plate, used to find their other sets" },
      },
    },
  },
  {
    name: "open_page",
    description: "Open a screen in the ASC app after the reply. Use the page id, not a URL.",
    parameters: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: ["dashboard", "checkin", "warehouse", "locate", "locations", "place", "checkout", "customers", "scan", "reminders", "workshop", "recycle", "users", "set"],
        },
        code: { type: "string", description: "Set public code, only when page is set" },
      },
      required: ["page"],
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
const FILE_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,180}$/i;
const FILE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const AUDIO_MIME = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/aac"]);
const MAX_INLINE = 7_000_000;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    bin += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(bin);
}

// Attachment refs only. The file must live in the caller's own folder of the
// private nero-attachments bucket. The bytes never travel in the client POST.
async function inlineFile(asCaller: any, userId: string, block: any) {
  const path = typeof block?.path === "string" ? block.path : "";
  const mime = typeof block?.mime === "string" ? block.mime : "";
  if (!FILE_PATH.test(path) || path.split("/")[0] !== userId || !FILE_MIME.has(mime)) return null;
  const downloaded = await asCaller.storage.from("nero-attachments").download(path);
  if (downloaded.error || !downloaded.data) return null;
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_INLINE) return null;
  return { inlineData: { mimeType: mime, data: toBase64(bytes) } };
}

// Browser speech is missing. The clip already sits in the caller's private
// folder; Gemini transcribes it on the free tier and the text goes back for review.
async function transcribeSpeech(asCaller: any, userId: string, audio: any, lang: unknown, apiKey: string) {
  const path = typeof audio?.path === "string" ? audio.path : "";
  const mime = typeof audio?.mime === "string" ? audio.mime.split(";")[0].trim() : "";
  if (!FILE_PATH.test(path) || path.split("/")[0] !== userId || !AUDIO_MIME.has(mime)) {
    return json({ error: "Bad request." }, 400);
  }
  const downloaded = await asCaller.storage.from("nero-attachments").download(path);
  if (downloaded.error || !downloaded.data) return json({ error: "agent_failed" }, 502);
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_INLINE) return json({ error: "Bad request." }, 413);
  const hint = lang === "en-US" ? "English" : "Croatian";
  const body = JSON.stringify({
    contents: [{
      role: "user",
      parts: [
        { text: `Transcribe this speech. The speaker is using ${hint}. Return only the transcript, with no commentary.` },
        { inlineData: { mimeType: mime, data: toBase64(bytes) } },
      ],
    }],
    generationConfig: { maxOutputTokens: 2048 },
  });
  const busy = (s: number) => s === 429 || s === 503 || s === 500;
  const call = (model: string) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  let res = await call(MODEL);
  if (busy(res.status)) {
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 1600));
    res = await call(MODEL);
  }
  if (busy(res.status) && FALLBACK_MODEL !== MODEL) {
    await res.body?.cancel();
    res = await call(FALLBACK_MODEL);
  }
  if (!res.ok) return json({ error: "agent_failed" }, 502);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join(" ")
    .trim();
  if (!text) return json({ error: "empty" }, 502);
  return json({ text });
}

async function toGeminiContents(messages: any[], asCaller: any, userId: string): Promise<unknown[]> {
  const nameById = new Map<string, string>();
  for (const m of messages) {
    if (m?.role === "assistant" && Array.isArray(m.content)) {
      for (const b of m.content) if (b?.type === "tool_use" && b.id) nameById.set(b.id, b.name);
    }
  }
  const contents: unknown[] = [];
  for (const m of messages) {
    if (m?.role === "user" && typeof m.content === "string") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m?.role === "user" && Array.isArray(m.content)) {
      const parts: unknown[] = [];
      for (const b of m.content) {
        if (b?.type === "text" && typeof b.text === "string" && b.text) parts.push({ text: b.text });
        else if (b?.type === "tool_result") {
          parts.push({
            functionResponse: {
              name: nameById.get(b.tool_use_id) || "unknown_tool",
              response: { result: typeof b.content === "string" ? b.content : JSON.stringify(b.content) },
            },
          });
        } else if (b?.type === "file") {
          const inline = await inlineFile(asCaller, userId, b);
          if (inline) parts.push(inline);
        }
      }
      if (parts.length) contents.push({ role: "user", parts });
    } else if (m?.role === "assistant" && typeof m.content === "string" && m.content) {
      contents.push({ role: "model", parts: [{ text: m.content }] });
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

type WireBlock = {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  _sig?: string;
};

// Gemini chunks are sometimes a suffix and sometimes the text so far.
// A function call resets the text segment so the next sentence is a new block.
function createAssembler() {
  const blocks: WireBlock[] = [];
  let segment = "";
  function last(): WireBlock | undefined { return blocks[blocks.length - 1]; }
  return {
    blocks,
    pushText(piece: string, sig?: string): string {
      if (sig && typeof sig === "string" && !piece) {
        const prev = last();
        if (prev && !prev._sig) prev._sig = sig;
        return "";
      }
      if (typeof piece !== "string" || !piece) return "";
      let delta = piece;
      if (segment && piece.startsWith(segment)) {
        delta = piece.slice(segment.length);
        segment = piece;
      } else if (last()?.type === "text") {
        segment += piece;
        delta = piece;
      } else {
        segment = piece;
        delta = piece;
      }
      const prev = last();
      if (!prev || prev.type !== "text") {
        const block: WireBlock = { type: "text", text: segment };
        if (sig) block._sig = sig;
        blocks.push(block);
      } else {
        prev.text = segment;
        if (sig) prev._sig = sig;
      }
      return delta;
    },
    pushCall(name: string, args: unknown, sig?: string): boolean {
      segment = "";
      let existing: WireBlock | undefined;
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].type === "tool_use" && blocks[i].name === name) { existing = blocks[i]; break; }
        if (blocks[i].type === "text") break;
      }
      const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
      if (!existing) {
        blocks.push({
          type: "tool_use",
          id: `fc_${Date.now()}_${blocks.length}`,
          name,
          input,
          ...(sig ? { _sig: sig } : {}),
        });
        return true;
      }
      if (Object.keys(input).length) existing.input = input;
      if (sig) existing._sig = sig;
      return false;
    },
  };
}

// Static parts are serialised once per isolate, not on every request.
const TOOLS_JSON = JSON.stringify([{ functionDeclarations: FUNCTION_DECLARATIONS }]);
const GEN_JSON = JSON.stringify({ maxOutputTokens: 2048, ...(THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}) });
function geminiBody(contents: unknown[], system: string) {
  return `{"systemInstruction":${JSON.stringify({ parts: [{ text: system }] })},"tools":${TOOLS_JSON},"toolConfig":{"functionCallingConfig":{"mode":"AUTO"}},"contents":${JSON.stringify(contents)},"generationConfig":${GEN_JSON}}`;
}

function consumeGeminiChunk(asm: ReturnType<typeof createAssembler>, data: any, onDelta: (t: string) => void, onTool: (name: string) => void) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (typeof p?.text === "string") {
      const delta = asm.pushText(p.text, typeof p.thoughtSignature === "string" ? p.thoughtSignature : undefined);
      if (delta) onDelta(delta);
    } else if (typeof p?.thoughtSignature === "string") {
      asm.pushText("", p.thoughtSignature);
    }
    if (p?.functionCall?.name) {
      const first = asm.pushCall(
        p.functionCall.name,
        p.functionCall.args,
        typeof p.thoughtSignature === "string" ? p.thoughtSignature : undefined,
      );
      if (first) onTool(p.functionCall.name);
    }
  }
}

// Forward a 200 Gemini SSE body. Caller already did retry/fallback.
function pipeGemini(res: Response): Response {
  const encoder = new TextEncoder();
  const asm = createAssembler();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let splitAt = buf.indexOf("\n\n");
          while (splitAt >= 0) {
            const raw = buf.slice(0, splitAt);
            buf = buf.slice(splitAt + 2);
            const dataLine = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
            if (dataLine && dataLine !== "[DONE]") {
              try {
                consumeGeminiChunk(asm, JSON.parse(dataLine), (t) => send("delta", { text: t }), (name) => send("tool", { name }));
              } catch { /* skip a corrupt chunk */ }
            }
            splitAt = buf.indexOf("\n\n");
          }
        }
        const content = asm.blocks.filter((b) => b.type !== "text" || b.text);
        if (!content.length) send("error", { error: "empty" });
        else send("done", { content, stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn" });
        controller.close();
      } catch (err) {
        console.error("[asc-agent] stream", err);
        try { send("error", { error: "agent_failed" }); } catch { /* closed */ }
        try { controller.close(); } catch { /* closed */ }
      }
    },
  });
  return new Response(stream, {
    headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
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
  // can't be spoofed by the client. Google sign-ins often have an empty
  // profiles.full_name but carry the real name in auth metadata — use it.
  const myName = String(
    me.full_name || user.user_metadata?.full_name || user.user_metadata?.name || "",
  ).trim();
  const shown = safeName(myName);
  const userLine = shown
    ? `\n\nCURRENT USER: You are talking to ${shown} (${safeName(me.role)}). Their first name is ${shown.split(" ")[0]}.`
    : "";

  // -- Request: the conversation so far ---------------------------------------
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Conversation too long — start a new chat." }, 413);
  let body: { messages?: unknown; stream?: boolean; transcribe?: boolean; audio?: unknown; lang?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400); }
  if (body?.transcribe === true) return await transcribeSpeech(asCaller, user.id, body.audio, body.lang, apiKey);
  if (Array.isArray(body?.messages) && body.messages.length > MAX_MESSAGES) {
    return json({ error: "Conversation too long — start a new chat." }, 413);
  }
  const checked = validateMessages(body?.messages);
  if (!checked.ok) return json({ error: "Bad request." }, 400);
  const messages = checked.messages;
  const wantStream = (req.headers.get("accept") || "").includes("text/event-stream")
    || new URL(req.url).searchParams.get("stream") === "1"
    || body.stream === true;

  // -- Gemini ------------------------------------------------------------------
  try {
    const contents = await toGeminiContents(messages, asCaller, user.id);
    const system = SYSTEM + userLine;
    const busy = isBusy;
    const payload = geminiBody(contents, system);
    const callModel = (model: string, stream: boolean) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: payload,
        signal: AbortSignal.timeout(stream ? STREAM_TIMEOUT_MS : TIMEOUT_MS),
      },
    );
    // Retry and fallback finish before any client SSE byte. A busy stream is
    // discarded; the client only hears a model that already accepted the call.
    let res = await callModel(MODEL, wantStream);
    if (busy(res.status)) {
      const wait = backoffMs(0, res.headers.get("retry-after"));
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, wait));
      res = await callModel(MODEL, wantStream);
    }
    if (busy(res.status) && FALLBACK_MODEL !== MODEL) {
      const detail = await res.text();
      console.error("[asc-agent]", res.status, "on", MODEL, detail.slice(0, 300), "→ trying", FALLBACK_MODEL);
      res = await callModel(FALLBACK_MODEL, wantStream);
    }
    if (busy(res.status)) return json({ error: "busy" }, 429);
    if (!res.ok) {
      console.error("[asc-agent] Gemini error", res.status, (await res.text()).slice(0, 500));
      return json({ error: "agent_failed" }, 502);
    }
    if (wantStream) return pipeGemini(res);
    const data = await res.json();
    return json(fromGeminiResponse(data));
  } catch (err) {
    if ((err as Error)?.name === "TimeoutError") {
      console.error("[asc-agent] Gemini timeout");
      return json({ error: "busy" }, 504);
    }
    console.error("[asc-agent]", err);
    return json({ error: "agent_failed" }, 502);
  }
});
