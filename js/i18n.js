// ============================================================================
// i18n.js — English / Croatian. `t(key, vars)` returns the string for the
// active language; {placeholders} are filled from `vars`. Croatian is written
// for the tire-shop domain (gume, skladište, zaprimi, preuzeto…), not machine
// translation. Language is persisted and switchable at runtime.
// ============================================================================

const LANG_KEY = "asc.lang";
export const LANGS = [
  { code: "en", label: "EN", name: "English" },
  { code: "hr", label: "HR", name: "Hrvatski" },
];

let current = (() => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "hr") return saved;
  } catch { /* ignore */ }
  // Croatian shop → default to HR. Users can switch to EN with the toggle; the
  // choice is remembered (localStorage), so this only affects first load.
  return "hr";
})();

const listeners = new Set();
export function lang() { return current; }
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setLang(code) {
  if (code !== "en" && code !== "hr" || code === current) return;
  current = code;
  try { localStorage.setItem(LANG_KEY, code); } catch { /* ignore */ }
  document.documentElement.lang = code;
  listeners.forEach((fn) => { try { fn(code); } catch (e) { console.error(e); } });
}

export function t(key, vars) {
  let str = (DICT[current] && DICT[current][key]) ?? DICT.en[key] ?? key;
  if (vars) for (const k in vars) str = str.replaceAll(`{${k}}`, vars[k]);
  return str;
}

// Croatian plural class: 0=one, 1=few (2–4), 2=many (5+/0).
function slavicIndex(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 0;
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return 1;
  return 2;
}
const NOUNS = {
  sets:  { en: (n) => (n === 1 ? "set" : "sets"),  hr: (n) => ["komplet", "kompleta", "kompleta"][slavicIndex(n)] },
  tires: { en: (n) => (n === 1 ? "tire" : "tires"), hr: (n) => ["guma", "gume", "guma"][slavicIndex(n)] },
};
// Localized noun for a count, e.g. `${n} ${noun(n, "sets")}`.
export function noun(n, key) { return (NOUNS[key][current] || NOUNS[key].en)(n); }

const DICT = {
  en: {
    // chrome / nav
    "nav.home": "Home", "nav.checkin": "Check in", "nav.scan": "Scan",
    "nav.warehouse": "Warehouse", "nav.customers": "Customers", "nav.users": "Users",
    "menu.users": "Users", "menu.reminders": "Pickup reminders", "menu.recycle": "Recycle bin", "menu.export": "Export CSV",
    "menu.signedInAs": "Signed in · {role}", "menu.signout": "Sign out",
    "menu.workshop": "Workshop mode",
    // Workshop mode (big-button shop-floor UI)
    "ws.title": "Workshop", "ws.exit": "Exit", "ws.enter": "Workshop mode",
    "ws.enterSub": "Big buttons + voice, for the shop floor",
    "ws.voiceFind": "Find by voice", "ws.sayIt": "Tap, then say the plate, name or code",
    "ws.due": "Pickups due", "ws.noResults": "Nothing found for “{q}”",
    "ws.denied": "Workshop mode is for employees and administrators.",
    // Voice input
    "voice.fill": "Voice fill", "voice.listening": "Listening…",
    "voice.repeat": "Again", "voice.skip": "Skip", "voice.finish": "Done",
    "voice.done": "Voice fill finished — check the fields.",
    "voice.unsupported": "Voice input isn't supported in this browser.",
    "voice.micDenied": "Microphone access was denied — allow it in the browser settings.",
    "voice.error": "Speech recognition failed — please try again.",
    // In-app AI assistant
    "menu.assistant": "ASC Agent",
    "ag.title": "ASC Agent", "ag.send": "Send", "ag.newChat": "New conversation",
    "ag.placeholder": "Ask about sets, customers… or dictate a new set",
    "ag.hello": "Hi! Ask me anything about the warehouse — or tell me a new tire set to store and I'll fill it in for you.",
    "ag.thinking": "Thinking…", "ag.working": "Checking the database…",
    "ag.hold": "Press & hold to talk — release to send", "ag.holdShort": "HOLD TO TALK",
    "ag.enterSub": "Ask anything — or dictate a new set",
    "ag.helloName": "Hi {name}! Ask me anything about the warehouse — or dictate a new tire set and I'll fill it in for you.",
    // Personal greetings
    "hello.morning": "Good morning", "hello.day": "Good afternoon", "hello.evening": "Good evening",
    "hello.signin": "Hi, {name}! Good to see you.",
    "ag.speakToggle": "Read answers aloud", "ag.speakOn": "Voice on", "ag.speakOff": "Voice off",
    "ag.reviewTitle": "New tire set — please confirm",
    "ag.confirmCreate": "Create set",
    "ag.suggest1": "How many sets are in storage?",
    "ag.suggest2": "Who is due for pickup this week?",
    "ag.suggest3": "Store a new set for a customer",
    "ag.setup": "The assistant isn't set up yet — deploy the asc-agent function and set the free GEMINI_API_KEY secret (see supabase/functions/asc-agent).",
    "ag.error": "The assistant hit a problem — please try again.",
    "ag.busy": "Too many requests at once (free tier allows ~10/min) — wait a minute and try again.",
    "ag.tooLong": "This conversation got too long — tap the trash icon to start a new one.",
    "conn.online": "Online", "conn.offline": "Offline", "conn.syncing": "Syncing {n}", "conn.queued": " · {n} queued",
    // setup / login
    "setup.body": "Not connected to a database yet. Add your Supabase details in js/config.js, then reload. Full steps are in SETUP.md.",
    "login.email": "Email", "login.password": "Password", "login.signin": "Sign in",
    "login.createAccount": "Create account", "login.haveAccount": "Have an account? Sign in",
    "login.newHere": "First time? Create account", "login.signupCta": "Create account",
    "login.signupDone": "Account created. Check your email to confirm it, then sign in.",
    "login.minPass": "Use at least 6 characters for the password.",
    "login.remember": "Remember me", "login.forgot": "Forgot password?",
    "login.google": "Continue with Google", "login.firstTime": "First time here?", "login.or": "or",
    "login.showPw": "Show password", "login.hidePw": "Hide password",
    "login.forgotSent": "Reset link sent — check your email.", "login.forgotNeedEmail": "Enter your email first.",
    // access gate (signed in but no role yet / removed)
    "gate.title": "Access pending", "gate.body": "Your account doesn't have access yet. Ask an admin to grant you a role, then sign in again.",
    // name gate + signup name fields
    "login.firstName": "First name", "login.lastName": "Last name",
    "login.nameRequired": "Enter your first and last name.",
    "namegate.title": "Introduce yourself", "namegate.body": "Tell us your first and last name so the team knows who's who.",
    "namegate.submit": "Continue",
    // users / access management
    "users.title": "Users", "users.sub": "Everyone with access to ASC.",
    "users.add": "Add user", "users.fullName": "Full name", "users.email": "Email", "users.role": "Role",
    "users.roleAdmin": "Admin", "users.roleUser": "User",
    "users.roleHint": "Admins can manage users and everything in the app. Users run the shop but can't manage accounts.",
    "users.addSubmit": "Add user",
    "users.added": "{name} added. They can create their account with this email on the login screen.",
    "users.addedNoName": "User added. They can create their account with this email on the login screen.",
    "users.pending": "Pending — hasn't signed in yet", "users.owner": "Owner", "users.you": "You",
    "users.ownerLocked": "The owner account can't be removed or changed.",
    "users.remove": "Remove", "users.removeQ": "Remove {name}?",
    "users.removeBody": "They lose access immediately. You can add them again later.",
    "users.removed": "{name} removed", "users.roleChanged": "Role updated",
    "users.edit": "Edit", "users.nameUpdated": "Name updated.",
    "users.makeAdmin": "Make admin", "users.makeUser": "Make user",
    "users.emptyTitle": "No users yet", "users.emptyBody": "Add your first teammate to get started.",
    "users.nameRequired": "Full name is required.", "users.emailInvalid": "Enter a valid email address.",
    "users.exists": "That email is already a user — change their role below.",
    "users.notAdmin": "Only admins can manage users.", "users.readOnlyNote": "Only admins can add or remove users.",
    "users.noName": "Unnamed", "users.invited": "Invite sent to {name}.",
    "users.awaitingTitle": "Awaiting approval", "users.awaitingSub": "These people signed in but don't have access yet.",
    "users.approveUser": "Approve as User", "users.approveAdmin": "Approve as Admin", "users.reject": "Reject",
    "users.approved": "{name} approved", "users.rejectQ": "Reject {name}?",
    "users.rejectBody": "They won't get access. You can invite them again later.",
    // set password (after an emailed invite / reset link)
    "setpw.title": "Set your password", "setpw.body": "Choose a password to finish setting up your account.",
    "setpw.new": "New password", "setpw.confirm": "Confirm password", "setpw.submit": "Save & continue",
    "setpw.mismatch": "Passwords don't match.", "setpw.done": "Password set — welcome!",
    // statuses
    "status.in_storage": "Stored", "status.reserved": "Reserved", "status.checked_out": "Picked up", "status.missing": "Missing",
    "statusAction.reserved": "Reserve for pickup", "statusAction.checked_out": "Mark picked up",
    "statusAction.in_storage": "Store again", "statusAction.found": "Mark found & stored",
    "status.now": "Now {status}",
    // seasons
    "season.winter": "Winter", "season.summer": "Summer", "season.all_season": "All-season",
    // location
    "loc.zone": "Zone", "loc.rack": "Rack", "loc.shelf": "Shelf", "loc.slot": "Slot",
    "loc.none": "No location yet", "loc.noneShort": "No location", "loc.title": "Location", "sd.rimsWord": "rims",
    // payment
    "pay.paid": "Paid", "pay.unpaid": "Unpaid",
    // common
    "common.back": "Back", "common.home": "Home", "common.cancel": "Cancel", "common.confirm": "Confirm",
    "common.loading": "Loading…", "common.save": "Save", "common.notFound": "Not found",
    "time.now": "just now", "time.min": "{n}m ago", "time.hour": "{n}h ago",
    // dashboard
    "dash.search": "Search name, plate, size, DOT, location…",
    "dash.inventory": "Inventory", "dash.checkedInToday": "Checked in today", "dash.pickedUpToday": "Picked up today",
    "dash.inStorage": "In storage", "dash.reservedN": "{n} reserved", "dash.dueSoon": "Due soon", "dash.next7": "next 7 days",
    "dash.connection": "Connection", "dash.pendingSync": "Pending sync", "dash.lastBackup": "Last backup", "dash.backupNotYet": "Not yet",
    "dash.dueForPickup": "Due for pickup soon", "dash.remind": "Remind →", "dash.setsN": "{n} {sets}", "dash.shownOf": "{shown} of {total}",
    "dash.emptyTitle": "No tires stored yet", "dash.emptyBody": "Check in a customer's set to get started.", "dash.storeTires": "Store tires",
    "dash.showAll": "Show all", "dash.noneHere": "Nothing here", "dash.noneHereBody": "No sets match this filter right now.",
    "dash.noMatchTitle": "No matches", "dash.noMatchBody": "Nothing matches “{q}”. Try a plate, name, or DOT.",
    "dash.loadError": "{err}",
    // check-in
    "ci.title": "Store tires", "ci.customer": "Customer", "ci.name": "Name", "ci.phone": "Phone", "ci.email": "Email",
    "ci.vehicle": "Vehicle", "ci.make": "Make", "ci.model": "Model", "ci.year": "Year", "ci.plate": "License plate",
    "ci.season": "Season", "ci.location": "Location in warehouse", "ci.details": "Details",
    "ci.qty": "Number of tires", "ci.expectedPickup": "Expected pickup", "ci.onRims": "On rims / wheels",
    "ci.rimType": "Rim type", "ci.steel": "Steel", "ci.alloy": "Alloy", "ci.fee": "Storage fee", "ci.paid": "Paid", "ci.notes": "Notes",
    "ci.tires": "Tires", "ci.tiresHint": "Fill what you can — blanks are ignored.", "ci.scanSidewall": "Scan sidewall",
    "ci.cancel": "Cancel", "ci.submit": "Store tires", "ci.nameRequired": "Customer name is required.",
    "ci.dupWarn": "Possible duplicate — ", "ci.occupied": "is already at this location.",
    "ci.reading": "Reading sidewall…", "ci.readingPct": "Reading sidewall… {pct}%",
    "ci.ocrFail": "Couldn't read it clearly — get close so the size fills the photo, angle for side light, then retry (or type it in).",
    "ci.ocrEngine": "The sidewall reader couldn't start — check your connection and try again.",
    "ci.ocrFilled": "Filled tire {n}: {parts}. Please check it.",
    "ci.stored": "Stored {code}", "ci.printLabel": "Print label",
    "ci.reason.plate": "same plate", "ci.reason.phone": "same phone", "ci.reason.dot": "same DOT code",
    "part.size": "size {v}", "part.dot": "DOT {v}",
    // tire editor
    "tire.pos": "Position", "tire.size": "Tire size", "tire.tread": "Tread mm", "tire.dot": "DOT code",
    "tire.brand": "Brand (optional)", "tire.stud": "Studded",
    // set detail
    "sd.move": "Move", "sd.vehicle": "Vehicle", "sd.plate": "Plate", "sd.phone": "Phone", "sd.tires": "Tires",
    "sd.checkedIn": "Checked in", "sd.expectedOut": "Expected out",
    "sd.tiresTread": "Tires & tread", "sd.payment": "Payment", "sd.photos": "Condition photos", "sd.history": "History",
    "sd.openToLoad": "Open to load…", "sd.label": "Label", "sd.delete": "Delete", "sd.edit": "Edit",
    "sd.pos": "Pos", "sd.size": "Size", "sd.brand": "Brand", "sd.tread": "Tread",
    "sd.onRims": "On rims", "sd.qtyOnRims": "{qty} · on {rim}", "sd.storageFee": "Storage fee", "sd.markPaid": "Mark paid",
    "sd.paidUndo": "Paid — undo", "sd.noFee": "No fee set", "sd.noTireDetails": "No tire details recorded.",
    "sd.noSet": "No set called {code}.", "sd.backHome": "Back home",
    "sd.savedOffline": "Saved offline — will sync", "sd.markedPaid": "Marked paid ✓", "sd.markedUnpaid": "Marked unpaid",
    "sd.movedToBin": "{code} moved to recycle bin", "sd.undo": "Undo", "sd.restored": "Restored",
    "sd.locationUpdated": "Location updated", "sd.from": "From", "sd.to": "To", "sd.moveHere": "Move here",
    "sd.alreadyThere": "{code} is already there.", "sd.photoAdded": "Photo added", "sd.uploading": "Uploading…",
    "sd.addPhoto": "Add photo", "sd.noPhotos": "No photos yet.", "sd.deletePhotoQ": "Delete this photo?",
    "sd.photoDeleted": "Photo deleted", "sd.noHistory": "No history yet.",
    "edit.title": "Edit {code}", "edit.saved": "Saved",
    // audit
    "audit.created": "Set created", "audit.moved": "Location changed", "audit.status_changed": "Status changed",
    "audit.payment": "Payment updated", "audit.photo_added": "Photo added", "audit.photo_removed": "Photo removed",
    "audit.deleted": "Moved to recycle bin", "audit.restored": "Restored", "audit.purged": "Permanently deleted", "audit.updated": "Details updated",
    // scan
    "scan.title": "Scan a label", "scan.point": "Point the camera at a set's QR sticker.",
    "scan.takePhoto": "Take a photo instead", "scan.orType": "…or type a code (ASC-2026-0042)", "scan.open": "Open",
    "scan.tip": "Tip: a phone's built-in Camera app scans the sticker too — it opens the record automatically.",
    "scan.cantRead": "Couldn't read a code. Try a photo or type it in.",
    "scan.checksum": "Sticker checksum didn't match — double-check it's the right label.",
    "scan.cameraUnavail": "Live camera unavailable: {err}. Use “Take a photo” or type the code.",
    "scan.photoFail": "Couldn't read that photo: {err}",
    // warehouse
    "wh.title": "Warehouse", "wh.emptyTitle": "No located sets yet",
    "wh.emptyBody": "Give a set a Zone / Rack / Shelf / Slot when you check it in, and it appears on the map here.",
    "wh.zone": "Zone {z}", "wh.rack": "Rack {r}", "wh.shelf": "Shelf {s}", "wh.setsN": "{n} {sets}", "wh.filledN": "{n} filled", "wh.zones": "Zones",
    // customers
    "cust.title": "Customers", "cust.search": "Search name or phone…", "cust.emptyTitle": "No customers yet",
    "cust.emptyBody": "They're created automatically when you store a set.", "cust.noPhone": "No phone",
    "cust.setsN": "{n} {sets}", "cust.vehicles": "Vehicles", "cust.storedSets": "Stored sets",
    "cust.tireSets": "Tire sets", "cust.noActive": "No active sets.", "cust.notFound": "Customer not found",
    // recycle
    "rec.title": "Recycle bin", "rec.retention": "Deleted sets are kept for 30 days, then removed automatically.",
    "rec.emptyTitle": "Recycle bin is empty", "rec.emptyBody": "Deleted sets show up here so mistakes are easy to undo.",
    "rec.deletedOn": "Deleted {date}", "rec.restore": "Restore", "rec.delete": "Delete", "rec.restored": "Set restored",
    "rec.purgeQ": "Permanently delete {code}?", "rec.purgeBody": "This cannot be undone. The set, its tires and photos are gone for good.",
    "rec.deleteForever": "Delete forever", "rec.permDeleted": "Permanently deleted",
    // reminders
    "rem.title": "Pickup reminders", "rem.sub": "Sets due for pickup within 7 days. One tap to call, text, or email the customer.",
    "rem.allCaught": "All caught up", "rem.allCaughtBody": "No pickups are due in the next 7 days.",
    "rem.due": "Due {date}", "rem.remindedAgo": "reminded {ago}", "rem.call": "Call", "rem.text": "Text", "rem.email": "Email",
    "rem.mark": "Mark reminded", "rem.markAgain": "Reminded — mark again", "rem.marked": "Marked as reminded",
    "rem.message": "Hi {name}, your {season} tires ({code}) stored at ASC are due for pickup{when}. Please let us know when you'd like to collect them. Thank you!",
    "rem.messageWhen": " around {date}",
    "rem.nameFallback": "there",
  },
  hr: {
    "nav.home": "Početna", "nav.checkin": "Zaprimi", "nav.scan": "Skeniraj",
    "nav.warehouse": "Skladište", "nav.customers": "Kupci", "nav.users": "Korisnici",
    "menu.users": "Korisnici", "menu.reminders": "Podsjetnici za preuzimanje", "menu.recycle": "Koš za smeće", "menu.export": "Izvezi CSV",
    "menu.signedInAs": "Prijavljeni · {role}", "menu.signout": "Odjava",
    "menu.workshop": "Radionica",
    // Radionica (veliki gumbi za rad u radioni)
    "ws.title": "Radionica", "ws.exit": "Izlaz", "ws.enter": "Radionica",
    "ws.enterSub": "Veliki gumbi + glasovni unos, za rad u radioni",
    "ws.voiceFind": "Glasovno traženje", "ws.sayIt": "Dodirnite pa recite registraciju, ime ili kôd",
    "ws.due": "Za preuzimanje", "ws.noResults": "Ništa za „{q}”",
    "ws.denied": "Radionica je dostupna samo djelatnicima i administratorima.",
    // Glasovni unos
    "voice.fill": "Glasovni unos", "voice.listening": "Slušam…",
    "voice.repeat": "Ponovi", "voice.skip": "Preskoči", "voice.finish": "Gotovo",
    "voice.done": "Glasovni unos završen — provjerite polja.",
    "voice.unsupported": "Glasovni unos nije podržan u ovom pregledniku.",
    "voice.micDenied": "Pristup mikrofonu je odbijen — dopustite ga u postavkama preglednika.",
    "voice.error": "Prepoznavanje govora nije uspjelo — pokušajte ponovno.",
    // AI pomoćnik u aplikaciji
    "menu.assistant": "ASC Agent",
    "ag.title": "ASC Agent", "ag.send": "Pošalji", "ag.newChat": "Novi razgovor",
    "ag.placeholder": "Pitaj o setovima, kupcima… ili izdiktiraj novi set",
    "ag.hello": "Bok! Pitaj me bilo što o skladištu — ili mi izdiktiraj novi set guma i ispunit ću ga umjesto tebe.",
    "ag.thinking": "Razmišljam…", "ag.working": "Provjeravam bazu…",
    "ag.hold": "Pritisnite i držite za govor — pustite za slanje", "ag.holdShort": "DRŽI I GOVORI",
    "ag.enterSub": "Pitajte bilo što — ili izdiktirajte novi set",
    "ag.helloName": "Bok {name}! Pitaj me bilo što o skladištu — ili mi izdiktiraj novi set guma i ispunit ću ga umjesto tebe.",
    // Osobni pozdravi
    "hello.morning": "Dobro jutro", "hello.day": "Dobar dan", "hello.evening": "Dobra večer",
    "hello.signin": "Bok, {name}! Lijepo te vidjeti.",
    "ag.speakToggle": "Čitaj odgovore naglas", "ag.speakOn": "Glas uključen", "ag.speakOff": "Glas isključen",
    "ag.reviewTitle": "Novi set guma — molimo potvrdite",
    "ag.confirmCreate": "Kreiraj set",
    "ag.suggest1": "Koliko je setova na skladištu?",
    "ag.suggest2": "Tko je za preuzimanje ovaj tjedan?",
    "ag.suggest3": "Zaprimi novi set za kupca",
    "ag.setup": "Pomoćnik još nije postavljen — postavite funkciju asc-agent i besplatni tajni ključ GEMINI_API_KEY (upute: supabase/functions/asc-agent).",
    "ag.error": "Agent je naišao na problem — pokušaj ponovno.",
    "ag.busy": "Previše upita odjednom (besplatni paket dopušta ~10/min) — pričekaj minutu pa pokušaj ponovno.",
    "ag.tooLong": "Razgovor je postao predug — dodirni ikonu koša za novi razgovor.",
    "conn.online": "Na mreži", "conn.offline": "Bez mreže", "conn.syncing": "Sinkronizacija {n}", "conn.queued": " · {n} u redu",
    "setup.body": "Aplikacija još nije povezana s bazom. Unesite Supabase podatke u js/config.js, zatim osvježite. Cijeli postupak je u SETUP.md.",
    "login.email": "E-pošta", "login.password": "Lozinka", "login.signin": "Prijava",
    "login.createAccount": "Izradi račun", "login.haveAccount": "Već imate račun? Prijava",
    "login.newHere": "Prvi put? Izradite račun", "login.signupCta": "Izradi račun",
    "login.signupDone": "Račun je izrađen. Provjerite e-poštu i potvrdite ga, zatim se prijavite.",
    "login.minPass": "Lozinka mora imati barem 6 znakova.",
    "login.remember": "Zapamti me", "login.forgot": "Zaboravljena lozinka?",
    "login.google": "Nastavi s Googleom", "login.firstTime": "Prvi put ovdje?", "login.or": "ili",
    "login.showPw": "Prikaži lozinku", "login.hidePw": "Sakrij lozinku",
    "login.forgotSent": "Poveznica za ponovno postavljanje poslana — provjerite e-poštu.", "login.forgotNeedEmail": "Najprije unesite e-poštu.",
    "gate.title": "Pristup na čekanju", "gate.body": "Vaš račun još nema pristup. Zatražite od administratora da vam dodijeli ulogu, zatim se ponovno prijavite.",
    "login.firstName": "Ime", "login.lastName": "Prezime",
    "login.nameRequired": "Unesite ime i prezime.",
    "namegate.title": "Predstavite se", "namegate.body": "Recite nam svoje ime i prezime kako bi tim znao tko je tko.",
    "namegate.submit": "Nastavi",
    "users.title": "Korisnici", "users.sub": "Svi koji imaju pristup ASC-u.",
    "users.add": "Dodaj korisnika", "users.fullName": "Ime i prezime", "users.email": "E-pošta", "users.role": "Uloga",
    "users.roleAdmin": "Administrator", "users.roleUser": "Korisnik",
    "users.roleHint": "Administratori mogu upravljati korisnicima i cijelom aplikacijom. Korisnici vode poslovanje, ali ne mogu upravljati računima.",
    "users.addSubmit": "Dodaj korisnika",
    "users.added": "{name} dodan/a. Račun može izraditi s ovom e-poštom na zaslonu za prijavu.",
    "users.addedNoName": "Korisnik dodan. Račun može izraditi s ovom e-poštom na zaslonu za prijavu.",
    "users.pending": "Na čekanju — još se nije prijavio/la", "users.owner": "Vlasnik", "users.you": "Vi",
    "users.ownerLocked": "Vlasnički račun ne može se ukloniti ni mijenjati.",
    "users.remove": "Ukloni", "users.removeQ": "Ukloniti {name}?",
    "users.removeBody": "Odmah gube pristup. Možete ih ponovno dodati kasnije.",
    "users.removed": "{name} uklonjen/a", "users.roleChanged": "Uloga ažurirana",
    "users.edit": "Uredi", "users.nameUpdated": "Ime je ažurirano.",
    "users.makeAdmin": "Postavi za administratora", "users.makeUser": "Postavi za korisnika",
    "users.emptyTitle": "Još nema korisnika", "users.emptyBody": "Dodajte prvog člana tima za početak.",
    "users.nameRequired": "Ime i prezime je obavezno.", "users.emailInvalid": "Unesite ispravnu e-poštu.",
    "users.exists": "Ta e-pošta već je korisnik — promijenite mu ulogu ispod.",
    "users.notAdmin": "Samo administratori mogu upravljati korisnicima.", "users.readOnlyNote": "Samo administratori mogu dodavati ili uklanjati korisnike.",
    "users.noName": "Bez imena", "users.invited": "Pozivnica poslana korisniku {name}.",
    "users.awaitingTitle": "Čeka odobrenje", "users.awaitingSub": "Ove osobe su se prijavile, ali još nemaju pristup.",
    "users.approveUser": "Odobri kao korisnika", "users.approveAdmin": "Odobri kao administratora", "users.reject": "Odbij",
    "users.approved": "{name} odobren/a", "users.rejectQ": "Odbiti {name}?",
    "users.rejectBody": "Neće dobiti pristup. Možete ih ponovno pozvati kasnije.",
    "setpw.title": "Postavite lozinku", "setpw.body": "Odaberite lozinku da dovršite postavljanje računa.",
    "setpw.new": "Nova lozinka", "setpw.confirm": "Potvrdite lozinku", "setpw.submit": "Spremi i nastavi",
    "setpw.mismatch": "Lozinke se ne podudaraju.", "setpw.done": "Lozinka postavljena — dobrodošli!",
    "status.in_storage": "Spremljeno", "status.reserved": "Rezervirano", "status.checked_out": "Preuzeto", "status.missing": "Nedostaje",
    "statusAction.reserved": "Rezerviraj za preuzimanje", "statusAction.checked_out": "Označi preuzetim",
    "statusAction.in_storage": "Ponovno spremi", "statusAction.found": "Pronađeno i spremljeno",
    "status.now": "Sada: {status}",
    "season.winter": "Zimske", "season.summer": "Ljetne", "season.all_season": "Cjelogodišnje",
    "loc.zone": "Zona", "loc.rack": "Regal", "loc.shelf": "Polica", "loc.slot": "Mjesto",
    "loc.none": "Još bez lokacije", "loc.noneShort": "Bez lokacije", "loc.title": "Lokacija", "sd.rimsWord": "naplacima",
    "pay.paid": "Plaćeno", "pay.unpaid": "Neplaćeno",
    "common.back": "Natrag", "common.home": "Početna", "common.cancel": "Odustani", "common.confirm": "Potvrdi",
    "common.loading": "Učitavanje…", "common.save": "Spremi", "common.notFound": "Nije pronađeno",
    "time.now": "upravo sad", "time.min": "prije {n} min", "time.hour": "prije {n} h",
    "dash.search": "Traži ime, registraciju, dimenziju, DOT, lokaciju…",
    "dash.inventory": "Skladište", "dash.checkedInToday": "Danas zaprimljeno", "dash.pickedUpToday": "Danas preuzeto",
    "dash.inStorage": "U skladištu", "dash.reservedN": "{n} rezervirano", "dash.dueSoon": "Uskoro", "dash.next7": "sljedećih 7 dana",
    "dash.connection": "Veza", "dash.pendingSync": "Za sinkronizaciju", "dash.lastBackup": "Zadnja kopija", "dash.backupNotYet": "Još ne",
    "dash.dueForPickup": "Uskoro za preuzimanje", "dash.remind": "Podsjeti →", "dash.setsN": "{n} {sets}", "dash.shownOf": "{shown} od {total}",
    "dash.emptyTitle": "Još nema spremljenih guma", "dash.emptyBody": "Zaprimite komplet kupca za početak.", "dash.storeTires": "Spremi gume",
    "dash.showAll": "Prikaži sve", "dash.noneHere": "Ništa ovdje", "dash.noneHereBody": "Trenutno nema kompleta za ovaj filtar.",
    "dash.noMatchTitle": "Nema rezultata", "dash.noMatchBody": "Ništa ne odgovara upitu „{q}”. Pokušajte s registracijom, imenom ili DOT-om.",
    "dash.loadError": "{err}",
    "ci.title": "Spremi gume", "ci.customer": "Kupac", "ci.name": "Ime", "ci.phone": "Telefon", "ci.email": "E-pošta",
    "ci.vehicle": "Vozilo", "ci.make": "Marka", "ci.model": "Model", "ci.year": "Godina", "ci.plate": "Registracija",
    "ci.season": "Sezona", "ci.location": "Lokacija u skladištu", "ci.details": "Detalji",
    "ci.qty": "Broj guma", "ci.expectedPickup": "Očekivano preuzimanje", "ci.onRims": "Na naplacima / felgama",
    "ci.rimType": "Vrsta naplatka", "ci.steel": "Čelični", "ci.alloy": "Aluminijski", "ci.fee": "Cijena čuvanja", "ci.paid": "Plaćeno", "ci.notes": "Napomene",
    "ci.tires": "Gume", "ci.tiresHint": "Ispunite što možete — prazna polja se preskaču.", "ci.scanSidewall": "Skeniraj bok gume",
    "ci.cancel": "Odustani", "ci.submit": "Spremi gume", "ci.nameRequired": "Ime kupca je obavezno.",
    "ci.dupWarn": "Mogući duplikat — ", "ci.occupied": "je već na ovoj lokaciji.",
    "ci.reading": "Očitavanje boka gume…", "ci.readingPct": "Očitavanje boka gume… {pct}%",
    "ci.ocrFail": "Nije moguće jasno očitati — približite se da dimenzija ispuni kadar, nagnite prema bočnom svjetlu pa pokušajte ponovno (ili upišite ručno).",
    "ci.ocrEngine": "Čitač boka gume se nije mogao pokrenuti — provjerite vezu i pokušajte ponovno.",
    "ci.ocrFilled": "Ispunjena guma {n}: {parts}. Molimo provjerite.",
    "ci.stored": "Spremljeno {code}", "ci.printLabel": "Ispiši naljepnicu",
    "ci.reason.plate": "ista registracija", "ci.reason.phone": "isti telefon", "ci.reason.dot": "isti DOT kôd",
    "part.size": "dimenzija {v}", "part.dot": "DOT {v}",
    "tire.pos": "Pozicija", "tire.size": "Dimenzija gume", "tire.tread": "Profil mm", "tire.dot": "DOT kôd",
    "tire.brand": "Marka (nije obavezno)", "tire.stud": "Čavlane",
    "sd.move": "Premjesti", "sd.vehicle": "Vozilo", "sd.plate": "Registracija", "sd.phone": "Telefon", "sd.tires": "Gume",
    "sd.checkedIn": "Zaprimljeno", "sd.expectedOut": "Očekivani izlaz",
    "sd.tiresTread": "Gume i profil", "sd.payment": "Plaćanje", "sd.photos": "Fotografije stanja", "sd.history": "Povijest",
    "sd.openToLoad": "Otvorite za učitavanje…", "sd.label": "Naljepnica", "sd.delete": "Obriši", "sd.edit": "Uredi",
    "sd.pos": "Poz.", "sd.size": "Dimenzija", "sd.brand": "Marka", "sd.tread": "Profil",
    "sd.onRims": "Na naplacima", "sd.qtyOnRims": "{qty} · na {rim}", "sd.storageFee": "Cijena čuvanja", "sd.markPaid": "Označi plaćeno",
    "sd.paidUndo": "Plaćeno — poništi", "sd.noFee": "Cijena nije određena", "sd.noTireDetails": "Nema podataka o gumama.",
    "sd.noSet": "Nema kompleta „{code}”.", "sd.backHome": "Natrag na početnu",
    "sd.savedOffline": "Spremljeno izvanmrežno — sinkronizirat će se", "sd.markedPaid": "Označeno plaćeno ✓", "sd.markedUnpaid": "Označeno neplaćeno",
    "sd.movedToBin": "{code} premješteno u koš", "sd.undo": "Poništi", "sd.restored": "Vraćeno",
    "sd.locationUpdated": "Lokacija ažurirana", "sd.from": "Iz", "sd.to": "U", "sd.moveHere": "Premjesti ovamo",
    "sd.alreadyThere": "{code} je već ondje.", "sd.photoAdded": "Fotografija dodana", "sd.uploading": "Prijenos…",
    "sd.addPhoto": "Dodaj fotografiju", "sd.noPhotos": "Još nema fotografija.", "sd.deletePhotoQ": "Obrisati ovu fotografiju?",
    "sd.photoDeleted": "Fotografija obrisana", "sd.noHistory": "Još nema povijesti.",
    "edit.title": "Uredi {code}", "edit.saved": "Spremljeno",
    "audit.created": "Komplet stvoren", "audit.moved": "Lokacija promijenjena", "audit.status_changed": "Status promijenjen",
    "audit.payment": "Plaćanje ažurirano", "audit.photo_added": "Fotografija dodana", "audit.photo_removed": "Fotografija uklonjena",
    "audit.deleted": "Premješteno u koš", "audit.restored": "Vraćeno", "audit.purged": "Trajno obrisano", "audit.updated": "Podaci ažurirani",
    "scan.title": "Skeniraj naljepnicu", "scan.point": "Usmjerite kameru na QR naljepnicu kompleta.",
    "scan.takePhoto": "Umjesto toga snimi fotografiju", "scan.orType": "…ili upišite kôd (ASC-2026-0042)", "scan.open": "Otvori",
    "scan.tip": "Savjet: i standardna aplikacija Kamera skenira naljepnicu — automatski otvara zapis.",
    "scan.cantRead": "Nije moguće očitati kôd. Pokušajte fotografijom ili upišite ručno.",
    "scan.checksum": "Kontrolni zbroj naljepnice ne odgovara — provjerite je li to prava naljepnica.",
    "scan.cameraUnavail": "Kamera nije dostupna: {err}. Snimite fotografiju ili upišite kôd.",
    "scan.photoFail": "Nije moguće očitati fotografiju: {err}",
    "wh.title": "Skladište", "wh.emptyTitle": "Još nema smještenih kompleta",
    "wh.emptyBody": "Dodijelite kompletu Zonu / Regal / Policu / Mjesto pri zaprimanju i pojavit će se na karti.",
    "wh.zone": "Zona {z}", "wh.rack": "Regal {r}", "wh.shelf": "Polica {s}", "wh.setsN": "{n} {sets}", "wh.filledN": "{n} zauzeto", "wh.zones": "Zone",
    "cust.title": "Kupci", "cust.search": "Traži ime ili telefon…", "cust.emptyTitle": "Još nema kupaca",
    "cust.emptyBody": "Stvaraju se automatski kad spremite komplet.", "cust.noPhone": "Bez telefona",
    "cust.setsN": "{n} {sets}", "cust.vehicles": "Vozila", "cust.storedSets": "Spremljeni kompleti",
    "cust.tireSets": "Kompleti guma", "cust.noActive": "Nema aktivnih kompleta.", "cust.notFound": "Kupac nije pronađen",
    "rec.title": "Koš za smeće", "rec.retention": "Obrisani kompleti čuvaju se 30 dana, zatim se automatski uklanjaju.",
    "rec.emptyTitle": "Koš je prazan", "rec.emptyBody": "Ovdje se pojavljuju obrisani kompleti kako bi se pogreške lako ispravile.",
    "rec.deletedOn": "Obrisano {date}", "rec.restore": "Vrati", "rec.delete": "Obriši", "rec.restored": "Komplet vraćen",
    "rec.purgeQ": "Trajno obrisati {code}?", "rec.purgeBody": "Ovo se ne može poništiti. Komplet, gume i fotografije nestaju zauvijek.",
    "rec.deleteForever": "Obriši zauvijek", "rec.permDeleted": "Trajno obrisano",
    "rem.title": "Podsjetnici za preuzimanje", "rem.sub": "Kompleti za preuzimanje unutar 7 dana. Jednim dodirom nazovite, pošaljite poruku ili e-poštu kupcu.",
    "rem.allCaught": "Sve je obavljeno", "rem.allCaughtBody": "Nema preuzimanja u sljedećih 7 dana.",
    "rem.due": "Rok {date}", "rem.remindedAgo": "podsjećeno {ago}", "rem.call": "Nazovi", "rem.text": "Poruka", "rem.email": "E-pošta",
    "rem.mark": "Označi podsjećeno", "rem.markAgain": "Podsjećeno — označi ponovno", "rem.marked": "Označeno kao podsjećeno",
    "rem.message": "Poštovani {name}, Vaše {season} gume ({code}) pohranjene u ASC-u spremne su za preuzimanje{when}. Javite nam kada Vam odgovara da ih preuzmete. Hvala!",
    "rem.messageWhen": " oko {date}",
    "rem.nameFallback": "poštovani",
  },
};
