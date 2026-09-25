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
