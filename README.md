# 💰 Pocket Budget

**A free budget app anyone can use in seconds. Open the link, and that's it.**
No sign-up, no account, no ads. Everything stays on the person's own phone.

## What people get
- **English and Español**, picked from the phone's language, switchable with one tap
- **Built for how they earn**: Employee, Entrepreneur / freelancer, Side hustle / gig work. Each adds its own categories and income types
- **50/30/20 budget by default**: Needs 50%, Wants 30%, Savings & investing 20%. Switch to 70/20/10, 60/20/20, 50/20/30 or set your own percentages
- **Daily spend ring**: "You can spend $X today", recalculated every time they log something
- **Add in seconds** with a big keypad, category icons and a note
- **📷 Receipt scanning on the phone**: reads total, date and store; the photo is never uploaded
- **Business and side-hustle money kept separate**: earned, costs, profit and a tax set-aside estimate
- **Monthly budget** with a spending donut, pace warnings and expected income vs. budget
- **Bills and paydays** (weekly, every 2 weeks, monthly, quarterly, yearly) that record themselves
- **Personalize**: 6 colors, light/dark, your own category names, icons and colors
- **History** with filters, edit and delete; **CSV export** for Excel/Sheets; **backup & restore**
- **Morning, midday and night reminders** added to the phone's calendar
- **Installable** to the home screen; **works offline**

The first open shows example data so people see how it works; **Start my budget** takes 30 seconds.

## Publish it (about 5 minutes)
1. Create a **public** GitHub repository, e.g. `pocket-budget`.
2. Upload all files in this folder: `index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png`, `.nojekyll`, `README.md`.
   (On github.com: **Add file → Upload files** → drag them in → **Commit changes**. To include `.nojekyll`, upload the whole folder.)
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
4. In about a minute it's live at `https://YOUR-USERNAME.github.io/pocket-budget/`. Share that link.

### Updating
Edit the files and commit. Then open `sw.js` and change `VERSION` (e.g. `pb-v2`) so installed phones pick up the new version the next time they open the app.

## Scaling to millions
The app is static files with no server and no database, so each extra user costs you nothing beyond the files being downloaded (about 70 KB, then cached on the phone).

- **GitHub Pages** is perfect to launch, but it has a soft limit of 100 GB of traffic a month and isn't meant for commercial services.
- When usage grows, put the same files on **Cloudflare Pages** or **Netlify**: connect the GitHub repo and they publish it on every commit. Add your own domain (e.g. `pocketbudget.app`).
- The receipt reader (Tesseract.js) and fonts load from public CDNs, and are cached on the phone after first use.

## Privacy
Pocket Budget has no server. Entries live in the browser's storage on the person's device. Receipt photos are read on the device and discarded. Clearing browser data erases the budget, so the app reminds people to keep a backup (More → Backup).

## Good next steps
- Spanish version (auto-selected for Spanish-language phones)
- Optional sync between devices (e.g. sign in with Google and save to the person's own Google Drive)
- Push notifications (needs a small server; calendar reminders cover this for free today)
