// Builds fonts/mplus-rounded-1c-*.woff2: M PLUS Rounded 1c (SIL Open Font License), cut down to
// the characters the app uses, so it stays small enough to ship and cache offline. The subset is
// made by Google Fonts (its text= parameter). Characters that are not in the subset fall back to
// the system font, so run this again after adding a lesson.
// Usage: node tools/font.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "fonts");
const WEIGHTS = [500, 700, 800];
const API = "https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@";
// woff2 is only served to browsers that say they support it
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function range(from, to) {
  let s = "";
  for (let c = from; c <= to; c++) s += String.fromCodePoint(c);
  return s;
}

(async () => {
  const files = ["index.html"];
  for (const dir of ["js", "data"]) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (f.endsWith(".js") && f !== "kanjivg.js") files.push(path.join(dir, f));
    }
  }
  // ASCII, all hiragana and katakana, then whatever else the lists and the UI contain
  const chars = new Set(range(0x20, 0x7e) + range(0x3041, 0x3096) + range(0x30a1, 0x30fc) + "、。「」々〜");
  for (const f of files) {
    for (const ch of fs.readFileSync(path.join(ROOT, f), "utf8")) {
      if (ch.codePointAt(0) > 0x7e && ch.trim()) chars.add(ch);
    }
  }
  const text = [...chars].sort().join("");

  fs.mkdirSync(OUT, { recursive: true });
  for (const w of WEIGHTS) {
    const css = await fetch(`${API}${w}&text=${encodeURIComponent(text)}`, { headers: { "User-Agent": UA } });
    if (!css.ok) throw new Error(`weight ${w}: CSS → HTTP ${css.status}`);
    const urls = [...(await css.text()).matchAll(/url\((https:[^)]+)\)\s*format\('woff2'\)/g)].map((m) => m[1]);
    if (urls.length !== 1) throw new Error(`weight ${w}: expected one woff2 file, got ${urls.length}`);
    const font = await fetch(urls[0]);
    if (!font.ok) throw new Error(`weight ${w}: font → HTTP ${font.status}`);
    const buf = Buffer.from(await font.arrayBuffer());
    fs.writeFileSync(path.join(OUT, `mplus-rounded-1c-${w}.woff2`), buf);
    console.log(`${w}  ${chars.size} characters  ${(buf.length / 1024).toFixed(1)} kB`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
