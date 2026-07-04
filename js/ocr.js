// ============================================================================
// Sidewall OCR — read a tire's SIZE and DOT date code from a photo.
// Uses Tesseract.js (WASM), lazy-loaded from a CDN only on first use so it
// doesn't slow the initial app load. This is a best-effort ASSIST: embossed
// black-on-black sidewall text is hard, so results are always shown for the
// user to confirm/edit, never saved blindly.
// ============================================================================

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
      reject(new Error("Couldn't load the OCR engine — check your connection."));
    };
    document.head.appendChild(s);
  });
  return tesseractLoading;
}

let worker = null;
let progressCb = null;
async function getWorker() {
  if (worker) return worker;
  const Tesseract = await loadTesseract();
  worker = await Tesseract.createWorker("eng", 1, {
    logger: (m) => progressCb && progressCb(m),
  });
  // Sidewalls only carry digits, a slash, and uppercase letters.
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  });
  return worker;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = URL.createObjectURL(file);
  });
}

// Downscale, grayscale, and boost contrast — helps OCR on low-contrast rubber.
async function preprocess(file) {
  const img = await fileToImage(file);
  const maxW = 1100;
  const scale = Math.min(1, maxW / (img.width || maxW));
  const w = Math.max(1, Math.round((img.width || maxW) * scale));
  const h = Math.max(1, Math.round((img.height || maxW) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const contrast = 1.7;
  const intercept = 128 * (1 - contrast);
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = contrast * g + intercept;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
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
  const sizeRe = /(\d{3})\s*\/\s*(\d{2})\s*([ZR]{1,2}|[BD])?\s*(\d{2})(?:\s+(\d{2,3})\s*([A-Z]))?/;
  const m = compact.match(sizeRe) || nospace.match(sizeRe);
  if (m) {
    const constr = m[3] && /[RBD]/.test(m[3]) ? m[3] : "R";
    size = `${m[1]}/${m[2]}${constr}${m[4]}`;
    if (m[5]) size += ` ${m[5]}${m[6] || ""}`;
  }

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

// Main entry: OCR a sidewall photo. onProgress receives Tesseract {status,progress}.
export async function scanSidewall(file, onProgress) {
  progressCb = onProgress || null;
  try {
    const w = await getWorker();
    const canvas = await preprocess(file);
    const { data } = await w.recognize(canvas);
    return { ...parseSidewall(data.text || ""), rawText: data.text || "" };
  } finally {
    progressCb = null;
  }
}
