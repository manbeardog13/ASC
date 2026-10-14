// Pure, bounded client-side search. These helpers rank candidates; callers decide
// whether a result is sufficiently unambiguous to open or otherwise act on it.

const SEASON_NAMES = {
  winter: 'zimske zimska zimski winter',
  summer: 'ljetne ljetna ljetni summer',
  all_season: 'cjelogodišnje cjelogodišnja cjelogodišnji all season'
};

export function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/đ/g, 'd')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function words(value) {
  return value.replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2').split(' ').filter(Boolean);
}

function field(value, exactOnly = /\d/.test(String(value ?? ''))) {
  const text = normalize(value);
  return { text, compact: text.replace(/ /g, ''), words: words(text), exactOnly };
}

// Optimal string alignment distance counts an adjacent transposition as one
// typo. It only runs on letter words, and is bounded before allocating a matrix.
function typoDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previousPrevious;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], previousPrevious[j - 2] + 1);
      }
    }
    previousPrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

function wordScore(query, candidate, exactOnly) {
  if (query === candidate) return 100;
  if (exactOnly || !/^\p{L}+$/u.test(query) || !/^\p{L}+$/u.test(candidate)) return null;
  if (query.length >= 3 && candidate.startsWith(query)) return 75;
  if (Math.min(query.length, candidate.length) < 4) return null;
  const limit = Math.min(query.length, candidate.length) >= 8 ? 2 : 1;
  const distance = typoDistance(query, candidate, limit);
  return distance <= limit ? 50 - distance * 10 : null;
}

function identifierGroups(text, fields) {
  // Keep compact identifiers atomic, then recognise their spaced/dashed forms.
  // Short letter prefixes cover plates (DU 1234 AB), set codes (ASC 2026 0042),
  // and locations (R 2). Ordinary names such as "Marko 1234" remain separate
  // search terms, so names and an exact numeric field may still be combined.
  const groups = text.split(' ').filter((term) => /\p{L}/u.test(term) && /\p{N}/u.test(term));
  // A compact token already has its own boundary: A3 followed by tire size
  // 225/45 R17 must not become the invented identifier A322545R17.
  const chunks = text.split(' ');
  const split = chunks.flatMap((chunk, token) => words(chunk).map(word => ({ word, token })));
  const terms = split.map(part => part.word);
  for (let i = 0; i < terms.length - 1; i++) {
    if (!/^\p{L}{1,3}$/u.test(terms[i]) || !/^\p{N}+$/u.test(terms[i + 1])) continue;
    const chunk = chunks[split[i].token];
    if (/\p{L}/u.test(chunk) && /\p{N}/u.test(chunk) && fields.some(item => item.compact === chunk)) {
      const token = split[i].token;
      while (i + 1 < split.length && split[i + 1].token === token) i++;
      continue; // This complete compact identifier must not absorb later terms.
    }
    const shapes = fields.map((item) => item.words).filter((parts) => parts[0] === terms[i] && /^\p{N}+$/u.test(parts[1] || ''));
    const lexicalWord = fields.some((item) => !item.exactOnly && item.words.includes(terms[i]));
    if (!shapes.length && lexicalWord) continue; // Ana/Ivo plus a code or phone.
    const sameStart = shapes.filter((parts) => parts[1] === terms[i + 1]);
    const possible = sameStart.length ? sameStart : shapes;
    const digitCount = parts => { let end = 1; while (/^\p{N}+$/u.test(parts[end] || '')) end++; return end - 1; };
    const limit = possible.length ? Math.max(...possible.map(digitCount)) : Infinity;
    let end = i + 2;
    while (end < terms.length && end - i - 1 < limit && /^\p{N}+$/u.test(terms[end])) end++;
    const hasSuffix = !possible.length || possible.some(parts => /^\p{L}{1,2}$/u.test(parts[digitCount(parts) + 1] || ''));
    if (hasSuffix && end < terms.length && /^\p{L}{1,2}$/u.test(terms[end])) end++;
    groups.push(terms.slice(i, end).join(' '));
    i = end - 1;
  }
  return groups;
}

function scoreFields(fields, query) {
  const text = normalize(query);
  if (!text) return null;
  const compact = text.replace(/ /g, '');
  fields = fields.filter((item) => item.text);
  if (fields.some((item) => item.text === text)) return 1000;
  if (fields.some((item) => item.compact === compact)) return 950;

  // Formatting may separate a phone number into several pieces, but reordered,
  // missing, or changed digits must never become a fuzzy match.
  if (/^\d+$/.test(compact)) {
    return fields.some((item) => item.words.includes(compact)) ? 100 : null;
  }

  // Every structured identifier must occur in one field. Never assemble a plate
  // from its letters plus digits belonging to a different set code or contact.
  for (const identifier of identifierGroups(text, fields)) {
    const identifierWords = words(identifier).join(' ');
    if (!fields.some((item) => item.compact === identifier.replace(/ /g, '')
      || (' ' + item.words.join(' ') + ' ').includes(' ' + identifierWords + ' '))) return null;
  }

  const terms = words(text);
  const scores = [];
  for (const term of terms) {
    let best = null;
    for (const item of fields) {
      // Also support an unformatted phone number inside a multi-word query.
      if (term === item.compact) best = Math.max(best ?? 0, 100);
      for (const candidate of item.words) {
        const score = wordScore(term, candidate, item.exactOnly);
        if (score !== null) best = Math.max(best ?? 0, score);
      }
    }
    if (best === null) return null;
    scores.push(best);
  }
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const phrase = fields.some((item) => (' ' + item.words.join(' ') + ' ').includes(' ' + terms.join(' ') + ' '));
  return phrase ? 200 + average / 100 : Math.min(...scores) + average / 100;
}

/** Positive score (higher is better), or null. Every query word must match.
 * Values containing digits are exact-only; short words never match fuzzily.
 * Punctuation/spacing variants match, but digit edits do not.
 */
export function matchScore(values, query) {
  const items = Array.isArray(values) ? values : [values];
  return scoreFields(items.map((value) => field(value)), query);
}

function ranked(rows, scoreRow) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({ row, index, score: scoreRow(row) }))
    .filter((item) => item.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.row);
}

/** Returns original storage-set rows, ranked without changing the input. */
export function searchSets(rows, query) {
  return ranked(rows, (row) => {
    if (!row) return null;
    const vehicle = row.vehicle || {};
    const customer = vehicle.customer || {};
    const fields = [
      field(row.public_code, true), field(customer.name, false),
      field(customer.phone, true), field(customer.email, true), field(vehicle.plate, true),
      field(vehicle.make, false), field(vehicle.model, false),
      field(row.season, false), field(SEASON_NAMES[row.season], false),
      ...[row.zone, row.rack, row.shelf, row.slot].map((value) => field(value)),
      field([row.zone, row.rack, row.shelf, row.slot].filter((value) => value != null && value !== '').join(' '))
    ];
    for (const tire of Array.isArray(row.tires) ? row.tires : []) {
      if (!tire) continue;
      fields.push(field(tire.size, true), field(tire.brand, false), field(tire.model, false), field(tire.dot_code, true));
    }
    return scoreFields(fields, query);
  });
}

/** Exact means normalized full-name equality, never an automatic selection.
 * Candidates exclude exact rows and retain every partial/fuzzy match for caller
 * disambiguation. Duplicate names remain separate original customer records.
 */
export function customerCandidates(rows, query) {
  const text = normalize(query);
  if (!text) return { exact: [], candidates: [] };
  const customers = (Array.isArray(rows) ? rows : []).filter((row) => row && normalize(row.name));
  const exact = customers.filter((row) => normalize(row.name) === text);
  const candidates = ranked(customers.filter((row) => normalize(row.name) !== text),
    (row) => matchScore([row.name], query));
  return { exact, candidates };
}
