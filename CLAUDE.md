# Yabai_Vocab

This is a static, dependency-free flashcard app for the user's weekly ともだち (Tomodachi) Japanese vocab lists. See README.md.

## Adding a vocab PDF

The user will post new `集中2AB_vocablist_Lxx.pdf` files. For each one:

- Extract the text with PDFKit. poppler and pypdf are not installed. Use this:
  `swift ext.swift file.pdf`, where the script is
  `import PDFKit; let d = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!; for i in 0..<d.pageCount { print(d.page(at:i)!.string ?? "") }`
- The first page usually comes out column by column rather than row by row. Rebuild the rows by lining up the romaji and English columns in order. The ★ marks sit on the English lines.
- PDF columns map to fields like this: 区分 → `s` ("" for "-"), 単語 → `jp` (put a bracketed example into `note`), ひらがな → `kana` (only when the list gives one), ローマ字 → `ro`, 英語 → `en`, クイズ ★ → `star: true`.
- Write `data/Lxx.js` with `registerLesson("Lxx", "Lesson xx", [...])`, then add its `<script>` tag to `index.html` before `js/srs.js`.
- Check the total word count and the ★ count against the PDF.
- Never change the `jp` of existing entries. Card ids are `Lxx:jp`, and progress is keyed on them.
- Update "Lessons included" in README.md.
- Commit and push to `main`. GitHub Pages deploys it.

## Adding a kanji list

The user posts photos of the kanji sheets. The margin label (for example `10-2`) sits next to the first kanji of that list. For each list:

- Write `data/Kxx-y.js` with `registerKanji("Lxx-y", "Kanji xx-y", [...])`, in the format of `data/K10-1.js`: `k`, `en`, `kun`, `on`, and `ex` (the example words under the practice boxes). Ignore handwritten notes.
- Run `node tools/kanjivg.js`, and check each stroke count it prints against the sheet.
- Add the `<script>` tag to `index.html` before `data/kanjivg.js`, and update "Kanji" in README.md.
- Never change the `k` of existing entries. Card ids are `K:<kanji>`.

Data is loaded through `<script>` tags, not `fetch`, so `index.html` works from `file://`.

## Things to keep working

- Every change to progress must go through `setCard()` / `removeCard()` / `changed()` in `js/app.js`. These set the `mod` timestamps and tombstones that the Gist sync merge (`js/sync.js`) relies on.
- When you add a new JS or CSS file that the app needs offline, add it to `CORE` in `sw.js`. Data files are cached automatically on first load.
- The in-app preview browser can't register service workers, so test offline mode on the deployed site.
- Run `node tests/sync.test.js` after changing `js/sync.js`.
- This repo is public. Never commit tokens, Gist IDs or progress exports. Keep README.md up to date: it's the project's memory.
