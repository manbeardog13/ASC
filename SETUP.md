# Setup guide — ASC Tire Hotel

This gets the app running with a shared database that both your **phone** and the
**shop computer** use. It takes about 15 minutes and costs **$0** (Supabase and
GitHub Pages both have free tiers that are plenty for one shop).

You'll do three things: **(A)** set up the database, **(B)** connect the app,
**(C)** put it online.

---

## A. Set up the database (Supabase)

1. Go to **https://supabase.com** and sign up (free). Click **New project**.
   - Give it a name like `asc-tire-hotel`, set a database password (save it), pick a region near you.
   - Wait ~2 minutes for it to finish setting up.

2. In the left menu, open **SQL Editor** → **New query**.
   - Open the file `supabase/schema.sql` from this project, copy **all** of it,
     paste it into the query box, and click **Run**.
   - You should see "Success". This created your tables, locked them down so only a
     logged-in user can see the data, switched on **live sync** so every device
     updates in real time, and set up a private **`tire-photos`** storage bucket for
     condition photos — no extra step needed.
   - *If the very last part errored* (some projects restrict this): go to **Storage**
     → **New bucket**, name it exactly `tire-photos`, leave **Public** off, and create
     it. Everything else already ran.

3. Create your shop login. Left menu → **Authentication** → **Users** → **Add user**
   → **Create new user**.
   - Enter an email and password you'll remember — this is how you'll sign in to the app.
   - (Leave "auto-confirm" on so you can log in right away.)

4. Get your two connection values. Left menu → **Project Settings** → **Data API**
   (or **API**).
   - Copy the **Project URL** (looks like `https://abcdxyz.supabase.co`).
   - Copy the **anon / public** API key (a long string). This one is safe to share —
     your data stays protected by the security rules from step 2.

---

## B. Connect the app

1. Open the file **`js/config.js`** in this project.
2. Replace the three placeholder values:

   ```js
   SUPABASE_URL:      "https://abcdxyz.supabase.co",   // your Project URL
   SUPABASE_ANON_KEY: "eyJhbGciOi...",                 // your anon key
   APP_BASE_URL:      "https://manbeardog13.github.io/ASC/",  // where the app lives (step C)
   ```

3. Save the file.

> The `APP_BASE_URL` is baked into every QR code, so a customer or an employee can
> scan a sticker with the **normal phone camera** and it opens the right record.
> If you host somewhere other than GitHub Pages, put that address here instead.

---

## C. Put it online (GitHub Pages)

1. Commit and push this project to the GitHub repo (`manbeardog13/ASC`).
2. On GitHub, open the repo → **Settings** → **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
   - Branch: **main**, folder: **/ (root)**. Click **Save**.
4. Wait a minute, then GitHub shows your live address, e.g.
   `https://manbeardog13.github.io/ASC/`.
   - If that address is different from what you put in `APP_BASE_URL` (step B2),
     update `config.js` and push again.

---

## Using it

1. Open the app address on your phone. In the browser menu choose **Add to Home Screen**
   so it launches like an app. Do the same on the shop computer.
2. Sign in with the email/password you made in step A3. Everyone who logs in shares
   the same data, and **changes show up on every device within a second** — the green
   **● Live** dot in the top bar means sync is on.
3. **Check-in:** tap **Check-in**, fill in the customer, vehicle, location and tire
   details, and **Save & make label**. Print the label and stick it on the set.
4. **Find a set — three ways to scan:**
   - **Easiest:** open the phone's normal **Camera app** and point it at the sticker —
     a link pops up that opens the record. Works on any iPhone or Android.
   - **In-app:** tap **Scan** for a live scanner (works in Safari on iPhone, and in
     Chrome on Android).
   - **Take a photo:** on the Scan screen, tap **📷 Take a photo instead** if the live
     camera won't start — it snaps a picture and reads the code from it.
   - Or just **search** by name, plate, code, size, brand or location.
5. **Season swap / pickup:** open a set and **Mark checked out**; bring it back in
   storage the same way next season. For a seasonal rush, tap **🧾 Worklist** on the
   Storage screen, pick the season, and **Print** a rack-by-rack pick list.
6. **Condition photos:** open a set and tap **📷 Add photo** to attach proof-of-condition
   pictures (handy if a customer later disputes a scratch or wear).
7. **Export:** tap **⬇︎ Export CSV** on the Storage screen to download the whole
   inventory as a spreadsheet (opens in Excel or Google Sheets).

> **iPhone note:** open the app from Safari (the Home-Screen icon does this). Apple's
> "full-screen app" mode has camera bugs, so the app intentionally stays in Safari on
> iPhone — the camera scanner is reliable there. Android runs it full-screen fine.

---

## Troubleshooting

- **"App isn't connected to your database yet"** — `config.js` still has placeholder
  values, or they have a typo. Recheck step B.
- **Camera won't open** — the site must be on **https** (GitHub Pages is), and the
  browser will ask for camera permission the first time — tap **Allow**. You can
  always type a code into the box on the Scan screen instead.
- **"Invalid login credentials"** — the email/password must match a user you created
  in Supabase (step A3).
- **Nothing saves / permission error** — make sure you ran the whole `schema.sql`
  and that you're signed in.
