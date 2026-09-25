# Yabai_Vocab

Anki-style flashcards for the weekly vocab lists of the Japanese course ともだち (集中 2A/2B). Plain HTML/CSS/JS, no dependencies, no build step.

**Live:** <https://jandupont.github.io/yabai_vocab/> · **Lessons:** L11

## How it works

- **Scheduling** (`js/srs.js`): a simplified SM-2 (Again/Hard/Good/Easy).
  - Each word has two cards, one per direction.
  - A day starts at 04:00, and intervals are capped at 180 days.
  - In "Both" mode, a new word's EN → 日本語 card starts the day after its 日本語 → EN card.
- **Data:** each lesson is a file `data/Lxx.js`, loaded with a `<script>` tag. Card ids are `Lxx:<jp>>je` / `>ej`, so changing a word's `jp` resets its progress.
- **Sync** (`js/sync.js`): progress is stored in a secret Gist, in the file `yabai_vocab_progress.json`.
  - Each device connects with a classic GitHub token that has only the `gist` scope, entered in Settings. Create one [here](https://github.com/settings/tokens/new?scopes=gist&description=Yabai_Vocab%20sync).
  - Merging is per card: the newest `mod` wins, and undo/reset leave tombstones in `deleted`.
  - All progress changes must go through `setCard()` / `removeCard()` / `changed()` in `js/app.js`.
- **Offline** (`sw.js`): network first, cache as fallback. When you add a new JS/CSS file, add it to `CORE`.

## Adding a lesson

Add `data/L12.js` in the same format as `data/L11.js`, add its `<script>` tag in `index.html`, update "Lessons" above, and push to `main`. See `CLAUDE.md` for converting the PDF lists.

## Development

```bash
python3 -m http.server 8765
```
```bash
node tests/sync.test.js
```
Offline mode doesn't work in Claude's preview browser. Test it on the live site.

## Security

The repo is public. Never commit the token, the Gist ID, or progress exports. The token is stored only in each device's browser. If it leaks, revoke it at github.com/settings/tokens and reconnect with a new one.
