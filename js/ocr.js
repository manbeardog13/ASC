// ============================================================================
// Sidewall OCR — read a tire's SIZE and DOT date code from a photo.
// Uses Tesseract.js (WASM), lazy-loaded from a CDN only on first use so it
// doesn't slow the initial app load. This is a best-effort ASSIST: embossed
// black-on-black sidewall text is hard, so results are always shown for the
// user to confirm/edit, never saved blindly.
//
// Recognition strategy (multi-pass, early exit): sidewall photos are dark
// rubber with low-contrast embossing, so one fixed-contrast pass almost never
// reads. Instead we build adaptive variants (percentile contrast stretch +
// inverted) at a resolution where the markings stay legible, and try
// block-text then sparse-text segmentation until a size or DOT parses.
// ============================================================================
import { t } from "./i18n.js";

const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TESSERACT_SRC;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => {
      tesseractLoading = null;
      reject(new Error(t("ci.ocrEngine")));
    };
    document.head.appendChild(s);
  });
  return tesseractLoading;
}

let workerPromise = null;
let progressCb = null;
function getWorker() {
  // Cache the PROMISE so two concurrent first calls share one worker (and one
  // WASM + model download) instead of leaking a duplicate.
  workerPromise ||= (async () => {
    const Tesseract = await loadTesseract();
    try {
      return await Tesseract.createWorker("eng", 1, {
        logger: (m) => progressCb && progressCb(m),
      });
    } catch (err) {
      // WASM/worker start-up failures surface as cryptic runtime errors —
      // translate them; keep the original for diagnosis.
      console.error("[ocr] worker start failed:", err);
      workerPromise = null;   // allow a retry
      throw new Error(t("ci.ocrEngine"));
    }
  })();
  return workerPromise;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("ci.ocrFail"))); };
    img.src = url;
  });
}

// Grayscale at a working resolution where sidewall markings stay legible.
// (The old 1100px cap shrank a whole-wheel photo until the size was ~15px
// tall — below what Tesseract can read.)
function toGray(img) {
  const maxW = 1800;
  const scale = Math.min(1, maxW / (img.width || maxW));
  const w = Math.max(1, Math.round((img.width || maxW) * scale));
  const h = Math.max(1, Math.round((img.height || maxW) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return { canvas, ctx, imgData, gray, w, h };
}

// Percentile contrast stretch — adapts to dark rubber instead of a fixed
// multiplier: whatever narrow band the sidewall occupies gets spread to full
// range. `invert` flips it (embossed text often reads better inverted).
function stretchVariant(base, { invert = false } = {}) {
  const { gray, w, h } = base;
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  // 0.5% tails: a sidewall photo is mostly one tone, so wider percentiles both
  // land inside that dominant tone and the range degenerates (everything
  // clamps to one color). Thin tails keep the embossing inside [lo, hi].
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.005) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.005) { hi = v; break; } }
  if (hi - lo < 10) { // still degenerate → use the full occupied range
    lo = 0; while (lo < 255 && !hist[lo]) lo++;
    hi = 255; while (hi > 0 && !hist[hi]) hi--;
  }
  const range = Math.max(10, hi - lo);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const out = ctx.createImageData(w, h);
  const od = out.data;
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    let v = ((gray[p] - lo) * 255) / range;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (invert) v = 255 - v;
    od[i] = od[i + 1] = od[i + 2] = v;
    od[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

// Real-world sanity check: widths 125–355 in steps of 5, aspect 25–85 in
// steps of 5, rim 12–24". Kills OCR-noise "sizes" like 123/45R67.
function validSize(width, aspect, rim) {
  return width >= 125 && width <= 355 && width % 5 === 0
    && aspect >= 25 && aspect <= 85 && aspect % 5 === 0
    && rim >= 12 && rim <= 24;
}

// Pull a tire size and DOT date out of raw OCR text. Tolerant of OCR noise.
export function parseSidewall(text) {
  const up = (text || "").toUpperCase();
  const compact = up.replace(/[^0-9A-Z/]/g, " ").replace(/\s+/g, " ");
  // A slash is mandatory in the size pattern, so squashing spaces is safe here
  // and rescues OCR that split digits (e.g. "2 2 5 / 4 5 R 1 7").
  const nospace = up.replace(/[^0-9A-Z/]/g, "");

  // Size: 225/45R17, P225/45R17 91V, 225 / 45 R 17 …
  let size = "";
  let fallback = "";
  const sizeRe = /(\d{3})\s*\/\s*(\d{2})\s*([ZR]{1,2}|[BD])?\s*(\d{2})(?:\s+(\d{2,3})\s*([A-Z]))?/g;
  for (const hay of [compact, nospace]) {
    for (const m of hay.matchAll(sizeRe)) {
      const constr = m[3] && /[RBD]/.test(m[3]) ? m[3] : "R";
      let cand = `${m[1]}/${m[2]}${constr}${m[4]}`;
      if (m[5]) cand += ` ${m[5]}${m[6] || ""}`;
      if (validSize(+m[1], +m[2], +m[4])) { size = cand; break; }
      if (!fallback) fallback = cand;
    }
    if (size) break;
  }
  // No valid slash match → rescue sizes where OCR dropped the slash
  // ("2254517", "225 45 R17") — but only if the numbers are a real tire size.
  if (!size) {
    for (const m of nospace.matchAll(/(\d{3})(\d{2})(ZR|[RBD])(\d{2})/g)) {
      if (validSize(+m[1], +m[2], +m[4])) { size = `${m[1]}/${m[2]}${m[3] === "ZR" ? "ZR" : m[3]}${m[4]}`; break; }
    }
  }
  if (!size) size = fallback; // let the user correct a near-miss over nothing

  // DOT date = the LAST plausible WWYY 4-digit group, preferably after "DOT".
  let dot = "";
  const idx = up.indexOf("DOT");
  const hay = idx >= 0 ? up.slice(idx + 3) : up;
  const fours = [...hay.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map((x) => x[1]);
  for (const f of fours) {
    const ww = +f.slice(0, 2);
    if (ww >= 1 && ww <= 53) dot = f; // last valid one wins
  }

  return { size, dot };
}

// Main entry: OCR a sidewall photo. onProgress receives Tesseract-style
// {status, progress} where progress is the OVERALL fraction across passes.
// Scans are SERIALIZED: the worker is shared, so a second photo picked
// mid-scan would otherwise interleave setParameters/recognize calls and
// clobber the first scan's progress callback.
let scanQueue = Promise.resolve();
export function scanSidewall(file, onProgress) {
  const run = scanQueue.then(() => doScan(file, onProgress));
  scanQueue = run.catch(() => {});
  return run;
}
async function doScan(file, onProgress) {
  const img = await fileToImage(file);
  const base = toGray(img);

  // Passes, cheap-win first: adaptive stretch (block text), inverted, then
  // sparse-text segmentation for markings scattered around the rim.
  const plain = stretchVariant(base);
  const inverted = stretchVariant(base, { invert: true });
  const passes = [
    { canvas: plain, psm: "6" },
    { canvas: inverted, psm: "6" },
    { canvas: plain, psm: "11" },
    { canvas: inverted, psm: "11" },
  ];

  let passIdx = 0;
  progressCb = (m) => {
    if (!onProgress) return;
    if (m.status === "recognizing text") {
      onProgress({ status: "recognizing text", progress: (passIdx + (m.progress || 0)) / passes.length });
    } else {
      onProgress(m); // engine download phases, first run only
    }
  };

  try {
    const w = await getWorker();
    await w.setParameters({
      tessedit_char_whitelist: "0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    });
    let best = { size: "", dot: "", rawText: "" };
    for (passIdx = 0; passIdx < passes.length; passIdx++) {
      const pass = passes[passIdx];
      await w.setParameters({ tessedit_pageseg_mode: pass.psm });
      const { data } = await w.recognize(pass.canvas);
      const parsed = parseSidewall(data.text || "");
      best = {
        size: best.size || parsed.size,
        dot: best.dot || parsed.dot,
        rawText: (best.rawText + "\n" + (data.text || "")).trim(),
      };
      if (best.size && best.dot) break;      // got everything — stop early
      if (best.size && passIdx >= 1) break;  // size alone is enough after two passes
    }
    return best;
  } finally {
    progressCb = null;
  }
}
