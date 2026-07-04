# 🛞 ASC Tire Hotel

A lightweight web app for a tire shop that stores customers' seasonal tires (a
"tire hotel"). Index every set, stick a **QR label** on it, and later **scan it
with any phone** to pull up who it belongs to, what's on it, and exactly where
it lives in the warehouse.

- **Phone-first & installable** — works as an app on a phone or the shop PC.
- **QR labels** — print a sticker per set; scan with the phone camera to open the record.
- **Multi-device** — phone + front desk share one live database (Supabase).
- **No build step** — plain HTML/CSS/JS, hosted free on GitHub Pages.

## What it tracks

Modeled on how real tire-storage systems work:

- **Customer** — name, phone, email
- **Vehicle** — make, model, year, license plate
- **Storage set** (one QR label) — season, on-rims + rim type, quantity,
  warehouse location (**Zone-Rack-Shelf-Slot**), check-in/pickup dates, fee & paid status
- **Each tire** — size (e.g. `225/45R17 91V`), brand & model, **tread depth (mm)**,
  **DOT date code**, position (FL/FR/RL/RR), studded

## How it's built

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Static HTML/CSS/JS (PWA) | Free hosting, installable, no toolchain |
| Hosting | GitHub Pages | HTTPS out of the box (needed for phone camera) |
| Backend | Supabase (Postgres + Auth) | Free tier, live multi-device sync, secure |
| Scanning | `html5-qrcode` (camera) | Works on iPhone & Android browsers |
| Labels | `qrcode-generator` (SVG) | Crisp printable QR stickers |

## Project layout

```
index.html              App shell (loads libraries + app.js)
manifest.webmanifest    PWA manifest (installable)
service-worker.js       Offline shell + install support
css/styles.css          Styles
js/config.js            ← YOU EDIT THIS (Supabase URL + key + app URL)
js/supabaseClient.js    Supabase connection
js/db.js                All database reads/writes
js/app.js               Router + every screen
js/scanner.js           Camera QR scanning
js/qrlabel.js           QR label generation + printing
supabase/schema.sql     ← RUN THIS ONCE in Supabase (tables + security)
assets/icon.svg         App icon
SETUP.md                Step-by-step setup for the shop owner
```

## Setup

See **[SETUP.md](SETUP.md)** for the full walk-through. Short version:

1. Create a free Supabase project → run `supabase/schema.sql` in its SQL editor.
2. Add one login user in Supabase → Authentication → Users.
3. Put your Supabase URL + anon key + app URL into `js/config.js`.
4. Turn on GitHub Pages for this repo. Open the page, sign in, start checking tires in.

## Roadmap ideas

- Auto-read the tire sidewall (size + DOT) from a photo via on-device OCR.
- CSV export of the whole inventory.
- Season-change worklist (all winter sets due to swap out).
- Photo attachments per set (proof of condition at check-in).
