// ============================================================================
// agent.js — client half of the in-app AI assistant.
// The Edge Function (supabase/functions/asc-agent) holds the API key, system
// prompt and tool definitions; THIS module runs the tool-use loop and executes
// every tool locally against db.js — with the signed-in user's own session, so
// RLS applies to everything the agent reads or writes.
// ============================================================================
import { supabase } from "./supabaseClient.js";
import * as db from "./db.js";
import { matchesQuery, isDueSoon, locationLine, hasLocation } from "./domain.js";
import { t } from "./i18n.js";

const MAX_TOOL_ROUNDS = 6;

// ---- Compact serializers (keep tool results small — they are model input) ----
function setBrief(s) {
  const v = s.vehicle || {}, c = v.customer || {};
  return {
    code: s.public_code, status: s.status, season: s.season,
    customer: c.name || null, phone: c.phone || null, plate: v.plate || null,
    vehicle: [v.year, v.make, v.model].filter(Boolean).join(" ") || null,
    location: hasLocation(s) ? locationLine(s) : null,
    expected_out: s.expected_out_date || null,
  };
}
function setFull(s) {
  return {
    ...setBrief(s),
    quantity: s.quantity, on_rims: s.on_rims, rim_type: s.rim_type || null,
    checked_in: s.check_in_date, fee: s.fee, paid: s.paid, notes: s.notes || null,
    tires: (s.tires || []).map((x) => ({
      position: x.position, size: x.size || null, brand: x.brand || null,
      tread_mm: x.tread_mm, dot: x.dot_code || null,
    })),
  };
}

// ---- Tool executors ----------------------------------------------------------
// `onDraftReview(draft)` is supplied by the view: it shows the review card and
// resolves to {confirmed, code} or {confirmed:false} — the human in the loop.
async function executeTool(name, input, { onDraftReview }) {
  if (name === "search_sets") {
    const sets = await db.listStorageSets();
    const hits = sets.filter((s) => matchesQuery(s, String(input.query || ""))).slice(0, 20);
    return hits.length ? JSON.stringify(hits.map(setBrief)) : "No matches.";
  }
  if (name === "get_set") {
    try { return JSON.stringify(setFull(await db.loadStorageSet(String(input.code || "").trim()))); }
    catch { return `No set with code ${input.code}.`; }
  }
  if (name === "inventory_overview") {
    const [sets, health, counts] = await Promise.all([db.listStorageSets(), db.healthStats(), db.countsByStatus()]);
    return JSON.stringify({
      in_storage: counts.in_storage, reserved: counts.reserved,
      checked_out: counts.checked_out, missing: counts.missing,
      today_checkins: health.todayCheckIns, today_pickups: health.todayPickups,
      due_next_7_days: sets.filter(isDueSoon).length,
    });
  }
  if (name === "due_pickups") {
    const sets = (await db.listStorageSets()).filter(isDueSoon)
      .sort((a, b) => (a.expected_out_date || "").localeCompare(b.expected_out_date || ""));
    return sets.length ? JSON.stringify(sets.map(setBrief)) : "Nothing due in the next 7 days.";
  }
  if (name === "create_tire_set") {
    const res = await onDraftReview(input);          // ← review card; user decides
    if (!res?.confirmed) return "User CANCELLED the creation. Ask what to change before trying again.";
    return `Created successfully. New set code: ${res.code}. Tell the user the code.`;
  }
  return `Unknown tool ${name}.`;
}

// Build the createStorageSet form from the agent's draft (same shape check-in uses).
export function draftToForm(d) {
  const qty = Math.min(8, Math.max(1, Number(d.quantity) || 4));
  const size = (d.tire_size || "").trim();
  return {
    customer: { name: String(d.customer_name || "").trim(), phone: (d.phone || "").trim(), email: (d.email || "").trim() },
    vehicle: {
      make: (d.make || "").trim(), model: (d.model || "").trim(),
      year: d.year ? Number(d.year) : null, plate: (d.plate || "").trim().toUpperCase(),
    },
    set: {
      season: ["winter", "summer", "all_season"].includes(d.season) ? d.season : "winter",
      quantity: qty, on_rims: Boolean(d.on_rims), rim_type: "",
      zone: (d.zone || "").trim(), rack: (d.rack || "").trim(), shelf: (d.shelf || "").trim(), slot: (d.slot || "").trim(),
      check_in_date: new Date().toISOString().slice(0, 10),
      expected_out_date: /^\d{4}-\d{2}-\d{2}$/.test(d.expected_out_date || "") ? d.expected_out_date : null,
      fee: d.fee != null && d.fee !== "" ? Number(d.fee) : null, paid: false,
      notes: (d.notes || "").trim(),
    },
    tires: Array.from({ length: qty }, (_, i) => ({
      position: ["FL", "FR", "RL", "RR"][i] || "", size, brand: (d.brand || "").trim(), model: "",
      tread_mm: null, dot_code: "", studded: false, condition_notes: "",
    })),
  };
}

// ---- The loop ------------------------------------------------------------------
// runTurn(history, callbacks) drives one user turn to completion. `history` is
// the messages array (mutated in place: assistant turns + tool results are
// appended). Returns the assistant's final text.
export async function runTurn(history, { onToolUse, onDraftReview } = {}) {
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const { data, error } = await supabase.functions.invoke("asc-agent", { body: { messages: history } });
    if (error) {
      // Function missing / not deployed → a setup notice, not a crash.
      const status = error?.context?.status;
      if (status === 404 || /not found|Failed to send/i.test(error.message || "")) throw new Error(t("ag.setup"));
      if (status === 503) throw new Error(t("ag.setup"));
      throw new Error(t("ag.error"));
    }
    if (data?.error) throw new Error(data.error === "agent_not_configured" ? t("ag.setup") : t("ag.error"));

    const content = data?.content || [];
    history.push({ role: "assistant", content });

    if (data?.stop_reason !== "tool_use") {
      return content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    }

    // Execute EVERY tool_use block; all results go back in ONE user message.
    const toolUses = content.filter((b) => b.type === "tool_use");
    const results = [];
    for (const tu of toolUses) {
      onToolUse?.(tu.name);
      let result, isError = false;
      try { result = await executeTool(tu.name, tu.input || {}, { onDraftReview }); }
      catch (err) { result = `Tool failed: ${err.message}`; isError = true; }
      results.push({ type: "tool_result", tool_use_id: tu.id, content: result, ...(isError ? { is_error: true } : {}) });
    }
    history.push({ role: "user", content: results });
  }
  return t("ag.error");
}
