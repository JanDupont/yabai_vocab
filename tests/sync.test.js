// Simulates two devices syncing through a fake Gist API. Run: node tests/sync.test.js
const fs = require("fs");
const assert = require("assert");
const src = fs.readFileSync(require("path").join(__dirname, "../js/sync.js"), "utf8");
const T0 = Date.now();

// ---- fake GitHub Gist API with ETags ----
let gist = { id: "g1", files: {} };
let version = 0, online = true;
const calls = { get: 0, notModified: 0, patch: 0 };

async function fakeFetch(url, opts = {}) {
  if (!online) throw new TypeError("Failed to fetch");
  const body = opts.body ? JSON.parse(opts.body) : null;
  const etag = `"v${version}"`;
  const res = (status, j) => ({ ok: status < 300, status, headers: { get: (h) => (h === "ETag" ? `"v${version}"` : null) }, json: async () => j });
  if (url.endsWith("/gists?per_page=100")) return res(200, Object.keys(gist.files).length ? [gist] : []);
  if (opts.method === "POST") { gist.files = body.files; version++; return res(201, gist); }
  if (opts.method === "PATCH") { calls.patch++; Object.assign(gist.files, body.files); version++; return res(200, gist); }
  calls.get++;
  if (opts.headers["If-None-Match"] === etag) { calls.notModified++; return res(304); }
  return res(200, gist);
}

function device() {
  const ls = {}, listeners = {};
  let timer = null;
  const env = {
    localStorage: { getItem: (k) => ls[k] ?? null, setItem: (k, v) => (ls[k] = v) },
    window: { addEventListener: (e, f) => (listeners[e] = f) },
    document: { addEventListener: (e, f) => (listeners[e] = f), visibilityState: "visible" },
    navigator: { get onLine() { return online; } },
    fetch: fakeFetch,
    setTimeout: (f) => (timer = f, 1),
    clearTimeout: () => (timer = null),
  };
  const Sync = new Function(...Object.keys(env), src + "; return Sync;")(...Object.values(env));
  const store = { cards: {}, deleted: {}, settings: { newPerDay: 20 }, settingsMod: 0 };
  let st;
  Sync.init({ getData: () => store, applyRemote: (m) => Object.assign(store, m), onStatus: (s) => (st = s) });
  return {
    Sync, store, status: () => st,
    rate(id, t) { t += T0; store.cards[id] = { ivl: 1, last: t, mod: t }; delete store.deleted[id]; Sync.changed(); },
    del(id, t) { t += T0; delete store.cards[id]; store.deleted[id] = t; Sync.changed(); },
    fireTimer: async () => { const f = timer; timer = null; if (f) await f(); },
    hasTimer: () => !!timer,
  };
}

(async () => {
  const pc = device(), phone = device();
  pc.rate("a", 1000); pc.rate("b", 1000);
  await pc.Sync.connect("tok");               // creates the gist with a, b
  await phone.Sync.connect("tok");            // finds it and pulls
  assert.deepStrictEqual(Object.keys(phone.store.cards).sort(), ["a", "b"]);

  // phone offline: studies c and re-rates a
  online = false; phone.rate("c", 2000); phone.rate("a", 2100); await phone.Sync.flush();
  assert.equal(phone.status().state, "offline");
  // pc meanwhile rates d and b
  online = true; pc.rate("d", 2050); pc.rate("b", 2200); await pc.Sync.flush();
  // phone back online, then pc checks again
  await phone.Sync.sync(); await pc.Sync.sync();
  for (const d of [pc, phone]) {
    assert.deepStrictEqual(Object.keys(d.store.cards).sort(), ["a", "b", "c", "d"]);
    assert.equal(d.store.cards.a.last, T0 + 2100);
    assert.equal(d.store.cards.b.last, T0 + 2200);
  }

  // undo on pc (deletion) reaches the phone
  pc.del("d", 3000); await pc.Sync.flush(); await phone.Sync.sync();
  assert.ok(!phone.store.cards.d && phone.store.deleted.d === T0 + 3000);

  // a study session of 100 cards: no uploads until the batch timer or flush
  await pc.Sync.sync(); // settle
  const before = { ...calls };
  for (let i = 0; i < 100; i++) pc.rate(`s${i}`, 4000 + i);
  assert.equal(calls.patch, before.patch, "no upload per card");
  assert.ok(pc.hasTimer(), "batch timer started");
  await pc.fireTimer();                        // one batched upload
  for (let i = 100; i < 150; i++) pc.rate(`s${i}`, 4000 + i);
  await pc.Sync.flush();                       // session ends
  assert.equal(calls.patch - before.patch, 2, "150 cards -> 2 uploads");
  assert.equal(pc.status().state, "ok");

  // nothing changed: sync is a single cheap 304, no upload
  const b2 = { ...calls };
  await pc.Sync.sync();
  assert.equal(calls.notModified - b2.notModified, 1);
  assert.equal(calls.patch, b2.patch);

  // the other device still gets everything
  await phone.Sync.sync();
  assert.equal(Object.keys(phone.store.cards).length, 153);
  await phone.Sync.sync();                     // and a repeat check is a 304
  assert.equal(calls.notModified - b2.notModified, 2);

  console.log("all sync tests passed", calls);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
