# Yabai_Vocab

Anki-style flashcards for the weekly vocab and kanji lists of the Japanese course ともだち (集中 2A/2B). Plain HTML/CSS/JS, no dependencies, no build step.
It runs on GitHub Pages, can be installed on a phone's home screen, works offline, and syncs progress between devices through a secret GitHub Gist.

**Live:** <https://jandupont.github.io/yabai_vocab/> · **Lessons:** L11 · **Kanji:** L10-1, L10-2, L11-1, L11-2

## How it works

- **Scheduling** (`js/srs.js`): a simplified SM-2 (Again/Hard/Good/Easy).
  - Each word has two cards, one per direction.
  - A day starts at 04:00, and intervals are capped at 180 days.
  - In "Both" mode, a new word's EN → 日本語 card starts the day after its 日本語 → EN card. Kanji are not delayed: the Write card is available right after the Recognise card.
- **Data:** each lesson is a file `data/Lxx.js`, loaded with a `<script>` tag. Card ids are `Lxx:<jp>>je` / `>ej`, so changing a word's `jp` resets its progress.
- **Kanji deck:** the home screen switches between the Vocab and the Kanji deck. Each deck has its own daily limit of new cards.
  - Each kanji list is a file `data/Kxx-y.js`. Each kanji has two cards: Recognise (kanji → meaning, KUN, ON) and Write (meaning and readings → draw it). The example words are only shown on the answer side.
  - Card ids are `K:<kanji>>kr` / `>kw`, without the lesson, so a kanji can move to another list and keep its progress.
  - **Drawing** (`js/draw.js`): each stroke is compared with the next expected stroke (start, end, shape and length, with tolerances set at the top of the file). A good stroke snaps to the model stroke, a bad one fades out, and after three misses the stroke is shown as a hint. You still grade the card yourself. "Check each stroke" can be switched off in Settings for free drawing.
  - **Stroke data** (`data/kanjivg.js`) comes from [KanjiVG](https://kanjivg.tagaini.net) (© Ulrich Apel, CC BY-SA 3.0). `node tools/kanjivg.js` downloads the strokes of every kanji in `data/K*.js` that is still missing.
- **Sync** (`js/sync.js`): progress is stored in a secret Gist, in the file `yabai_vocab_progress.json`.
  - Each device connects with a classic GitHub token that has only the `gist` scope, entered in Settings. Create one [here](https://github.com/settings/tokens/new?scopes=gist&description=Yabai_Vocab%20sync).
  - Merging is per card: the newest `mod` wins, and undo/reset leave tombstones in `deleted`.
  - To keep requests low, changes are uploaded in batches: at most every 60 s, plus when a session ends or the app is left. Downloads are conditional (ETag), so a check where nothing changed is a cheap 304.
  - All progress changes must go through `setCard()` / `removeCard()` / `changed()` in `js/app.js`.
- **Offline** (`sw.js`): network first, cache as fallback. When you add a new JS/CSS file, add it to `CORE`.

## Adding a lesson

Add `data/L12.js` in the same format as `data/L11.js`, add its `<script>` tag in `index.html`, update "Lessons" above, and push to `main`. See `CLAUDE.md` for converting the PDF lists.

## Adding a kanji list

Add `data/K11-3.js` in the same format as `data/K10-1.js`, run `node tools/kanjivg.js`, add its `<script>` tag in `index.html` before `data/kanjivg.js`, update "Kanji" above, and push to `main`.

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
