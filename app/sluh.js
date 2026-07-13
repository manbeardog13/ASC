// ============================================================================
// app/sluh.js — Croatian slot grammar for one-utterance Zaprimi prefill (v1.1)
// Brain-1 of the Sluh hold-to-talk feature.
//
// Exports:
//   extractSlots(transcript) → slots
//   groundCustomer(slots, customers) → { customer, score }
//   confidence(slots) → 0..1
//   slotsToPreifll(slots, customer) → asc.prefill-shaped object
//
// Zero network calls, zero external deps.
// ============================================================================

// ---- Levenshtein (compact row-only) ----------------------------------------
function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => i);
  let prev;
  for (let j = 1; j <= n; j++) {
    prev = d[0]; d[0] = j;
    for (let i = 1; i <= m; i++) {
      const t = d[i];
      d[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, d[i], d[i - 1]);
      prev = t;
    }
  }
  return d[m];
}

// ---- Croatian number-word → digit map ---------------------------------------
const NUM_WORDS = {
  nula:"0",jedan:"1",jedna:"1",jedno:"1",dva:"2",dvije:"2",tri:"3",
  "četiri":"4",cetiri:"4",pet:"5","šest":"6",sest:"6",sedam:"7",osam:"8",devet:"9",
};

function mapNumberWords(text) {
  return text.split(/\s+/).map((w) => NUM_WORDS[w] ?? w).join(" ");
}

// ---- Text normalization -----------------------------------------------------
function norm(text) {
  return (text || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
}

// ---- Brand gazetteer (top ~40 brands, Croatian market) + Levenshtein ≤ 2 ---
const BRAND_CANON = {
  "michelin":"Michelin","mišelin":"Michelin","miselin":"Michelin","mislen":"Michelin",
  "continental":"Continental","kontinental":"Continental",
  "pirelli":"Pirelli","pireli":"Pirelli",
  "bridgestone":"Bridgestone","bridston":"Bridgestone","bridžston":"Bridgestone",
  "goodyear":"Goodyear","gudjir":"Goodyear","gudjer":"Goodyear",
  "dunlop":"Dunlop",
  "nokian":"Nokian","nokijan":"Nokian",
  "hankook":"Hankook","hankuk":"Hankook",
  "yokohama":"Yokohama","jokohama":"Yokohama",
  "firestone":"Firestone",
  "falken":"Falken",
  "toyo":"Toyo",
  "kumho":"Kumho",
  "bfgoodrich":"BF Goodrich","bf goodrich":"BF Goodrich",
  "uniroyal":"Uniroyal","uniroj":"Uniroyal",
  "kleber":"Kleber",
  "sava":"Sava",
  "matador":"Matador",
  "semperit":"Semperit",
  "cooper":"Cooper",
  "vredestein":"Vredestein","vrideštajn":"Vredestein",
  "nexen":"Nexen",
  "general":"General",
  "maxxis":"Maxxis","maksis":"Maxxis",
  "westlake":"Westlake","vestlejk":"Westlake",
  "riken":"Riken",
  "gislaved":"Gislaved","gizlaved":"Gislaved",
  "laufenn":"Laufenn","laufen":"Laufenn",
  "marshal":"Marshal","maršal":"Marshal",
  "linglong":"Linglong","linlong":"Linglong",
  "davanti":"Davanti",
  "roadstone":"Roadstone",
  "nankang":"Nankang",
  "starmaxx":"Starmaxx","starmaks":"Starmaxx",
  "petlas":"Petlas",
  "atlas":"Atlas",
  "triangle":"Triangle","trjangle":"Triangle",
};

const BRAND_KEYS = Object.keys(BRAND_CANON);

function matchBrand(text) {
  const n = norm(text);
  const words = n.split(/\s+/);
  const candidates = [...words];
  // Try bigrams (e.g. "bf goodrich")
  for (let i = 0; i < words.length - 1; i++) {
    candidates.push(words[i] + " " + words[i + 1]);
  }
  for (const cand of candidates) {
    if (BRAND_CANON[cand]) return BRAND_CANON[cand];
    // Levenshtein ≤ 2, only similar-length strings
    for (const key of BRAND_KEYS) {
      if (Math.abs(cand.length - key.length) > 2) continue;
      if (lev(cand, key) <= 2) return BRAND_CANON[key];
    }
  }
  return null;
}

// ---- HR city codes for plate confidence boost -------------------------------
const HR_CITY_CODES = new Set([
  "bj","bm","bv","du","gs","im","kg","kk","kr","kz",
  "li","ng","os","pb","po","pu","ri","sd","si","sk",
  "sl","st","sb","tk","vk","vt","vz","za","zd","zg","zt",
]);

// ============================================================================
// SLOT EXTRACTORS
// ============================================================================

function extractQuantity(n) {
  const mapped = mapNumberWords(n);
  const nearTire =
    /([1-8])\s*(?:gum[ae]?|kotač[ae]?|komad[a]?|komplet[a]?)|(?:gum[ae]?|kotač[ae]?|komad[a]?|komplet[a]?)\s*([1-8])/;
  const m1 = mapped.match(nearTire);
  if (m1) return parseInt(m1[1] || m1[2], 10);
  const m2 = mapped.match(/(?<!\d)([1-8])(?!\d)/);
  return m2 ? parseInt(m2[1], 10) : null;
}

function extractSeason(n) {
  if (/zimsk|zim[ae]n|winter/.test(n)) return "winter";
  if (/ljetn|ljeto|ljetnih|summer/.test(n)) return "summer";
  if (/cjelogodišnj|cjelogodisnj|svegodišnj|all.?season/.test(n)) return "all_season";
  return null;
}

function extractTireSize(n) {
  const mapped = mapNumberWords(n);
  // 205/55R17, 205 55 17, 205/55 R17, etc.
  const rx = /\b(\d{3})[\s/]?(\d{2})\s*r?\s*(\d{2})\b/i;
  const m = mapped.match(rx);
  if (!m) return null;
  const [, w, h, d] = m;
  if (+w < 125 || +w > 355) return null;
  if (+h < 25  || +h > 85 ) return null;
  if (+d < 12  || +d > 24 ) return null;
  return `${w}/${h}R${d}`;
}

function extractPlate(n) {
  const mapped = mapNumberWords(n);
  const rx = /\b([a-zžšćčđ]{2})[\s-]?(\d{3,4})[\s-]?([a-zžšćčđ]{1,2})\b/i;
  const m = mapped.match(rx);
  if (!m) return null;
  const code = m[1].toLowerCase();
  return {
    plate: (m[1] + m[2] + m[3]).toUpperCase().replace(/[^A-ZŽŠĆČĐ0-9]/g, ""),
    confident: HR_CITY_CODES.has(code),
  };
}

function extractLocation(n) {
  const zone  = (n.match(/\bzona\s+([a-dA-D])\b/) ?? n.match(/\bzon[ae]\s+([a-dA-D])\b/))?.[1]?.toUpperCase() ?? null;
  const rack  = (n.match(/\b(?:regal|red)\s*(\d{1,3})\b/))?.[1] ?? null;
  const shelf = (n.match(/\b(?:polica|razin[ae]|etaž[ae]?|kat)\s*(\d{1,2})\b/))?.[1] ?? null;
  const slot  = (n.match(/\b(?:mjesto|broj)\s*(\d{1,3})\b/))?.[1] ?? null;
  return (zone || rack || shelf || slot) ? { zone, rack, shelf, slot } : null;
}

function extractOnRims(n) {
  if (/\b(?:na\s+(?:felgama|naplatcima|felg[ae]|naplatci)|s\s+felgama|na\s+felgi|s\s+naplatcima)\b/.test(n)) return true;
  if (/\b(?:bez\s+(?:felgi|naplataka|felg[ae])|skinut[oi]\s+s\s+felgi)\b/.test(n)) return false;
  return null;
}

function extractBolts(n) {
  if (/\bvijci\s+(?:kod\s+nas|uskladišten[ia]|ostaju|tu|ovdje)\b/.test(n)) return "stored";
  if (/\bvijci\s+(?:u\s+(?:gepeku|prtljaž?niku|autu)|kod\s+kupca|sa\s+sobom)\b/.test(n)) return "in_trunk";
  return null;
}

function extractHubcaps(n) {
  if (/\b(?:poklopci?|ratkap[ae]|kap[ae])\s+(?:kod\s+nas|uskladišten[ia]|ostaju)\b/.test(n)) return "stored";
  if (/\b(?:poklopci?|ratkap[ae])\s+(?:kod\s+kupca|u\s+(?:gepeku|autu)|sa\s+sobom)\b/.test(n)) return "in_trunk";
  if (/\b(?:bez\s+(?:poklopaca?|ratkap[ae]|kapa)|nema\s+(?:poklopaca?|ratkap[ae]))\b/.test(n)) return "none";
  return null;
}

function extractPhone(n) {
  const mapped = mapNumberWords(n);
  const m = mapped.match(/(?:\+?385|0)\s*9\d[\s\d]{6,}/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

// Strip all slot tokens to surface the residual name
function extractNameCandidate(original) {
  let t = original
    .replace(/\b\d{3}[\s/]\d{2}\s*[rR]?\s*\d{2}\b/g, " ")
    .replace(/\b[a-zA-ZžšćčđŽŠĆČĐ]{2}[\s-]?\d{3,4}[\s-]?[a-zA-ZžšćčđŽŠĆČĐ]{1,2}\b/g, " ")
    .replace(/(?:\+?385|0)\s*9\d[\s\d]{6,}/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\b(?:zimsk[ae]?|ljetn[ae]?|cjelogodišnj[ae]?|svegodišnj[ae]?|winter|summer|all[\s-]?season)\b/gi, " ")
    .replace(/\b(?:gum[ae]?|kotač[ae]?|komad[a]?|komplet[a]?|četiri|petero)\b/gi, " ")
    .replace(/\b(?:zona|regal|polica|razin[ae]?|etaž[ae]?|mjesto|broj|red|kat)\b/gi, " ")
    .replace(/\b(?:felg[ae]?|naplatci?|bez|vijci|poklopci?|ratkap[ae]?|uskladišten[ia]?)\b/gi, " ")
    .replace(/\s+/g, " ").trim();

  const words = t.split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return null;
  return words.slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// ============================================================================
// MAIN EXPORT: extractSlots(transcript)
// ============================================================================
export function extractSlots(transcript) {
  const n = norm(transcript);
  const plateResult = extractPlate(n);
  const loc = extractLocation(n);

  return {
    quantity:         extractQuantity(n),
    season:           extractSeason(n),
    tire_size:        extractTireSize(n),
    brand:            matchBrand(n),
    plate:            plateResult?.plate ?? null,
    plate_confident:  plateResult?.confident ?? false,
    zone:             loc?.zone  ?? null,
    rack:             loc?.rack  ?? null,
    shelf:            loc?.shelf ?? null,
    slot:             loc?.slot  ?? null,
    on_rims:          extractOnRims(n),
    bolts_location:   extractBolts(n),
    hubcaps_location: extractHubcaps(n),
    phone:            extractPhone(n),
    name_candidate:   extractNameCandidate(transcript),
  };
}

// ============================================================================
// groundCustomer(slots, customers) → { customer | null, score }
// customers[] from db.listCustomers() — { id, name, phone, email, vehicles }
// Threshold 0.72 — miss is safer than wrong link
// ============================================================================

function normName(s) {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // strip diacritics
    .replace(/\s+/g, " ").trim();
}

function nameSimilarity(a, b) {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const tokA = na.split(" "), tokB = nb.split(" ");
  let matched = 0;
  const usedB = new Set();
  for (const ta of tokA) {
    for (let k = 0; k < tokB.length; k++) {
      if (usedB.has(k)) continue;
      const tb = tokB[k];
      if (ta === tb || (ta.length > 3 && lev(ta, tb) <= 1)) {
        matched++;
        usedB.add(k);
        break;
      }
    }
  }
  const tokenScore = matched / Math.max(tokA.length, tokB.length);
  const levScore   = 1 - lev(na, nb) / Math.max(na.length, nb.length, 1);
  return 0.55 * tokenScore + 0.45 * levScore;
}

export function groundCustomer(slots, customers) {
  if (!slots.name_candidate || !customers?.length) return { customer: null, score: 0 };

  let best = null, bestScore = 0;
  for (const c of customers) {
    let s = nameSimilarity(slots.name_candidate, c.name);
    // Phone last-8-digit match gives a boost
    if (slots.phone && c.phone) {
      const cp = c.phone.replace(/\D/g, "");
      const sp = slots.phone.replace(/\D/g, "");
      if (cp && sp && cp.endsWith(sp.slice(-8))) s = Math.min(1, s + 0.18);
    }
    if (s > bestScore) { best = c; bestScore = s; }
  }

  if (bestScore >= 0.72) return { customer: best, score: bestScore };
  return { customer: null, score: bestScore };
}

// ============================================================================
// confidence(slots) → 0..1
// Weights match voice-agent-spec: name+qty+season = 0.70
// ============================================================================
const SLOT_WEIGHTS = {
  name_candidate: 0.28,
  quantity:       0.22,
  season:         0.20,
  tire_size:      0.12,
  brand:          0.08,
  plate:          0.06,
  _location:      0.04,  // any single location field counts
};

export function confidence(slots) {
  let score = 0;
  for (const [key, w] of Object.entries(SLOT_WEIGHTS)) {
    const val = key === "_location"
      ? (slots.zone || slots.rack || slots.shelf || slots.slot)
      : slots[key];
    if (val != null) score += w;
  }
  return Math.min(1, score);
}

// ============================================================================
// slotsToPreifll(slots, customer) → sessionStorage "asc.prefill"-shaped object
// ============================================================================
export function slotsToPreifll(slots, customer) {
  const pf = {};

  // Customer identity
  pf.customer_name = customer?.name  ?? slots.name_candidate ?? "";
  pf.phone         = customer?.phone ?? slots.phone          ?? "";
  pf.email         = customer?.email ?? "";

  // Vehicle — grounded vehicle fills make/model/year; spoken plate overrides (different car today)
  if (customer?.vehicles?.length) {
    const v = customer.vehicles[customer.vehicles.length - 1];
    pf.make  = v.make  ?? "";
    pf.model = v.model ?? "";
    pf.year  = v.year  ?? null;
    pf.plate = slots.plate ?? v.plate ?? "";
  } else {
    pf.plate = slots.plate ?? "";
  }

  // Storage set
  if (slots.season    != null) pf.season    = slots.season;
  if (slots.quantity  != null) pf.quantity  = slots.quantity;
  if (slots.tire_size != null) pf.tire_size = slots.tire_size;
  if (slots.brand     != null) pf.brand     = slots.brand;
  if (slots.zone      != null) pf.zone      = slots.zone;
  if (slots.rack      != null) pf.rack      = slots.rack;
  if (slots.shelf     != null) pf.shelf     = slots.shelf;
  if (slots.slot      != null) pf.slot      = slots.slot;
  if (slots.on_rims   != null) pf.on_rims   = slots.on_rims;

  if (slots.bolts_location) {
    pf.bolts_location = slots.bolts_location;
  }
  if (slots.hubcaps_location) {
    pf.hubcaps_location = slots.hubcaps_location;
    pf.hubcaps_stored   = slots.hubcaps_location === "stored";
  }

  return pf;
}
