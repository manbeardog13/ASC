// Studio composer template family (feat/studio-composer-template).
// One source of truth for every Nero composer. The four layout plans below are
// ordinary studio templates: they carry a composition tree, anatomy, layout,
// breakpoints, motion and accessibility intent, and they are checked by
// NeroCatalogValidator.validateExtensionFamily. Every surface that renders a
// composer (see ../composer/mount.mjs) reads its structure from here, so a change
// made through updateTemplate() reaches every mounted surface at once.
// The family sits beside the fifteen core families and does not change the core
// 15 x 50 catalog result. Nothing here runs unless the studioComposer flag is on.

const FAMILY_ID = "composer";
const ADAPTER_ID = "nero-family-composer-v1";

export const COMPOSER_CONTRACT = Object.freeze({
  semanticRole: "group",
  descriptor: "composer input",
  allowedKinds: Object.freeze([
    "composer-input", "composer-add", "composer-command", "composer-context",
    "composer-model", "composer-mode", "composer-voice", "composer-stop", "composer-send"
  ]),
  // A composer is never valid without a text input and a send control.
  requiredKinds: Object.freeze(["composer-input", "composer-send"])
});

export const PLAN_IDS = Object.freeze(["inline-bar", "collapsed-bubble", "docked-panel", "compact-mobile"]);

const NODE_DEFAULTS = Object.freeze({
  "composer-input": { label: "Message Nero", role: "textbox", interactive: true, required: true, value: "Do anything" },
  "composer-add": { label: "Add context", role: "button", interactive: true, required: false, value: "+" },
  "composer-command": { label: "Insert a command", role: "button", interactive: true, required: false, value: "/" },
  "composer-context": { label: "Context controls", role: "group", interactive: true, required: false, value: "" },
  "composer-model": { label: "Model", role: "button", interactive: true, required: false, value: "Model" },
  "composer-mode": { label: "Mode", role: "button", interactive: true, required: false, value: "Balanced" },
  "composer-voice": { label: "Voice", role: "button", interactive: true, required: false, value: "Mic" },
  "composer-stop": { label: "Stop", role: "button", interactive: true, required: false, value: "Stop" },
  "composer-send": { label: "Send", role: "button", interactive: true, required: true, value: "Send" }
});

const leaf = (kind) => Object.freeze({ node: true, kind, ...NODE_DEFAULTS[kind] });
const group = (axis, label, children) => Object.freeze({ axis, label, children: Object.freeze(children) });

const PLAN_SOURCE = [
  {
    plan: "inline-bar",
    name: "Inline bar",
    summary: "Stitch-style glass bar: the draft on top, + and / with context on the left, model and mode chips with mic and send on the right.",
    width: 1040, height: 132, mode: "flex", direction: "column", wrap: "nowrap", align: "stretch", justify: "flex-start",
    disclosure: "persistent", actionPlacement: "trailing-row",
    breakpoints: { desktop: "row", tablet: "row", mobile: "stack" },
    tree: [
      leaf("composer-input"),
      group("row", "Composer toolbar", [
        group("row", "Leading tools", [leaf("composer-add"), leaf("composer-command"), leaf("composer-context")]),
        group("row", "Trailing tools", [leaf("composer-model"), leaf("composer-mode"), leaf("composer-voice"), leaf("composer-stop"), leaf("composer-send")])
      ])
    ]
  },
  {
    plan: "collapsed-bubble",
    name: "Collapsed bubble",
    summary: "A quiet ink bubble that shows only the draft text. Hover, focus or tap grows it into the full composer; chips animate in and out.",
    width: 720, height: 56, mode: "flex", direction: "row", wrap: "wrap", align: "center", justify: "space-between",
    disclosure: "expand-on-intent", actionPlacement: "revealed-row",
    breakpoints: { desktop: "row", tablet: "row", mobile: "row" },
    tree: [
      leaf("composer-input"),
      group("row", "Revealed tools", [leaf("composer-add"), leaf("composer-command"), leaf("composer-context"), leaf("composer-model"), leaf("composer-mode"), leaf("composer-voice"), leaf("composer-stop")]),
      leaf("composer-send")
    ]
  },
  {
    plan: "docked-panel",
    name: "Docked panel",
    summary: "A panel composer for side surfaces: model and mode on top, a taller draft, actions docked at the bottom.",
    width: 460, height: 220, mode: "grid", direction: "column", wrap: "nowrap", align: "stretch", justify: "flex-start",
    disclosure: "persistent", actionPlacement: "bottom-dock",
    breakpoints: { desktop: "grid", tablet: "grid", mobile: "stack" },
    tree: [
      group("row", "Mode bar", [leaf("composer-model"), leaf("composer-mode")]),
      leaf("composer-input"),
      group("row", "Action dock", [leaf("composer-add"), leaf("composer-command"), leaf("composer-context"), leaf("composer-voice"), leaf("composer-stop"), leaf("composer-send")])
    ]
  },
  {
    plan: "compact-mobile",
    name: "Compact mobile",
    summary: "One thumb row of + , draft and send; the remaining chips sit in an overflow row that opens on tap or focus.",
    width: 358, height: 56, mode: "flex", direction: "row", wrap: "wrap", align: "center", justify: "space-between",
    disclosure: "overflow-on-intent", actionPlacement: "thumb-row",
    breakpoints: { desktop: "row", tablet: "row", mobile: "row" },
    tree: [
      leaf("composer-add"),
      leaf("composer-input"),
      leaf("composer-send"),
      group("row", "Overflow tools", [leaf("composer-command"), leaf("composer-context"), leaf("composer-model"), leaf("composer-mode"), leaf("composer-voice"), leaf("composer-stop")])
    ]
  }
];

function flatten(tree, out = []) {
  for (const entry of tree) {
    if (entry.node === true) out.push(entry); else flatten(entry.children, out);
  }
  return out;
}

function buildTemplate(source, look) {
  const nodes = flatten(source.tree).map((node) => Object.freeze({ ...node }));
  return Object.freeze({
    id: `composer-${source.plan}`,
    family: FAMILY_ID,
    subtype: COMPOSER_CONTRACT.descriptor,
    plan: source.plan,
    name: source.name,
    summary: source.summary,
    semantics: Object.freeze({ role: COMPOSER_CONTRACT.semanticRole, label: "Message Nero" }),
    interaction: Object.freeze({ model: COMPOSER_CONTRACT.semanticRole, disclosure: source.disclosure, actionPlacement: source.actionPlacement }),
    anatomy: Object.freeze({ adapterId: ADAPTER_ID, nodes: Object.freeze(nodes) }),
    compatibility: Object.freeze({ adapterId: ADAPTER_ID, compatible: true, fallbackUsed: false }),
    composition: Object.freeze({ tree: Object.freeze(source.tree) }),
    geometry: Object.freeze({ width: source.width, height: source.height, aspect: "auto" }),
    layout: Object.freeze({ mode: source.mode, direction: source.direction, wrap: source.wrap, align: source.align, justify: source.justify, padding: "var(--composer-pad)", gap: "var(--nero-space-xs)" }),
    breakpoints: Object.freeze({ ...source.breakpoints }),
    states: Object.freeze(["rest", "hover", "focus", "expanded", "disabled"]),
    motion: Object.freeze({ preset: "color-ring", duration: "var(--nero-duration-base)", easing: "var(--nero-ease-standard)", properties: Object.freeze(["transform", "opacity"]), ringPeriod: look.ringPeriod }),
    icon: Object.freeze({ placement: source.plan === "compact-mobile" ? "leading" : "inline" }),
    surface: Object.freeze({ radius: source.plan === "docked-panel" ? "var(--nero-radius-lg)" : "var(--nero-radius-xl)", borderWidth: 1, borderStyle: "ring", elevation: "panel" }),
    typography: Object.freeze({ family: "var(--nero-type-family-ui)", size: "1rem" }),
    look: Object.freeze({ ...look }),
    accessibility: Object.freeze({
      status: "ACCESSIBILITY_INTENT_UNVERIFIED",
      labelIntent: "The draft keeps its visible or screen-reader label; every icon control keeps an aria-label.",
      keyboardIntent: "Tab order follows the composition tree; Enter sends, Shift+Enter adds a line; expansion opens on focus, never hover only.",
      targetIntent: "Every interactive control is at least 44 by 44 CSS pixels.",
      reducedMotionIntent: "With prefers-reduced-motion the colour ring is drawn static and expansion does not travel.",
      readingOrderIntent: "DOM order equals visual order; collapsed controls stay in the DOM and in the tab order.",
      behaviorVerified: false,
      independentlyReviewed: false
    })
  });
}

const DEFAULT_LOOK = Object.freeze({
  base: "#151820",
  baseRaised: "#1C2130",
  edge: "rgba(255, 255, 255, 0.14)",
  text: "#F2F4F8",
  textMuted: "#B4BAC8",
  ringA: "#FF7A45",
  ringB: "#B45CFF",
  ringC: "#3FA9FF",
  bubble: "#2A1E46",
  ringPeriod: "9s"
});

export function install(global) {
  "use strict";
  const listeners = new Set();
  let look = DEFAULT_LOOK;
  let overrides = new Map();
  let templates = Object.freeze(PLAN_SOURCE.map((source) => buildTemplate(source, look)));

  const rebuild = () => {
    templates = Object.freeze(PLAN_SOURCE.map((source) => {
      const base = buildTemplate(source, look);
      const patch = overrides.get(base.id);
      if (!patch) return base;
      const merged = { ...base, ...patch, id: base.id, family: FAMILY_ID, plan: base.plan };
      // Anatomy is always derived from the composition tree, so an edit to the
      // tree can never leave a stale node list behind.
      if (patch.composition && Array.isArray(patch.composition.tree)) {
        merged.anatomy = Object.freeze({ adapterId: ADAPTER_ID, nodes: Object.freeze(flatten(patch.composition.tree).map((node) => Object.freeze({ ...node }))) });
      }
      return Object.freeze(merged);
    }));
  };

  const api = Object.freeze({
    familyId: FAMILY_ID,
    contract: COMPOSER_CONTRACT,
    planIds: PLAN_IDS,
    list: () => templates,
    get: (idOrPlan) => templates.find((template) => template.id === idOrPlan || template.plan === idOrPlan) || null,
    look: () => look,
    validate() {
      const validator = global.NeroCatalogValidator;
      if (!validator || typeof validator.validateExtensionFamily !== "function") {
        return Object.freeze({ valid: false, problems: Object.freeze(["catalog validator not loaded"]) });
      }
      return validator.validateExtensionFamily(FAMILY_ID, templates, { contract: COMPOSER_CONTRACT, expected: PLAN_IDS.length });
    },
    // Library edit path: change one plan (or the shared look) and every mounted
    // surface re-renders. A change that fails validation is refused and the
    // previous templates stay in place.
    updateTemplate(idOrPlan, patch) {
      const current = api.get(idOrPlan);
      if (!current || !patch || typeof patch !== "object") return { ok: false, reason: "unknown template" };
      const before = overrides;
      overrides = new Map(overrides);
      overrides.set(current.id, { ...(before.get(current.id) || {}), ...patch });
      const previous = templates;
      rebuild();
      const result = api.validate();
      if (!result.valid) { overrides = before; templates = previous; return { ok: false, reason: "validation", result }; }
      listeners.forEach((listener) => { try { listener(api); } catch { /* a surface failure never blocks the others */ } });
      return { ok: true, result };
    },
    updateLook(patch) {
      const before = look;
      look = Object.freeze({ ...look, ...(patch || {}) });
      const previous = templates;
      rebuild();
      const result = api.validate();
      if (!result.valid) { look = before; templates = previous; return { ok: false, reason: "validation", result }; }
      listeners.forEach((listener) => { try { listener(api); } catch { /* ignore */ } });
      return { ok: true, result };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  });
  global.NeroComposerFamily = api;
  return api;
}

export function templateFor(plan) {
  const source = PLAN_SOURCE.find((item) => item.plan === plan);
  if (!source) throw new Error("unknown composer plan");
  return buildTemplate(source, DEFAULT_LOOK);
}
