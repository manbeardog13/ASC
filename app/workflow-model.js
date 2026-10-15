// One vocabulary of next steps. Proposals describe real routes or registered
// page actions; they never perform inventory writes or invent availability.
const link = (id, label, href, write = false) => ({ id, label, href, write });
const command = (id, label, write = false) => ({ id, label, command: id, write });
const intake = () => link('intake', 'Zaprimi komplet', 'checkin.html', true);
const find = () => link('find', 'Pronađi komplet', 'locate.html');
const scan = () => link('scan', 'Skeniraj oznaku', 'scan.html');
const pickups = () => link('pickups', 'Otvori preuzimanja', 'reminders.html');
const record = code => link('record', 'Otvori komplet', 'set-detail.html?code=' + encodeURIComponent(code));
const place = code => link('place', 'Smjesti komplet', 'place.html?set=' + encodeURIComponent(code), true);
const checkout = code => link('checkout', 'Pripremi preuzimanje', 'checkout.html' + (code ? '?set=' + encodeURIComponent(code) : ''), true);
export const canWrite = role => ['admin', 'manager', 'employee', 'reception'].includes(role);

export function pageFromPath(path) {
  if (/\/warehouse-preview(?:\/|$)/.test(path)) return 'spatial';
  return String(path).split('/').pop().replace(/\.html$/, '') || 'dashboard';
}

export function proposals(context = {}, available = []) {
  const c = context, code = c.set?.public_code, live = c.set && c.set.status !== 'checked_out';
  let title = 'Što je sljedeće?', actions = [intake(), find(), checkout()];
  switch (c.page) {
    case 'dashboard':
      title = c.dataState === 'error' ? 'Podaci nisu osvježeni. Možete nastaviti pretragom.' : 'Krenimo od onoga što trebate.';
      if (c.unplacedCode) { title = 'Komplet čeka svoje mjesto.'; actions = [place(c.unplacedCode), find(), intake()]; }
      else if (c.due > 0) { title = 'Pripremite nadolazeća preuzimanja.'; actions = [pickups(), intake(), find()]; }
      break;
    case 'checkin':
      title = c.step === 3 ? 'Spremljeno. Još odaberite mjesto.' : c.step === 2 ? 'Provjerite gume, zatim spremite komplet.' : 'Najprije odaberite kupca i vozilo.';
      actions = c.step === 3 && code
        ? [place(code), command('print', 'Ispiši naljepnicu'), record(code)]
        : [command('intake-next', c.step === 2 ? 'Spremi i nastavi' : 'Nastavi na gume', true), command('find-customer', 'Pronađi kupca'), command('enter-plate', 'Upiši registraciju')];
      if (c.editing) { title = 'Uredite podatke pa spremite promjene.'; actions = [command('intake-next', 'Spremi promjene', true), find()]; }
      if (c.step === 3 && code && c.noSlots) { title = 'Komplet je spremljen. Uvedite mjesta za smještaj.'; actions = [link('setup-slots', 'Uvedi mjesta', 'locations.html?return=' + encodeURIComponent('checkin.html?place=' + encodeURIComponent(code)), true), command('print', 'Ispiši naljepnicu'), record(code)]; }
      break;
    case 'set-detail':
      title = code ? code + ' · ' + (live ? 'Odaberite sljedeći korak.' : 'Preuzimanje je završeno.') : 'Pronađite komplet za nastavak.';
      actions = code ? (live
        ? [c.set.location_id || c.set.slot ? checkout(code) : place(code), command('print', 'Ispiši naljepnicu'), link('owner', 'Otvori kupca', 'customers.html?id=' + encodeURIComponent(c.set.vehicle?.customer?.id || ''))]
        : [command('print', 'Ispiši naljepnicu'), intake(), find()]) : [find(), scan()];
      break;
    case 'place':
      title = code ? (c.noSlots ? 'Najprije uvedite mjesta u skladištu.' : c.slotQr ? 'Provjerite odabrano mjesto pa potvrdite.' : 'Predložimo slobodno mjesto za ovaj komplet.') : 'Skenirajte ili upišite oznaku kompleta.';
      actions = code ? [
        c.slotQr ? command('confirm-place', c.set.location_id ? 'Potvrdi premještaj' : 'Potvrdi smještaj', true) : command('suggest-place', 'Predloži mjesto', true),
        command('type-code', c.slotQr ? 'Promijeni mjesto' : 'Upiši oznaku mjesta'), record(code)
      ] : [command('type-code', 'Upiši oznaku'), find()];
      if (c.noSlots && code) actions = [link('setup-slots', 'Uvedi mjesta', 'locations.html?return=' + encodeURIComponent('place.html?set=' + encodeURIComponent(code)), true), record(code)];
      if (code && !live) { title = 'Ovaj je komplet već preuzet.'; actions = [record(code), find()]; }
      break;
    case 'checkout':
      title = code ? (live ? 'Provjerite komplet. Preuzimanje traži potvrdu.' : 'Ovaj je komplet već preuzet.') : 'Koji komplet kupac preuzima?';
      actions = code ? [live && command('confirm-checkout', 'Potvrdi preuzimanje', true), record(code), find()] : [command('type-code', 'Upiši oznaku'), find(), pickups()];
      break;
    case 'locate':
      title = c.query ? (c.resultCount ? 'Otvorite pronađeni komplet za nastavak.' : 'Pokušajte ime, registraciju ili oznaku.') : 'Ime, registracija ili oznaka — jedan korak do kompleta.';
      actions = [c.resultCode ? record(c.resultCode) : command('search', 'Upiši pretragu'), scan(), intake()];
      break;
    case 'customers': title = 'Od kupca do vozila i njegovih kompleta.'; actions = [command('search', 'Pronađi kupca'), intake(), scan()]; break;
    case 'scan': title = 'Skenirajte oznaku za otvaranje kompleta.'; actions = [find(), intake(), pickups()]; break;
    case 'reminders': title = 'Otvorite komplet i pripremite preuzimanje.'; actions = [checkout(), find(), intake()]; break;
    case 'workshop': title = 'Pronađite vozilo ili nastavite zaprimanje.'; actions = [command('search', 'Pronađi vozilo'), intake(), pickups()]; break;
    case 'spatial': title = 'Prostorni pregled koristi lokalne probne podatke.'; actions = [find(), link('slots', 'Stvarna mjesta', 'locations.html'), link('board', 'Vrati se na ploču', 'dashboard.html')]; break;
    case 'locations': title = 'Mjesta povezuju zaprimanje i pronalazak kompleta.'; actions = [intake(), find(), scan()]; break;
    default: actions = [find(), intake(), link('board', 'Otvori ploču', 'dashboard.html')];
  }
  actions = actions.filter(Boolean).filter(a => (!a.write || canWrite(c.role)) && (!a.command || available.includes(a.command)));
  if (!actions.length) actions = [find(), scan()];
  return { title, actions: actions.slice(0, 3) };
}

// Only explicit navigation phrases skip the model. Questions and ambiguous
// requests still go to the existing intelligence and its server-side policies.
export function navigationForText(text, role) {
  const value = String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').trim().replace(/[.!?]+$/, '');
  const routes = [
    [/^(zaprimi( novi)? (komplet|set)|novo zaprimanje)$/, intake()],
    [/^(pronadi( komplet| set)?|otvori pretragu)$/, find()],
    [/^(skeniraj( oznaku| qr)?)$/, scan()],
    [/^(otvori )?(podsjetnike|preuzimanja)$/, pickups()],
    [/^otvori (kupce|bazu kupaca)$/, link('customers', 'Otvori kupce', 'customers.html')],
    [/^(otvori plocu|pocetna)$/, link('board', 'Otvori ploču', 'dashboard.html')],
  ];
  return routes.find(([pattern, action]) => pattern.test(value) && (!action.write || canWrite(role)))?.[1] || null;
}
