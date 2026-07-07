// ============================================================================
// gallery.js — cinematic card imagery for the dashboard.
// A pool of generated photos (assets/gallery/manifest.json) is shuffled with a
// per-login seed (every sign-in deals a fresh hand), painted into elements
// carrying [data-gallery], and slowly rotated one card at a time while the
// user is looking — crossfade, never more often than ROTATE_MIN_MS.
// Respects prefers-reduced-motion (no live rotation) and hidden tabs (paused).
// ============================================================================

const ROTATE_MIN_MS = 150_000;   // 2.5 min
const ROTATE_JITTER_MS = 90_000; // + up to 1.5 min
let pool = null;

async function loadPool() {
  if (pool) return pool;
  try {
    const res = await fetch("assets/gallery/manifest.json", { cache: "no-cache" });
    pool = await res.json();
  } catch { pool = []; }
  return pool;
}

// Deterministic shuffle seeded per login session — same hand until re-login.
function seed() {
  let s;
  try {
    s = sessionStorage.getItem("asc.gallerySeed");
    if (!s) { s = String((Math.random() * 2 ** 31) | 0); sessionStorage.setItem("asc.gallerySeed", s); }
  } catch { s = "42"; }
  return Number(s);
}
function shuffled(list) {
  let x = seed() || 42;
  const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const url = (e) => `assets/gallery/${e.f}`;

// Paint every [data-gallery] element under root; then start the slow rotor.
export async function initGallery(root) {
  const cards = [...root.querySelectorAll("[data-gallery]")];
  if (!cards.length) return;
  const all = await loadPool();
  if (!all.length) return;
  const deck = shuffled(all);
  let next = 0;
  const draw = (want) => {
    for (let i = 0; i < deck.length; i++) {
      const e = deck[(next + i) % deck.length];
      if (!want || e.o === want) { next = (next + i + 1) % deck.length; return e; }
    }
    return deck[next++ % deck.length];
  };

  const paint = (card, entry, fade) => {
    let back = card.querySelector(".g-photo.back");
    let front = card.querySelector(".g-photo.front");
    if (!front) {
      front = document.createElement("i"); front.className = "g-photo front";
      back = document.createElement("i"); back.className = "g-photo back";
      card.prepend(back, front);
    }
    const img = new Image();
    img.onload = () => {
      if (!card.isConnected) return;
      if (fade) {
        back.style.backgroundImage = `url("${url(entry)}")`;
        back.classList.add("show");
        setTimeout(() => {
          if (!card.isConnected) return;
          front.style.backgroundImage = back.style.backgroundImage;
          back.classList.remove("show");
        }, 900);
      } else {
        front.style.backgroundImage = `url("${url(entry)}")`;
      }
    };
    img.src = url(entry);
  };

  cards.forEach((c) => paint(c, draw(c.dataset.gallery || ""), false));

  // Slow rotor — one random card at a time, only while visible.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  let timer = 0;
  const tick = () => {
    timer = setTimeout(() => {
      if (!document.hidden && cards.some((c) => c.isConnected)) {
        const live = cards.filter((c) => c.isConnected);
        const card = live[Math.floor(Math.random() * live.length)];
        if (card) paint(card, draw(card.dataset.gallery || ""), true);
      }
      if (cards.some((c) => c.isConnected)) tick();
    }, ROTATE_MIN_MS + Math.random() * ROTATE_JITTER_MS);
  };
  tick();
  window.addEventListener("asc:teardown", () => clearTimeout(timer), { once: true });
}
