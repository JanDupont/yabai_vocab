// Lesson registry. Each data/Lxx.js file calls registerLesson(...).
const LESSONS = [];

function registerLesson(id, title, words) {
  const seen = new Map();
  const list = words.map((w, i) => {
    // Stable id derived from lesson + word, so progress survives edits/reordering of the list.
    let wid = `${id}:${w.jp}`;
    const n = (seen.get(wid) || 0) + 1;
    seen.set(wid, n);
    if (n > 1) wid += `#${n}`;
    return { ...w, id: wid, lesson: id, order: i, star: !!w.star };
  });
  LESSONS.push({ id, title, words: list });
}

// Kanji lists. Each data/Kxx-y.js file calls registerKanji(...).
// Entries are shaped like words (id, lesson, order, star), so the app can treat both alike.
const KANJI_LESSONS = [];

function registerKanji(id, title, kanji) {
  // The id doesn't contain the lesson, so a kanji can move between lessons and keep its progress.
  const list = kanji.map((k, i) => ({ ...k, id: `K:${k.k}`, jp: k.k, lesson: id, order: i, star: false, kanji: true }));
  KANJI_LESSONS.push({ id, title, words: list });
}

// Stroke paths per kanji (data/kanjivg.js), in stroke order, in a 109 × 109 box.
const STROKES = {};

function registerStrokes(strokes) {
  Object.assign(STROKES, strokes);
}
