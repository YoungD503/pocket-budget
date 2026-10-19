# 💰 Pocket Budget — free personal finance tracker

A free expense tracker and monthly budget for everyone.
**The app lives on GitHub Pages; your money data lives in your own Google Sheet.** No subscription, no ads, no company holding your data.

- 📱 **Phone app** (add it to your home screen): log an expense in seconds, see your budget, bills and history
- 📷 **Receipt scanning**: photograph a paper receipt; it reads the total, date and store for you
- 📧 **3 emails a day**: morning plan (safe to spend today, bills coming), midday check-in, night recap
- 🔔 **Subscriptions & bills**: reminders before they're due, logged automatically when they're due
- 📨 **Gmail scan**: finds emailed receipts and renewals so nothing slips through
- 🔌 **Ready for WhatsApp**: an optional connection for n8n / Make / Zapier

```
 Your phone ──► GitHub Pages app (this repo, public, holds no data)
                   │  secret token, HTTPS
                   ▼
 Your Google account ──► Apps Script backend ──► Your Google Sheet + Drive receipts + Gmail
                                     └──► Daily emails to you
```

---

## Part A — Publish the app on GitHub Pages (once, by the project owner)

> If someone already published it, skip to Part B and use their app address.

1. Create a **public** repository on GitHub, e.g. `pocket-budget`.
2. Upload everything in this folder: `index.html`, `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png`, `.nojekyll`, `README.md`, and the `apps-script/` folder.
   (Website: **Add file → Upload files**, drag the files, **Commit changes**.)
3. Go to **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. After a minute your app is live at `https://YOUR-USERNAME.github.io/pocket-budget/`.

The page holds **no personal data**. Every person who opens it connects it to their own Google Sheet, so one GitHub page can serve everyone.

---

## Part B — Set up your private backend (each person, about 10 minutes)

### 1. Create the sheet and paste the code
1. Go to [sheets.new](https://sheets.new) and name it "Pocket Budget".
2. **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
4. **＋ → HTML**, name it exactly `Index`, paste [`apps-script/Index.html`](apps-script/Index.html).
5. **Services ＋ → Drive API → Add** (needed for receipt scanning).
6. 💾 **Save**.

### 2. Run the setup
1. Reload the sheet. A **💰 Finance** menu appears.
2. **💰 Finance → 1. Set up this spreadsheet**.
3. Approve the permissions: **Continue → your account → Advanced → Go to Pocket Budget (unsafe) → Allow**.
   *"Unsafe" only means Google hasn't reviewed a script you added yourself. It only works with your sheet, a "Pocket Budget Receipts" Drive folder, your own emails and (when you run the scan) your Gmail receipts.*

### 3. Make it yours
- **Settings**: name, currency, email (already filled), the hours for your 3 emails.
- **Budget**: your monthly amount per category.
- **Subscriptions**: delete the examples; add rent, phone, internet, streaming, gym, insurance, loans…

### 4. Turn on the daily emails
**💰 Finance → 2. Turn on daily summaries**, then **Send me a test summary now**.

### 5. Deploy the backend
1. In Apps Script: **Deploy → New deployment → ⚙️ → Web app**.
2. **Execute as: Me** · **Who has access: Anyone** → **Deploy**.
   *"Anyone" lets the GitHub app reach your backend. Every request must carry your secret token, and the Google-hosted page only opens for your own account.*

### 6. Connect your phone
1. In **Settings → Phone app address (GitHub Pages)** paste the app address from Part A.
2. **💰 Finance → Connect my phone app (GitHub)**. This turns on the API and **emails you a private link**.
3. Open that email **on your phone**, tap **Connect my phone app**, then **Add to Home screen**.

Done! Your daily emails now link straight to the phone app.

> **Keep the connect email private**: the link contains your secret token. Lost a phone? Change **Settings → Secret API token** to anything new (long and random), then run *Connect my phone app* again on your new phone.
>
> **After you update `Code.gs`**: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (the address stays the same), and run *1. Set up this spreadsheet* once to add any new settings.

---

## 📷 Scanning paper receipts
Tap **📷 Scan a receipt**, take a photo (or choose a photo/PDF), check the amount, date, store and category it filled in, then **Save**.
The photo goes to **Drive → Pocket Budget Receipts** and is linked in the *Receipt* column. It works best with a flat, well-lit receipt; if it misses the total, just type it.

## 📨 Emailed receipts and forgotten subscriptions
**💰 Finance → Scan Gmail for bills & subscriptions** → in **Detected Bills** tick *Add as subscription?* or *Log as expense?* → **💰 Finance → Add checked emails**.
Tick **Settings → Scan Gmail every Monday** to run it weekly.

---

## 🔌 WhatsApp later via n8n (optional, off by default)

**Outgoing summaries:** in Settings tick *Send summaries to a webhook* and paste an n8n Webhook URL. Each summary arrives as
```json
{ "app": "Pocket Budget", "kind": "morning", "subject": "…", "text": "☀️ Good morning, Ana! …",
  "to": { "email": "you@gmail.com", "phone": "+15551234567" }, "sentAt": "2026-10-20T12:04:11.000Z" }
```
Forward `text` with any WhatsApp node.

**Incoming messages:** with the API on (step 6 does this), POST to your backend `/exec` address. In n8n's HTTP Request node, turn on *Follow redirects*:
```json
{ "token": "YOUR_SECRET_TOKEN", "action": "message", "text": "12.50 lunch" }
```
Reply: `{ "ok": true, "reply": "✅ Logged $12.50 · Dining out …" }`, which you send back to WhatsApp.

| Message | Result |
|---|---|
| `12.50 lunch`, `gas 40`, `groceries 85.20` | Logs an expense (category guessed) |
| `income 500 salary`, `+500` | Logs income |
| `summary` / `resumen` | Today's plan |
| `today` / `hoy` | Today's recap |
| `bills` / `cuentas` | Bills in the next 30 days |
| `help` | Commands |

Structured actions: `add_expense`, `add_income` (`amount`, `category`, `description`, `date`) and `summary` (`kind`: morning / midday / night).

> n8n self-hosted is free, but since October 1, 2026 Meta charges per message for automated updates through the official WhatsApp API. Email always stays free.

---

## How the numbers work
- **Safe to spend today** = (budget − spent this month − bills still due this month) ÷ days left.
- **On track / ahead of pace** compares % of budget spent with % of the month passed.
- **Category alerts** at 80% (change in Settings). Totals reset on the 1st; history stays.

## Troubleshooting
| Problem | Fix |
|---|---|
| No 💰 Finance menu | Reload the sheet; check Code.gs is saved |
| Phone app says it can't reach your sheet | Backend must be deployed with access **Anyone**; check internet |
| Phone app says token refused | Run *Connect my phone app* again and open the new email link |
| "needs the Drive API service" | Apps Script → Services ＋ → Drive API |
| Emails not arriving | Check spam and the **Log** tab; *Send me a test summary now* shows errors |
| Wrong times | **File → Settings → Time zone**, then *2. Turn on daily summaries* again |

## Privacy
The GitHub page is just the app's screens, with no data on it. Your entries, receipts and settings stay in your Google account. The connection details are stored only on your phone. Don't share your sheet with edit access, because the secret token is in Settings.
