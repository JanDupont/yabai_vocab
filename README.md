# Yabai_Vocab

A small spaced-repetition flashcard app (Anki-style) for the weekly vocabulary lists of the Japanese course ともだち (集中 2A/2B).

**Live:** <https://jandupont.github.io/yabai_vocab/>

- Plain HTML/CSS/JS. No dependencies, no build step, no backend.
- Hosted on GitHub Pages, installable on a phone's home screen, works offline.
- Syncs progress between devices through a secret GitHub Gist.
- Built for one person. Anyone else who opens it gets their own separate progress (see [Security & privacy](#security--privacy)).

**Lessons included:** L11

## Using the app

- **Study now** shows the cards that are due, plus new cards up to a daily limit (default 20, changeable in Settings).
- Rate each answer **Again / Hard / Good / Easy**. Each button shows when you'll see the card next.
- **★** marks words that appear in quizzes and tests. You can study ★ words only.
- **Direction:** 日本語 → EN, EN → 日本語, or Both.
- **Extra practice** is a round of 20 of your weakest cards. It doesn't change the schedule.
- **Words** lists every word with its progress in each direction.
- Keyboard: `Space` flips the card, then counts as Good. `1`–`4` rate, `Z` undoes, `S` speaks the word (the browser's built-in voice), `Esc` goes back.

## Setting up a new device

1. Open the live URL. To install it:
   - **iPhone (Safari):** Share → *Add to Home Screen*.
   - **Android (Chrome):** ⋮ → *Install app*.

   Always open the app from the home-screen icon. On iPhone, the icon and the Safari tab keep separate storage.
2. Open **Settings → Sync between devices**, paste the sync token, and press **Connect**. The device finds the existing Gist and pulls your progress.

To get a token (if the old one is lost or expired): create a **classic** token with **only the `gist` scope** at <https://github.com/settings/tokens/new?scopes=gist&description=Yabai_Vocab%20sync>. Then reconnect every device with the new token. Progress is kept, because it lives in the Gist and not in the token.

## How it works

### Scheduling (`js/srs.js`)
It's a simplified version of Anki's SM-2 algorithm. Each word has two cards, one per direction, each scheduled on its own.
- **New cards:** they go through learning steps (1 min, then 10 min), then come back after 1 day (Good) or 4 days (Easy).
- **Reviews:** intervals grow roughly ×2.5 with each Good (1d → 3d → 8d → 20d → …), up to a maximum of 180 days, so known words still come back.
- **Again on a review:** the card relearns, its interval drops to 20%, and its ease drops, so that word comes back more often from then on.
- **Day start:** a "day" starts at 04:00.
- **Order of new cards:** ★ words first, then in the order of the list.
- **Both directions:** a new word's EN → 日本語 card is held back until the day after its 日本語 → EN card was first studied, so you don't see both sides of a new word in one session. The home screen shows how many are waiting. When studying EN → 日本語 on its own, this delay doesn't apply.

### Data & storage
- **Vocabulary:** `data/Lxx.js`, loaded with `<script>` tags so the app also works when you open `index.html` directly (`file://`).
- **Card ids:** `Lxx:<jp>>je` and `Lxx:<jp>>ej`. Fixing the English, kana or romaji keeps your progress. Changing `jp` resets that word.
- **On the device:** progress is in `localStorage`, key `yabai_vocab.v1`. Older data under `tango.v1` (the app's previous name) is migrated automatically. The sync settings are under `yabai_vocab.sync`.

### Sync (`js/sync.js`)
- **What's stored:** one secret Gist per GitHub account, containing `yabai_vocab_progress.json` with `{ cards, deleted, settings, settingsMod }`. It's about 25 KB per lesson, and it grows only when lessons are added, not with daily use.
- **When it syncs:** the app pulls when it opens or comes back to the foreground. It pushes about 2 s after each change, and immediately when you leave the app. Offline changes wait on the device and upload when you're back online.
- **Merging:** card by card, the version with the newest `mod` timestamp wins. Undo and reset leave tombstones in `deleted`, so those changes spread to other devices too; tombstones are kept for 90 days. Settings: the newer version wins. The lesson/direction filter stays per device.
- **The "new cards today" limit** is counted from the cards' `first` timestamps, so it's shared across devices.
- **Status icon:** the cloud in the top bar shows the sync state. Green = synced, orange = waiting or offline, red = error. Tap it to sync right away.

### Offline & updates (`sw.js`)
The service worker fetches from the network first and falls back to the cache only when offline (or after 4 s on a very slow connection). New lessons and fixes therefore appear the next time the app is opened online, with no reinstall.

## Security & privacy

This repository is **public**. Never commit:
- the GitHub token (`ghp_…`)
- the Gist ID or URL
- progress exports (`yabai-vocab-progress-*.json`, already in `.gitignore`)

How it's kept safe:
- The token is only in each device's browser storage. The repo, the website and the Gist never contain it.
- The token has only the `gist` scope. Worst case, if it leaks, someone can read or change your Gists, nothing else. Revoke it at <https://github.com/settings/tokens> and reconnect with a new one.
- Other people who open the site and enter their own token get their own Gist in their own account. An invalid token just shows an error.
- The Gist is "secret", which means unlisted, not encrypted. It only contains review timestamps.
- All GitHub Pages sites under `jandupont.github.io` share one browser storage. Only publish trusted code there.

## Development

- **Run locally:** open `index.html` directly, or serve the folder:
  ```bash
  python3 -m http.server 8765
  ```
  The service worker (offline mode) only runs over http(s), and it doesn't work in Claude's built-in preview browser. Test offline mode on the live site.
- **Test the sync merge logic** (Node, no dependencies):
  ```bash
  node tests/sync.test.js
  ```
- **Deploy:** push to `main`. GitHub Pages updates within about a minute.

### Adding a lesson
1. Create `data/L12.js` in the same format as `data/L11.js`. Each entry has `s` (section), `jp`, `kana`, `ro`, `en`, and optionally `note` and `star`.
2. Add `<script src="data/L12.js"></script>` to `index.html` next to the other data files, before `js/srs.js`.
3. Update "Lessons included" above, then commit and push.

`CLAUDE.md` describes how Claude turns the course's vocab-list PDFs into these data files.

### Conventions
- All progress changes go through `setCard()` / `removeCard()` / `changed()` in `js/app.js`, because sync relies on their timestamps and tombstones.
- New JS or CSS files the app needs offline go into `CORE` in `sw.js`.

## Files

| Path | Purpose |
|---|---|
| `index.html`, `css/style.css` | Page and styles (light/dark) |
| `js/registry.js` | `registerLesson()`, used by the data files |
| `data/Lxx.js` | Vocabulary, one file per lesson |
| `js/srs.js` | Scheduler |
| `js/sync.js` | Gist sync and merging |
| `js/app.js` | User interface and study queue |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app and offline support |
| `tests/sync.test.js` | Two-device sync simulation |
