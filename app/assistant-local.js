// ASC's provider-free task assistant. This is a bounded intent matcher over
// authorized app data, not a general language model. It never saves a record.
import { normalize, matchScore, searchSets } from './agent-search.js';

const APP = new URL('./', import.meta.url);
const STATUS = { in_storage: 'na skladištu', reserved: 'rezervirano', checked_out: 'preuzeto', missing: 'nedostaje' };
const SEASON = { winter: 'zimske', summer: 'ljetne', all_season: 'cjelogodišnje' };
const ROUTES = {
  dashboard: ['dashboard.html', 'Ploča', ['ploca', 'dashboard', 'pocetna']],
  customers: ['customers.html', 'Kupci', ['kupci', 'kupce', 'customers']],
  checkin: ['checkin.html', 'Zaprimanje', ['zaprimi', 'zaprimanje', 'prijam', 'check in']],
  warehouse: ['warehouse-preview/index.html', 'Probni prostorni pregled', ['skladiste', 'skladista', 'warehouse', 'sva skladista']],
  reminders: ['reminders.html', 'Podsjetnici', ['podsjetnici', 'podsjetnike', 'reminders']],
  scan: ['scan.html', 'Skeniranje', ['skeniraj', 'skeniranje', 'scan']]
};
const safeString = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const sameCode = (a, b) => normalize(a).replace(/ /g, '') === normalize(b).replace(/ /g, '');
const locationOf = row => [row.zone, row.rack, row.shelf, row.slot]
  .filter(value => value !== null && value !== undefined && value !== '').map(value => safeString(value, 60)).join(' · ');
const labelOf = row => [safeString(row.public_code, 100), safeString(row.vehicle?.customer?.name, 70), safeString(row.vehicle?.plate, 30)].filter(Boolean).join(' · ');
const demo = ctx => ctx?.page === 'warehouse-preview' || /demo|fictional|probni/i.test(String(ctx?.dataScope || ''));
function parseContext(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return { dataScope: 'unknown' }; } }
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : {};
}
function contextKey(ctx) {
  return JSON.stringify([ctx.page, ctx.setCode, ctx.customerId, ctx.area, ctx.selectedStack?.id, ctx.dataScope]);
}
function abort() { const error = new Error('Zahtjev je zaustavljen.'); error.name = 'AbortError'; return error; }
function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? value : null;
}
function localDate(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function leadCommand(q, commands) {
  const first = q.split(' ')[0];
  // Only command words tolerate edits; identifiers are left intact for search.
  return commands.some(word => word === first || (first.length >= 5 && matchScore([word], first) !== null));
}
function searchQuery(text) {
  let q = normalize(text).replace(/^(?:molim(?: te)?|please|mozes li|can you)\s+/, '');
  if (leadCommand(q, ['pronadi', 'potrazi', 'nadi', 'find', 'search', 'locate'])) q = q.replace(/^\S+\s*/, '');
  q = q.replace(/^(?:gdje\s+(?:su|je)|where\s+(?:are|is))\s+(?:the\s+)?/, '')
    .replace(/^(?:gume|gumu|guma|komplet|set|tyres|tires|tire set)\s+(?:od\s+|za\s+|for\s+|of\s+)?/, '')
    .replace(/^(?:kupca|kupac|customer|registracija|registraciju|plate|code|oznaka|oznaku)\s+/, '')
    .replace(/\s+(?:gume|guma|komplet|kompleti|tyres|tires|tire set)$/, '').trim();
  return q;
}
function pickupPeriod(q) {
  if (/^(?:kasna preuzimanja|preuzimanja koja kasne|overdue pickups)$/.test(q)) return 'overdue';
  const match = q.match(/^(?:preuzimanja|za preuzimanje|sto je za preuzimanje|koji kompleti su za preuzimanje|rokovi preuzimanja|due pickups|pickups(?: due)?|what is due)(?: (danas|sutra|today|tomorrow|(?:u )?(?:iducih|sljedecih) 7 dana|(?:in the |within |next )?7 days))?$/);
  if (!match) return null;
  return /danas|today/.test(match[1] || '') ? 'today' : /sutra|tomorrow/.test(match[1] || '') ? 'tomorrow' : 'week';
}

export function createLocalAssistant({ loadData, navigate, context, now = () => new Date() } = {}) {
  let revision = 0, previous = null, previousScope = null;
  const currentContext = () => parseContext(typeof context === 'function' ? context() : context);
  const go = navigate || (path => { location.href = new URL(path, APP).href; });
  const read = loadData || (async ({ signal, assertActive }) => {
    // db.js flushes queued writes when imported. Use only the app's existing
    // authenticated client here; a question must not initiate unrelated writes.
    const { supabase } = await import('../js/supabaseClient.js');
    assertActive();
    if (!supabase) throw new Error('client_unavailable');
    const auth = await supabase.auth.getSession(), session = auth?.data?.session;
    assertActive();
    if (auth?.error) throw auth.error;
    if (!session?.user?.id) { const error = new Error('Prijavi se za podatke skladišta.'); error.code = 'session_required'; throw error; }
    let query = supabase.from('storage_sets').select(`public_code, quantity, status, season,
      zone, rack, shelf, slot, expected_out_date,
      vehicle:vehicles (make, model, plate, customer:customers (id, name)),
      tires (size, brand, model, dot_code)`)
      .is('deleted_at', null).order('updated_at', { ascending: false }).limit(1000);
    if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal);
    const { data: rows, error } = await query;
    assertActive();
    if (error) throw error;
    // Reject a session change while inventory was loading. This projection is
    // ephemeral; no inventory or chat content is persisted by this module.
    const latest = (await supabase.auth.getSession())?.data?.session;
    assertActive();
    if (latest?.user?.id !== session.user.id) throw abort();
    return rows;
  });
  return {
    reset() { revision++; previous = null; previousScope = null; },
    async reply(text, options = {}) {
      const ticket = ++revision, ctx = parseContext(options.context ?? currentContext()), scope = contextKey(ctx);
      if (previousScope !== scope) previous = null;
      previousScope = scope;
      function assertActive() {
        if (ticket !== revision || options.signal?.aborted || options.isActive?.() === false) throw abort();
        if (context !== undefined && contextKey(currentContext()) !== scope) throw abort();
      }
      function wait(work) {
        assertActive();
        return new Promise((resolve, reject) => {
          const cancelled = () => reject(abort());
          options.signal?.addEventListener('abort', cancelled, { once: true });
          Promise.resolve().then(() => { assertActive(); return work(); }).then(value => {
            options.signal?.removeEventListener('abort', cancelled);
            try { assertActive(); resolve(value); } catch (error) { reject(error); }
          }, error => { options.signal?.removeEventListener('abort', cancelled); reject(error); });
        });
      }
      function action(label, path) { return { label, run() { assertActive(); return go(path); } }; }
      const defaults = () => [
        { label: 'Pronađi gume', prompt: 'Pronađi gume ' },
        { label: 'Stanje', prompt: 'Koliko kompleta imamo?', submit: true },
        action('Zaprimi komplet', 'checkin.html')
      ];
      const result = (message, actions = defaults()) => { assertActive(); return { text: message, actions }; };
      function setActions(row) {
        const code = safeString(row.public_code, 100);
        return code ? [action(code + ' · Detalji', 'set-detail.html?code=' + encodeURIComponent(code)),
          { label: code + ' · Lokacija', prompt: 'Gdje je komplet ' + code + '?', submit: true }] : [];
      }
      function describe(row) {
        const quantity = Number.isInteger(row.quantity) && row.quantity >= 0 ? `${row.quantity} guma` : 'količina nije upisana';
        const state = STATUS[row.status] || 'status nije poznat';
        const loc = locationOf(row);
        return `${labelOf(row) || 'Komplet bez oznake'}\n${quantity} · ${SEASON[row.season] || 'sezona nije upisana'} · ${state}.\n${row.status === 'checked_out' ? 'Evidentirana prijašnja lokacija' : 'Evidentirana lokacija'}: ${loc || 'nije upisana'}.`;
      }
      function showMatches(hits, query) {
        previous = null;
        if (!hits.length) return result(`Nema podudaranja za „${safeString(query)}” među učitanim kompletima. Provjeri ime, registraciju ili točnu oznaku.`);
        if (hits.length === 1) {
          previous = safeString(hits[0].public_code, 100) || null;
          return result(describe(hits[0]), setActions(hits[0]));
        }
        const actions = hits.filter(row => row.public_code).slice(0, 4).map(row => ({
          label: labelOf(row), prompt: 'Prikaži komplet ' + safeString(row.public_code, 100), submit: true
        }));
        return result(`Pronađeno je ${hits.length} kompleta. Odaberi točnu oznaku${hits.length > 4 ? '; prikazana su prva četiri, dodaj registraciju za uži izbor' : ''}.`, actions);
      }
      assertActive();
      const raw = safeString(text, 2000), q = normalize(raw).replace(/^(?:molim(?: te)?|please|mozes li|can you)\s+/, '');
      const customerFollowup = /^(?:gdje su )?(?:njegove|njezine|njene|kupceve) gume$|^(?:where are )?this customer(?: s|s)? (?:tyres|tires)$/.test(q);
      const selectedSetFollowup = /\b(?:ovaj komplet|o ovome|explain this|explain selected)\b/.test(q);
      const followup = /^(?:gdje (?:su|je)(?: (?:oni|one|ovo|taj komplet))?|where (?:are they|is it)|(?:reci mi |pokazi |prikazi |objasni )?(?:o ovome|ovaj komplet|taj komplet)|explain (?:this|selected)(?: set)?|(?:gdje su )?(?:njegove|njezine|njene|kupceve) gume|(?:where are )?this customer(?: s|s)? (?:tyres|tires))$/.test(q);
      // A fresh search supersedes the previous referent before loading starts.
      // Failed/unsupported requests must not leave an older customer as "they".
      if (!followup) previous = null;
      // The warehouse preview has its own adapter and fictional inventory.
      // Unhandled preview questions never import live db.js or show live actions.
      if (demo(ctx) || ctx.dataScope === 'unknown') return result('Ovo je probni prikaz. Pitaj za probnu oznaku stupca, slobodna mjesta ili odaberi stupac na karti. Stvarne kupce ovdje ne pretražujem.', [
        { label: 'Slobodna mjesta', prompt: 'Gdje ima slobodnih mjesta?', submit: true },
        { label: 'Sva skladišta', prompt: 'Sva skladišta', submit: true }
      ]);
      if (!q || /^(?:pomoc|help|sto mozes(?: uciniti)?|kako koristiti(?: asc)?|what can you do|bok|hello|hi)$/.test(q)) return result('Mogu pretražiti ASC komplete, pokazati evidentiranu lokaciju, stanje i rokove te otvoriti obrazac. Radim bez vanjskog AI modela; promjene potvrđuješ u aplikaciji.');
      const routeQuery = q.replace(/^(?:otvori|pokazi|prikazi|idi na|odi na|open|go to|show)\s+/, '');
      const route = Object.values(ROUTES).find(([, , aliases]) => aliases.includes(routeQuery));
      if (route) { assertActive(); go(route[0]); return { text: `Otvaram: ${route[1]}.`, actions: [] }; }
      if (/^(?:dodaj|zaprimi|unesi|create|add|check in)\b/.test(q)) {
        if (/^(?:dodaj|zaprimi|unesi|create|add|check in)\s+(?:(?:novi|novu|nove|new|a|an|the)\s+)*(?:gumu|gume|guma|komplet|set|tyres?|tires?)\b/.test(q)) return result('Mogu otvoriti zaprimanje kompleta. Unesi ili provjeri podatke i potvrdi spremanje u obrascu. Još ništa nije spremljeno.', [action('Otvori zaprimanje', 'checkin.html')]);
        return result('Tu vrstu dodavanja ovdje ne podržavam. Mogu pripremiti prijam guma: napiši „Zaprimi novi komplet”. Za druge promjene otvori odgovarajući dio aplikacije. Ništa nije spremljeno.', [
          action('Kupci', 'customers.html'), action('Podsjetnici', 'reminders.html')
        ]);
      }
      if (/^(?:obrisi|izbrisi|ukloni|premjesti|prebaci|rezerviraj|naplati|posalji|spremi|potvrdi|delete|remove|move|reserve|send|save|charge)\b/.test(q)) {
        const code = safeString(ctx.setCode, 100);
        return result('Ovu promjenu treba provjeriti i potvrditi u aplikaciji. Ništa nisam promijenio. Najprije pronađi točan komplet.', code ? [{ label: 'Provjeri ' + code, prompt: 'Prikaži komplet ' + code, submit: true }] : defaults());
      }
      const counts = /^(?:stanje(?: skladista)?|kapacitet|inventory(?: overview| status)?|stock(?: status)?|koliko (?:imamo|ima|je)(?: (?:ukupno|na skladistu))?(?: (?:guma|kompleta|setova))?|koliko (?:guma|kompleta|setova)(?: (?:imamo|ima|je))?(?: (?:na skladistu|ukupno))?|how many (?:tires|tyres|sets)(?: do we have)?)(?: ukupno)?$/.test(q);
      const due = /\b(?:preuzimanj\p{L}*|preuzeti|pickups?|due)\b/u.test(q) && !/^(?:pronadi|find|search)\b/.test(q);
      const period = due ? pickupPeriod(q) : null;
      const explicitSearch = leadCommand(q, ['pronadi', 'potrazi', 'nadi', 'find', 'search', 'locate']) || /^(?:gdje (?:su|je)|where (?:are|is)|prikazi komplet|pokazi komplet|show set|explain set)\b/.test(q);
      let query = searchQuery(raw).replace(/^(?:prikazi|pokazi|show|explain)\s+(?:komplet|set)\s+/, '');
      let selectedCustomer = null;
      if (due && !period) return result('To razdoblje ili kombinaciju kupca i roka još ne mogu pouzdano protumačiti. Odaberi rok za sve učitane komplete ili zasebno pronađi kupca.', [
        { label: 'Danas · svi', prompt: 'Preuzimanja danas', submit: true }, { label: 'Sutra · svi', prompt: 'Preuzimanja sutra', submit: true },
        { label: '7 dana · svi', prompt: 'Preuzimanja u idućih 7 dana', submit: true }, { label: 'Pronađi kupca', prompt: 'Pronađi gume ' }
      ]);
      // Bare names/codes are supported, but unsupported prose must not trigger
      // arbitrary actions or be represented as answered by a general AI.
      if (!counts && !due && !followup && !explicitSearch && (query.split(' ').length > 6 || /^(?:why|how|what|zasto|kako|sto|napisi|write|calculate|izracunaj)\b/.test(q))) return result('To pitanje još ne mogu pouzdano odgovoriti bez jezičnog modela. Mogu provjeriti ASC komplete, lokacije, stanje i rokove. Napiši npr. „Pronađi gume Marko” ili odaberi radnju.');
      if (followup) {
        query = customerFollowup ? '' : safeString(selectedSetFollowup ? ctx.setCode : previous || ctx.setCode, 100);
        selectedCustomer = !query && !selectedSetFollowup && safeString(ctx.customerId, 100);
        if (!query && !selectedCustomer) return result('Na koji komplet misliš? Upiši oznaku, ime kupca ili registraciju.');
      }
      if (!query && !counts && !due && !selectedCustomer) return result('Koga ili što tražiš? Dodaj ime kupca, registraciju ili oznaku kompleta.');
      let rows;
      try {
        const loaded = await wait(() => read({ signal: options.signal, context: ctx, assertActive }));
        rows = Array.isArray(loaded) ? loaded : loaded?.sets;
        if (!Array.isArray(rows)) throw new Error('invalid_projection');
        rows = rows.filter(row => row && !row.deleted_at);
      } catch (error) {
        assertActive();
        if (error.name === 'AbortError') throw error;
        return result(error.code === 'session_required' ? 'Prijavi se za podatke skladišta. Nijedan komplet nije učitan.' : 'Podatke nisam uspio učitati. Pokušaj ponovno; ne mogu zaključiti da je skladište prazno.', [
          { label: 'Pokušaj ponovno', prompt: raw, submit: true }
        ]);
      }
      if (counts) {
        previous = null;
        const total = rows.length, status = key => rows.filter(row => row.status === key).length;
        const known = rows.filter(row => Object.hasOwn(STATUS, row.status)).length;
        const quantityScope = /\bna skladistu\b/.test(q) ? rows.filter(row => row.status === 'in_storage') : rows;
        const quantities = quantityScope.filter(row => Number.isInteger(row.quantity) && row.quantity >= 0);
        const tyreTotal = quantities.reduce((sum, row) => sum + row.quantity, 0);
        const tyres = /\b(?:guma|tires|tyres)\b/.test(q) ? ` Evidentirano guma${quantityScope !== rows ? ' u statusu na skladištu' : ''}: ${tyreTotal}${quantities.length < quantityScope.length ? `; ${quantityScope.length - quantities.length} kompleta nema valjanu količinu` : ''}.` : '';
        return result(`Među učitanim kompletima: ${total}. Na skladištu: ${status('in_storage')}, rezervirano: ${status('reserved')}, preuzeto: ${status('checked_out')}, nedostaje: ${status('missing')}${known < total ? `, bez poznatog statusa: ${total - known}` : ''}.${tyres} To nije potvrda slobodnog kapaciteta.`, [
          { label: 'Preuzimanja', prompt: 'Što je za preuzimanje u idućih 7 dana?', submit: true }, action('Skladište · probni pregled', 'warehouse-preview/index.html')
        ]);
      }
      if (due) {
        previous = null;
        const today = new Date(now());
        if (!Number.isFinite(+today)) return result('Današnji datum nije dostupan. Rokove provjeri u Podsjetnicima.', [action('Podsjetnici', 'reminders.html')]);
        const day = localDate(today), end = new Date(today);
        const tomorrow = period === 'tomorrow', onlyToday = period === 'today';
        const overdue = period === 'overdue';
        end.setDate(end.getDate() + (tomorrow ? 1 : onlyToday || overdue ? 0 : 7));
        const until = localDate(end);
        const hits = rows.filter(row => ['in_storage', 'reserved'].includes(row.status) && dateOnly(row.expected_out_date))
          .filter(row => tomorrow ? row.expected_out_date === until : onlyToday ? row.expected_out_date === day : overdue ? row.expected_out_date < day : row.expected_out_date <= until)
          .sort((a, b) => a.expected_out_date.localeCompare(b.expected_out_date));
        const window = tomorrow ? until : onlyToday ? day : overdue ? `prije ${day}` : `do ${until} (uključuje ranije rokove)`;
        return result(hits.length ? `Među učitanim kompletima, rokovi ${window}: ${hits.length}.\n` + hits.slice(0, 4).map(row => `${labelOf(row)} · ${row.expected_out_date}`).join('\n')
          : `Među učitanim kompletima nema upisanih rokova ${window}. Današnji datum uređaja: ${day}.`, hits.length ? hits.slice(0, 4).flatMap(row => setActions(row).slice(0, 1)) : [action('Podsjetnici', 'reminders.html')]);
      }
      if (selectedCustomer) return showMatches(rows.filter(row => row.vehicle?.customer?.id === selectedCustomer), 'odabrani kupac');
      const exact = rows.filter(row => row.public_code && sameCode(row.public_code, query));
      let hits = exact.length ? exact : searchSets(rows, query);
      // Common Croatian possessives ("Markove gume", "Ivanove gume") are
      // search candidates only. Multiple matches always require selection.
      if (!hits.length && /^[\p{L}]+ove(?: [\p{L}]+)?$/u.test(query)) {
        const stems = [query.replace(/ove\b/u, 'o'), query.replace(/ove\b/u, '')];
        hits = [...new Set(stems.flatMap(value => searchSets(rows, value)))];
      }
      return showMatches(hits, query);
    }
  };
}
