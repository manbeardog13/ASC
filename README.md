# 🛞 ASC Tire Hotel

A lightweight web app for a tire shop that stores customers' seasonal tires (a
"tire hotel"). Index every set, stick a **QR label** on it, and later **scan it
with any phone** to pull up who it belongs to, what's on it, and exactly where
it lives in the warehouse.

- **Phone-first & installable** — works as an app on a phone or the shop PC.
- **QR labels** — print a sticker per set; scan to open the record. Three ways:
  the phone's **built-in Camera app** (the QR is a URL, so it just works on iOS &
  Android), an **in-app live scanner**, or **take a photo** (universal fallback).
- **Real-time multi-user** — several staff can work at once; every change appears
  on all devices in under a second (Supabase Realtime).
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
| Hosting | GitHub Pages | HTTPS out of the box (required for phone camera) |
| Backend | Supabase (Postgres + Auth) | Free tier, secure (Row Level Security) |
| Realtime | Supabase Realtime (Postgres Changes) | Live sync to all devices; free tier = 200 connections / 2M msgs / mo |
| Scanning | Native camera app + `html5-qrcode` + photo fallback | Reliable on both iOS & Android (see note below) |
| Labels | `qrcode-generator` (SVG) | Crisp printable QR stickers |

### Cross-platform scanning notes

- The QR encodes a full `https://…#/set/CODE` URL, so the **native Camera app**
  on any iPhone/Android scans it and opens the record — the most reliable path.
- The **in-app live scanner** (html5-qrcode) works on Android browsers and **iOS
  Safari**. On iOS the app deliberately opens in Safari (not "standalone" PWA
  mode) because WebKit has long-standing camera bugs in standalone mode.
- The **"take a photo" fallback** uses the native camera to capture an image and
  decodes it locally — works even where the live camera is blocked.

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
js/ocr.js               Sidewall OCR (size + DOT) via Tesseract.js
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

## Also included

- **CSV export** — one click on the dashboard downloads the whole inventory
  (one row per tire, with customer, vehicle, location and specs) for Excel/Sheets.
- **Season-swap worklist** — pick a season and get every in-storage set of that
  season ordered by warehouse location, with a printable rack-by-rack pick list.
- **Condition photos** — attach proof-of-condition photos to any set (stored in a
  private Supabase Storage bucket, shown as thumbnails on the set page).
- **Sidewall OCR** — on check-in/edit, tap **📷 Scan sidewall** to photograph a tire
  and auto-fill its **size** and **DOT date code** into the next empty row via
  on-device OCR (Tesseract.js, loaded from CDN only when first used). Best-effort —
  results are always shown for you to confirm/edit.

## Roadmap ideas

- Email/SMS reminders when a set is due for pickup.
