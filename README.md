# Yabai_Vocab

A small spaced-repetition flashcard app for the weekly ともだち vocabulary lists.
Plain HTML/CSS/JS with no dependencies and no build step.
It runs on GitHub Pages, can be installed on a phone's home screen, works offline, and syncs progress between devices through a secret GitHub Gist.

## Use

Open the GitHub Pages URL. Locally, you can also just open `index.html`.

- **Study now** shows the cards that are due, plus new cards up to a daily limit (default 20).
- Rate each answer **Again / Hard / Good / Easy**. Each button shows when you'll see the card next.
- **Extra practice** is a round of 20 of your weakest cards. It doesn't change the schedule.
- **Words** lists every word with its ★ marking and its progress in each direction.
- Keyboard: `Space` flips the card, then counts as Good. `1`–`4` rate, `Z` undoes, `S` speaks the word, `Esc` goes back.

## One-time setup

### 1. Publish with GitHub Pages
1. Create a new **public** repository on github.com, for example `yabai_vocab`. Leave it empty.
2. Push this folder to it:
   ```bash
   git remote add origin https://github.com/<your-user>/yabai_vocab.git
   git push -u origin main
   ```
3. In the repository, go to **Settings → Pages → Build and deployment**. Choose *Deploy from a branch*, then **main** and **/ (root)**, and save.
4. About a minute later the app is at `https://<your-user>.github.io/yabai_vocab/`.

### 2. Put it on the phone
Open that URL on the phone.
- **iPhone (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** ⋮ → *Add to Home screen* or *Install app*.

### 3. Turn on sync
1. Create a token at <https://github.com/settings/tokens/new?scopes=gist&description=Yabai_Vocab%20sync>.
   This is a *classic* token. Tick only **gist**. Choose "No expiration", or a long expiry you'll remember to renew.
2. In the app, open **Settings → Sync between devices**, paste the token, and press **Connect**.
   The first device creates the secret Gist that holds your progress.
3. Do the same on every other device with the same token. They find the existing Gist and pull your progress.

After that, sync runs by itself. The app pulls when it opens or comes back to the foreground. It pushes a couple of seconds after each answer, and immediately when you leave the app.
If you study offline, your answers are saved on the device and upload next time you're online.
Merging works card by card, and the most recent review of a card wins, so studying on two devices never loses work.

The cloud icon in the top bar shows the sync state: green means synced, orange means waiting or offline, red means an error. Tap it to sync right away.

## How scheduling works

It's a simplified version of Anki's SM-2 algorithm (see `js/srs.js`):

- New cards go through short learning steps (1 min, then 10 min). After that they come back after 1 day (Good) or 4 days (Easy).
- Review intervals grow with each Good answer (roughly ×2.5: 1d → 3d → 8d → 20d → …), up to a maximum of 180 days.
- **Again** on a review card sends it back to relearning and cuts its interval to 20%. It also lowers the card's ease, so that word comes back more often from then on.
- A day starts at 04:00.
- When studying both directions, a new word is first learned as 日本語 → EN. The EN → 日本語 card follows the next day.

## Adding a new lesson

1. Create `data/L12.js` in the same format as `data/L11.js`.
2. Add `<script src="data/L12.js"></script>` to `index.html`, next to the other data files.
3. Commit and push. GitHub Pages updates within about a minute, and the app picks up the new lesson the next time it's opened online.

Card ids come from the lesson id and the Japanese word, so fixing a typo in the English or romaji keeps your progress. Changing the `jp` field resets that word.

## Files

- `index.html`, `css/style.css`: the page
- `js/registry.js`: `registerLesson()`, used by the data files
- `data/Lxx.js`: vocabulary, one file per lesson
- `js/srs.js`: the scheduler
- `js/sync.js`: Gist sync and merging
- `js/app.js`: the user interface
- `sw.js`, `manifest.webmanifest`, `icons/`: installable app and offline support
