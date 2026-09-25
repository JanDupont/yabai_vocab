// Simulates two devices syncing through a fake Gist API. Run: node tests/sync.test.js
const fs = require("fs");
const src = fs.readFileSync(require("path").join(__dirname, "../js/sync.js"), "utf8");
let gist = { id: "g1", files: {} }; let online = true; let pushes = 0;
async function fakeFetch(url, opts = {}) {
  if (!online) throw new TypeError("Failed to fetch");
  const body = opts.body ? JSON.parse(opts.body) : null;
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  if (url.endsWith("/gists?per_page=100")) return ok(Object.keys(gist.files).length ? [gist] : []);
  if (opts.method === "POST") { gist.files = body.files; return ok(gist); }
  if (opts.method === "PATCH") { pushes++; Object.assign(gist.files, body.files); return ok(gist); }
  return ok(gist);
}
function device(name) {
  const ls = {};
  const env = {
    localStorage: { getItem: (k) => ls[k] ?? null, setItem: (k, v) => (ls[k] = v) },
    window: { addEventListener() {} }, document: { addEventListener() {}, visibilityState: "visible" },
    navigator: { get onLine() { return online; } }, fetch: fakeFetch, setTimeout: () => 0, clearTimeout() {},
  };
  const Sync = new Function(...Object.keys(env), src + "; return Sync;")(...Object.values(env));
  const store = { cards: {}, deleted: {}, settings: { newPerDay: 20 }, settingsMod: 0 };
  let st;
  Sync.init({ getData: () => store, applyRemote: (m) => Object.assign(store, m), onStatus: (s) => (st = s) });
  return { name, Sync, store, status: () => st,
    rate(id, t) { t += T0; store.cards[id] = { ivl: 1, last: t, mod: t }; delete store.deleted[id]; Sync.changed(); },
    del(id, t) { t += T0; delete store.cards[id]; store.deleted[id] = t; Sync.changed(); } };
}
const assert = require("assert"); const T0 = Date.now();
(async () => {
  const pc = device("pc"), phone = device("phone");
  pc.rate("a", 1000); pc.rate("b", 1000);
  await pc.Sync.connect("tok");               // creates gist with a,b
  await phone.Sync.connect("tok");            // finds existing gist, pulls
  assert.deepStrictEqual(Object.keys(phone.store.cards).sort(), ["a", "b"]);
  // phone offline: studies c, re-rates a
  online = false; phone.rate("c", 2000); phone.rate("a", 2100); await phone.Sync.sync();
  assert.equal(phone.status().state, "offline");
  // pc meanwhile rates d, and b (online)
  online = true; pc.rate("d", 2050); pc.rate("b", 2200); await pc.Sync.sync();
  // phone back online
  await phone.Sync.sync(); await pc.Sync.sync();
  for (const d of [pc, phone]) {
    assert.deepStrictEqual(Object.keys(d.store.cards).sort(), ["a", "b", "c", "d"]);
    assert.equal(d.store.cards.a.last, T0 + 2100); assert.equal(d.store.cards.b.last, T0 + 2200);
  }
  // undo on pc (deletion) propagates
  pc.del("d", 3000); await pc.Sync.sync(); await phone.Sync.sync();
  assert.ok(!phone.store.cards.d && phone.store.deleted.d === T0 + 3000);
  // no-op sync doesn't push
  const before = pushes; await phone.Sync.sync(); await pc.Sync.sync(); assert.equal(pushes, before);
  console.log("all sync tests passed; final gist size", gist.files["yabai_vocab_progress.json"].content.length, "bytes; status", pc.status().state);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
