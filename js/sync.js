// Sync study progress between devices through a secret GitHub Gist.
//
// The Gist holds one JSON file with { cards, deleted, settings, settingsMod }.
// Merging is per card: the version with the newest `mod` timestamp wins, and
// `deleted` holds tombstones (id -> time) so undo/reset also propagate.
const Sync = (() => {
  const META_KEY = "yabai_vocab.sync";
  const FILE = "yabai_vocab_progress.json";
  const API = "https://api.github.com";
  const PUSH_DELAY = 2000;
  const TOMBSTONE_TTL = 90 * 24 * 60 * 60 * 1000;

  let hooks = { getData: null, applyRemote: null, onStatus: () => {} };
  let meta = loadMeta();
  let syncing = false, again = false, pushTimer = null, changeCount = 0;
  let state = "off", message = "";

  function loadMeta() {
    try {
      return { token: "", gistId: "", dirty: false, lastSync: 0, ...JSON.parse(localStorage.getItem(META_KEY)) };
    } catch (e) {
      return { token: "", gistId: "", dirty: false, lastSync: 0 };
    }
  }

  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ }
  }

  function setStatus(s, msg = "") {
    state = s;
    message = msg;
    hooks.onStatus(status());
  }

  function status() {
    return { state, message, connected: isConnected(), dirty: meta.dirty, lastSync: meta.lastSync };
  }

  function isConnected() {
    return !!(meta.token && meta.gistId);
  }

  // ---------- merge ----------

  const stamp = (c) => c.mod || c.last || 0;

  function merge(a, b) {
    const cards = {}, deleted = {};
    const cutoff = Date.now() - TOMBSTONE_TTL;
    const ids = new Set([
      ...Object.keys(a.cards || {}), ...Object.keys(b.cards || {}),
      ...Object.keys(a.deleted || {}), ...Object.keys(b.deleted || {}),
    ]);
    for (const id of ids) {
      const ca = a.cards?.[id], cb = b.cards?.[id];
      const card = !ca ? cb : !cb ? ca : stamp(ca) >= stamp(cb) ? ca : cb;
      const del = Math.max(a.deleted?.[id] || 0, b.deleted?.[id] || 0);
      if (card && stamp(card) > del) cards[id] = card;
      else if (del > cutoff) deleted[id] = del;
    }
    const newerSettings = (a.settingsMod || 0) >= (b.settingsMod || 0) ? a : b;
    return { cards, deleted, settings: newerSettings.settings, settingsMod: newerSettings.settingsMod || 0 };
  }

  // JSON with sorted keys, so equal data always compares equal
  function canon(v) {
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (v && typeof v === "object") {
      return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
    }
    return JSON.stringify(v ?? null);
  }

  const syncable = (d) => ({ cards: d.cards || {}, deleted: d.deleted || {}, settings: d.settings, settingsMod: d.settingsMod || 0 });

  // ---------- GitHub API ----------

  async function api(path, opts = {}, token = meta.token) {
    const res = await fetch(API + path, {
      ...opts,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (res.status === 401) throw new SyncError("GitHub rejected the token. Check that it was copied completely, has the gist permission and hasn't expired.");
    if (res.status === 404) throw new SyncError("Sync file not found on GitHub. Disconnect and connect again.");
    if (!res.ok) throw new SyncError(`GitHub error ${res.status}`);
    return res.json();
  }

  class SyncError extends Error {}

  async function pull() {
    const gist = await api(`/gists/${meta.gistId}`);
    const file = gist.files?.[FILE];
    if (!file) return null;
    let text = file.content;
    if (file.truncated) text = await (await fetch(file.raw_url, { cache: "no-store" })).text();
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function push(data) {
    const payload = { app: "Yabai_Vocab", version: 1, updated: new Date().toISOString(), ...data };
    return api(`/gists/${meta.gistId}`, {
      method: "PATCH",
      body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(payload) } } }),
    });
  }

  // ---------- public ----------

  function init(h) {
    hooks = { ...hooks, ...h };
    setStatus(isConnected() ? (meta.dirty ? "pending" : "ok") : "off");
    if (isConnected()) sync();
    window.addEventListener("online", () => isConnected() && sync());
    document.addEventListener("visibilitychange", () => {
      if (!isConnected()) return;
      // pull when coming back to the app, push right away when leaving it
      if (document.visibilityState === "visible" || meta.dirty) sync();
    });
  }

  // Call after every local change.
  function changed() {
    changeCount++;
    if (!isConnected()) return;
    meta.dirty = true;
    saveMeta();
    if (state !== "syncing") setStatus("pending");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(sync, PUSH_DELAY);
  }

  async function sync() {
    if (!isConnected()) return;
    if (syncing) { again = true; return; }
    clearTimeout(pushTimer);
    syncing = true;
    setStatus("syncing");
    const startCount = changeCount;
    try {
      const remote = await pull();
      const local = syncable(hooks.getData());
      const merged = remote ? merge(local, syncable(remote)) : local;
      if (canon(merged) !== canon(local)) hooks.applyRemote(merged);
      if (!remote || canon(merged) !== canon(syncable(remote))) await push(merged);
      if (changeCount === startCount) meta.dirty = false;
      meta.lastSync = Date.now();
      saveMeta();
      setStatus(meta.dirty ? "pending" : "ok");
    } catch (e) {
      if (!navigator.onLine || e instanceof TypeError) setStatus("offline", "Offline. Changes are saved on this device and will sync later.");
      else setStatus("error", e.message);
    } finally {
      syncing = false;
      if (again) { again = false; sync(); }
    }
  }

  // Find the existing sync Gist for this token or create a new one.
  async function connect(token) {
    token = token.trim();
    setStatus("syncing");
    try {
      if (!token) throw new SyncError("Paste a token first.");
      const gists = await api("/gists?per_page=100", {}, token);
      let gist = gists.find((g) => g.files && g.files[FILE]);
      if (!gist) {
        const data = syncable(hooks.getData());
        gist = await api("/gists", {
          method: "POST",
          body: JSON.stringify({
            description: "Yabai_Vocab study progress (synced automatically)",
            public: false,
            files: { [FILE]: { content: JSON.stringify({ app: "Yabai_Vocab", version: 1, ...data }) } },
          }),
        }, token);
      }
      meta = { token, gistId: gist.id, dirty: false, lastSync: 0 };
      saveMeta();
      await sync();
    } catch (e) {
      setStatus(isConnected() ? "error" : "off", e.message);
      throw e;
    }
  }

  function disconnect() {
    meta = { token: "", gistId: "", dirty: false, lastSync: 0 };
    saveMeta();
    setStatus("off");
  }

  function gistUrl() {
    return meta.gistId ? `https://gist.github.com/${meta.gistId}` : "";
  }

  return { init, changed, sync, connect, disconnect, status, gistUrl, merge };
})();
