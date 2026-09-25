(() => {
  "use strict";

  const STORE_KEY = "yabai_vocab.v1";
  const OLD_STORE_KEY = "tango.v1"; // before the rename
  const LEARN_AHEAD = 20 * SRS.MIN; // show learning cards early when nothing else is due
  const PRACTICE_SIZE = 20;
  const DIR_LABEL = { je: "日本語 → EN", ej: "EN → 日本語" };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  // ---------- data ----------

  const WORDS = LESSONS.flatMap((l) => l.words);
  const ALL_CARDS = WORDS.flatMap((w) => [
    { id: `${w.id}>je`, word: w, dir: "je" },
    { id: `${w.id}>ej`, word: w, dir: "ej" },
  ]);
  const LESSON_INDEX = new Map(LESSONS.map((l, i) => [l.id, i]));

  // ---------- storage ----------

  // cards, deleted (tombstones), settings and settingsMod are synced between devices;
  // filter stays per device.
  const DEFAULTS = {
    settings: { newPerDay: 20, furigana: true, romajiFront: false, autoSpeak: false },
    filter: { excluded: [], starOnly: false, dir: "both" },
  };

  function load() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY));
    } catch (e) { /* ignore */ }
    return normalize(data || {});
  }

  function normalize(data) {
    return {
      cards: data.cards || {},
      deleted: data.deleted || {},
      settings: { ...DEFAULTS.settings, ...data.settings },
      settingsMod: data.settingsMod || 0,
      filter: { ...DEFAULTS.filter, ...data.filter },
    };
  }

  let store = load();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      toast("Could not save progress (storage unavailable)");
    }
  }

  function today() {
    return SRS.dayIndex(Date.now());
  }

  // Counted from the cards themselves, so it stays right when several devices sync.
  function newToday() {
    const t = today();
    let n = 0;
    for (const s of Object.values(store.cards)) if (s.first && SRS.dayIndex(s.first) === t) n++;
    return n;
  }

  // All progress changes go through these two, so sync sees them.
  function setCard(id, state) {
    store.cards[id] = { ...state, mod: Date.now() };
    delete store.deleted[id];
    changed();
  }

  function removeCard(id) {
    delete store.cards[id];
    store.deleted[id] = Date.now();
    changed();
  }

  function changed() {
    save();
    Sync.changed();
  }

  // ---------- queue ----------

  function eligibleCards(filter = store.filter) {
    const excluded = new Set(filter.excluded);
    return ALL_CARDS.filter(
      (c) =>
        !excluded.has(c.word.lesson) &&
        (!filter.starOnly || c.word.star) &&
        (filter.dir === "both" || filter.dir === c.dir)
    );
  }

  function newOrder(a, b) {
    return (
      (b.word.star - a.word.star) ||
      (LESSON_INDEX.get(a.word.lesson) - LESSON_INDEX.get(b.word.lesson)) ||
      (a.word.order - b.word.order) ||
      (a.dir === "je" ? -1 : 1)
    );
  }

  function buildQueue(now = Date.now()) {
    const t = today();
    const learn = [], review = [], fresh = [];
    for (const c of eligibleCards()) {
      const s = store.cards[c.id];
      if (!s) fresh.push(c);
      else if (s.step >= 0) learn.push(c);
      else if (s.due <= now) review.push(c);
    }
    // With both directions, a new word is first learned 日本語 → EN;
    // the reverse card is introduced from the next day on.
    const available = fresh.filter((c) => {
      if (store.filter.dir !== "both" || c.dir === "je") return true;
      const sib = store.cards[c.word.id + ">je"];
      return sib && SRS.dayIndex(sib.first || 0) < t;
    });
    available.sort(newOrder);
    const newLeft = Math.max(0, store.settings.newPerDay - newToday());
    learn.sort((a, b) => store.cards[a.id].due - store.cards[b.id].due);
    return {
      learn,
      learnDue: learn.filter((c) => store.cards[c.id].due <= now),
      review,
      fresh: available.slice(0, newLeft),
      freshTotal: fresh.length,
      locked: fresh.length - available.length, // EN → 日本語 cards waiting for tomorrow
      newLeft,
    };
  }

  function pickNext(q, now, lastId) {
    const notLast = (arr) => arr.find((c) => c.id !== lastId) || arr[0];
    if (q.learnDue.length) {
      // don't show the exact same card twice in a row if something else is waiting
      const alt = q.learnDue.find((c) => c.id !== lastId);
      if (alt) return alt;
      if (!q.review.length && !q.fresh.length) return q.learnDue[0];
    }
    const pool = q.review.length + q.fresh.length;
    if (pool) {
      const useReview = Math.random() < q.review.length / pool;
      if (useReview) {
        const choices = q.review.filter((c) => c.id !== lastId);
        const arr = choices.length ? choices : q.review;
        return arr[Math.floor(Math.random() * arr.length)];
      }
      return notLast(q.fresh);
    }
    if (q.learn.length && store.cards[q.learn[0].id].due - now <= LEARN_AHEAD) {
      return notLast(q.learn.filter((c) => store.cards[c.id].due - now <= LEARN_AHEAD));
    }
    return null;
  }

  // ---------- session state ----------

  const session = {
    mode: "srs",      // "srs" | "practice"
    card: null,
    flipped: false,
    lastId: null,
    practice: [],     // queue for practice mode
    practiceDone: 0,
    undo: [],
    timer: null,
  };

  // ---------- views ----------

  function show(view) {
    if (view !== "study" && !$("#view-study").hidden) Sync.flush(); // session over: upload now
    for (const v of ["home", "study", "words"]) $(`#view-${v}`).hidden = v !== view;
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.nav === (view === "study" ? "home" : view)));
    clearTimeout(session.timer);
    if (view === "home") renderHome();
    if (view === "words") renderWords();
    window.scrollTo(0, 0);
  }

  // ---------- home ----------

  function renderHome() {
    const q = buildQueue();
    $("#c-new").textContent = q.fresh.length;
    $("#c-learn").textContent = q.learn.length;
    $("#c-review").textContent = q.review.length;

    const chips = $("#lesson-chips");
    chips.innerHTML = "";
    for (const l of LESSONS) {
      const b = document.createElement("button");
      b.className = "chip";
      b.classList.toggle("on", !store.filter.excluded.includes(l.id));
      const stars = l.words.filter((w) => w.star).length;
      b.innerHTML = `<b>${esc(l.id)}</b><span>${l.words.length} words · <span class="star">★</span>${stars}</span>`;
      b.onclick = () => {
        const ex = new Set(store.filter.excluded);
        ex.has(l.id) ? ex.delete(l.id) : ex.add(l.id);
        store.filter.excluded = [...ex];
        save();
        renderHome();
      };
      chips.appendChild(b);
    }

    $$("#dir-seg button").forEach((b) => b.classList.toggle("on", b.dataset.dir === store.filter.dir));
    $("#star-only").checked = store.filter.starOnly;

    const total = q.learnDue.length + q.review.length + q.fresh.length;
    const eligible = eligibleCards().length;
    $("#btn-study").disabled = total === 0 && !(q.learn.length && store.cards[q.learn[0].id].due - Date.now() <= LEARN_AHEAD);
    $("#btn-practice").disabled = eligible === 0;
    let hint = "";
    if (eligible === 0) hint = "No cards match the current selection.";
    else if (total === 0) {
      const next = nextDueText(q);
      hint = `All done for now. ${next}`;
    } else if (q.newLeft === 0 && q.freshTotal > 0) {
      hint = `Daily limit of new cards reached (${store.settings.newPerDay}). ${q.freshTotal} new cards remaining.`;
    }
    if (q.locked) hint += (hint ? " " : "") + lockedText(q.locked);
    $("#home-hint").textContent = hint;

    renderProgress();
  }

  function lockedText(n) {
    return `${n} EN → 日本語 card${n > 1 ? "s" : ""} will be added tomorrow, the day after you learned the 日本語 → EN side.`;
  }

  function nextDueText(q) {
    const now = Date.now();
    if (q.learn.length) {
      const d = store.cards[q.learn[0].id].due - now;
      return `Learning cards come back in ${SRS.formatDelta(Math.max(0, d))}.`;
    }
    const t = today();
    let tomorrow = 0, soonest = Infinity;
    for (const c of eligibleCards()) {
      const s = store.cards[c.id];
      if (!s || s.step >= 0) continue;
      const d = SRS.dayIndex(s.due);
      if (d <= t + 1) tomorrow++;
      soonest = Math.min(soonest, d);
    }
    if (tomorrow) return `${tomorrow} review${tomorrow > 1 ? "s" : ""} due tomorrow.`;
    if (soonest < Infinity) return `Next review in ${soonest - t} days.`;
    return "";
  }

  function renderProgress() {
    const wrap = $("#lesson-progress");
    wrap.innerHTML = "";
    for (const l of LESSONS) {
      const counts = { new: 0, learning: 0, young: 0, mature: 0 };
      const starCounts = { new: 0, learning: 0, young: 0, mature: 0 };
      for (const w of l.words) {
        for (const dir of ["je", "ej"]) {
          const st = SRS.status(store.cards[`${w.id}>${dir}`]);
          counts[st]++;
          if (w.star) starCounts[st]++;
        }
      }
      const row = document.createElement("div");
      row.className = "progress-row";
      row.innerHTML = `
        <div class="progress-label"><b>${esc(l.id)}</b><span>${esc(l.title)}</span></div>
        ${bar(counts, "All")}
        ${bar(starCounts, "★")}`;
      wrap.appendChild(row);
    }
  }

  function bar(counts, label) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const known = counts.young + counts.mature;
    const seg = (k) => counts[k] ? `<i class="st-${k}" style="width:${(counts[k] / total) * 100}%" title="${k}: ${counts[k]}"></i>` : "";
    return `<div class="progress-line">
      <span class="progress-tag ${label === "★" ? "star" : ""}">${label}</span>
      <div class="progress-bar">${seg("mature")}${seg("young")}${seg("learning")}${seg("new")}</div>
      <span class="progress-num">${Math.round((known / total) * 100)}%</span>
    </div>`;
  }

  // ---------- study ----------

  function startStudy(mode) {
    session.mode = mode;
    session.undo = [];
    session.lastId = null;
    if (mode === "practice") {
      session.practice = buildPractice();
      session.practiceDone = 0;
    }
    show("study");
    next();
  }

  // Practice: weakest seen cards first (lapses, low ease, short interval), topped up with random ones.
  function buildPractice() {
    const cards = eligibleCards();
    const weakness = (c) => {
      const s = store.cards[c.id];
      if (!s) return 0.5;
      return s.lapses * 2 + (2.5 - s.ease) * 3 + (s.step >= 0 ? 2 : 0) + 1 / (1 + s.ivl);
    };
    const scored = cards.map((c) => ({ c, w: weakness(c) + Math.random() * 0.6 }));
    scored.sort((a, b) => b.w - a.w);
    return shuffle(scored.slice(0, PRACTICE_SIZE).map((x) => x.c));
  }

  function next() {
    clearTimeout(session.timer);
    const now = Date.now();
    let card = null, counts = "";
    if (session.mode === "practice") {
      card = session.practice[0] || null;
      counts = `<span class="pill practice">Practice</span><span>${session.practice.length} left</span>`;
    } else {
      const q = buildQueue(now);
      card = pickNext(q, now, session.lastId);
      counts = `<span class="n-new" title="New">${q.fresh.length}</span>
        <span class="n-learn" title="Learning">${q.learn.length}</span>
        <span class="n-review" title="Review">${q.review.length}</span>`;
      if (!card) scheduleWake(q, now);
    }
    $("#study-counts").innerHTML = counts;
    $("#btn-undo").disabled = session.undo.length === 0;
    session.card = card;
    session.flipped = false;

    $("#card-area").hidden = !card;
    $("#done").hidden = !!card;
    if (!card) return renderDone();
    renderCard(card);
  }

  function scheduleWake(q, now) {
    if (!q.learn.length) return;
    const wait = store.cards[q.learn[0].id].due - LEARN_AHEAD - now;
    session.timer = setTimeout(() => { if (!$("#view-study").hidden && !session.card) next(); }, Math.max(1000, wait + 500));
  }

  function renderDone() {
    const el = $("#done");
    if (session.mode === "practice") {
      el.innerHTML = `
        <div class="done-icon">✓</div>
        <h2>Practice round finished</h2>
        <p class="hint">${session.practiceDone} cards practised. Practice doesn't change your schedule.</p>
        <div class="actions center">
          <button class="btn btn-primary" id="done-again">Another round</button>
          <button class="btn btn-ghost" data-nav="home">Back home</button>
        </div>`;
      $("#done-again").onclick = () => startStudy("practice");
      return;
    }
    Sync.flush();
    const q = buildQueue();
    const more = q.newLeft === 0 && q.freshTotal > 0
      ? `<p class="hint">You've reached today's limit of ${store.settings.newPerDay} new cards (change it in settings).</p>` : "";
    const locked = q.locked ? `<p class="hint">${esc(lockedText(q.locked))}</p>` : "";
    el.innerHTML = `
      <div class="done-icon">✓</div>
      <h2>お疲れさまでした！</h2>
      <p>You're done for now. ${esc(nextDueText(q))}</p>
      ${more}${locked}
      <div class="actions center">
        <button class="btn btn-ghost" id="done-practice">Extra practice</button>
        <button class="btn btn-primary" data-nav="home">Back home</button>
      </div>`;
    $("#done-practice").onclick = () => startStudy("practice");
  }

  function renderCard(card) {
    const w = card.word;
    const s = store.cards[card.id];
    const cardEl = $("#card");
    const scene = cardEl.parentElement;
    // snap back to the front without animating the flip, then replay the entry animation
    cardEl.style.transition = "none";
    cardEl.classList.remove("flipped");
    scene.classList.remove("enter");
    void cardEl.offsetWidth;
    cardEl.style.transition = "";
    scene.classList.add("enter");

    const status = SRS.status(s);
    const meta = `
      <div class="card-meta">
        <span class="tag">${esc(w.lesson)}${w.s ? " · " + esc(w.s) : ""}</span>
        <span class="tag dir">${DIR_LABEL[card.dir]}</span>
        ${session.mode === "srs" ? `<span class="tag st st-${status}">${status}</span>` : ""}
      </div>
      ${w.star ? `<span class="card-star" title="On quizzes & tests">★</span>` : ""}`;

    const reading = w.kana ? `<div class="kana">${esc(w.kana)}</div>` : "";
    const romaji = `<div class="romaji">${esc(w.ro)}</div>`;
    const note = w.note ? `<div class="note">${esc(w.note)}</div>` : "";
    const jpBlock = (withReading, withRomaji) =>
      `<div class="jp-block">${withReading ? reading : ""}<div class="jp">${esc(w.jp)}</div>${withRomaji ? romaji : ""}</div>`;
    const speak = `<button class="speak" data-speak title="Listen (S)" aria-label="Listen">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg></button>`;

    let front;
    if (card.dir === "je") {
      front = `${meta}<div class="card-body">${jpBlock(store.settings.furigana, store.settings.romajiFront)}${note}</div>
        <div class="card-foot">What does it mean?</div>`;
    } else {
      front = `${meta}<div class="card-body"><div class="en big">${esc(w.en)}</div></div>
        <div class="card-foot">How do you say it in Japanese?</div>`;
    }
    const back = `${meta}<div class="card-body">
        ${jpBlock(true, true)}${note}
        <div class="divider"></div>
        <div class="en">${esc(w.en)}</div>
      </div>${speak}`;

    $("#card-front").innerHTML = front;
    $("#card-back").innerHTML = back;
    $("#btn-flip").hidden = false;
    $("#rate-buttons").hidden = true;

    if (session.mode === "srs") {
      const pv = SRS.preview(s, Date.now());
      $$("#rate-buttons .rate").forEach((b) => (b.querySelector(".rate-ivl").textContent = pv[b.dataset.rate]));
    } else {
      $$("#rate-buttons .rate").forEach((b) => (b.querySelector(".rate-ivl").textContent = b.dataset.rate === "again" ? "soon" : "done"));
    }
  }

  function flip() {
    if (!session.card || session.flipped) return;
    session.flipped = true;
    $("#card").classList.add("flipped");
    $("#btn-flip").hidden = true;
    $("#rate-buttons").hidden = false;
    if (store.settings.autoSpeak) speak(session.card.word);
  }

  function rate(rating) {
    const card = session.card;
    if (!card || !session.flipped) return;
    const now = Date.now();

    if (session.mode === "practice") {
      const q = session.practice;
      session.undo.push({ practice: q.slice(), practiceDone: session.practiceDone });
      q.shift();
      if (rating === "again") q.splice(Math.min(3, q.length), 0, card);
      else session.practiceDone++;
    } else {
      const prev = store.cards[card.id];
      session.undo.push({ id: card.id, prev });
      const ns = SRS.schedule(prev, rating, now);
      if (!prev) ns.first = now;
      setCard(card.id, ns);
    }
    if (session.undo.length > 50) session.undo.shift();
    session.lastId = card.id;
    next();
  }

  function undo() {
    const u = session.undo.pop();
    if (!u) return;
    let card;
    if (session.mode === "practice") {
      session.practice = u.practice;
      session.practiceDone = u.practiceDone;
      card = u.practice[0];
    } else {
      if (u.prev) setCard(u.id, u.prev);
      else removeCard(u.id);
      card = ALL_CARDS.find((c) => c.id === u.id);
    }
    next();
    // show the undone card again, regardless of what the queue would pick
    session.card = card;
    session.flipped = false;
    $("#card-area").hidden = false;
    $("#done").hidden = true;
    renderCard(card);
    toast("Undone");
  }

  // ---------- speech (built-in browser TTS, no dependency) ----------

  let jaVoice;
  function speak(word) {
    if (!("speechSynthesis" in window)) return;
    const text = (word.kana || word.jp).replace(/[〜~\-\[\]()（）]/g, "");
    if (!jaVoice) jaVoice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    if (jaVoice) u.voice = jaVoice;
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ---------- word list ----------

  function renderWords() {
    const sel = $("#word-lesson");
    if (!sel.options.length) {
      sel.innerHTML = `<option value="">All lessons</option>` + LESSONS.map((l) => `<option value="${esc(l.id)}">${esc(l.id)} – ${esc(l.title)}</option>`).join("");
    }
    const qText = $("#word-search").value.trim().toLowerCase();
    const lesson = sel.value;
    const starOnly = $("#word-star").checked;
    const now = Date.now();

    const rows = [];
    let n = 0, lastGroup = "";
    for (const w of WORDS) {
      if (lesson && w.lesson !== lesson) continue;
      if (starOnly && !w.star) continue;
      if (qText && ![w.jp, w.kana, w.ro, w.en, w.note].some((f) => f && f.toLowerCase().includes(qText))) continue;
      n++;
      const group = `${w.lesson} ${w.s || ""}`;
      if (group !== lastGroup) {
        rows.push(`<tr class="group"><td colspan="6">${esc(w.lesson)}${w.s ? " · " + esc(w.s) : ""}</td></tr>`);
        lastGroup = group;
      }
      rows.push(`<tr class="${w.star ? "starred" : ""}">
        <td class="star-cell">${w.star ? `<span class="star" title="On quizzes & tests">★</span>` : ""}</td>
        <td class="jp-cell"><span class="jp">${esc(w.jp)}</span>${w.kana ? `<span class="kana">${esc(w.kana)}</span>` : ""}${w.note ? `<span class="note">${esc(w.note)}</span>` : ""}</td>
        <td class="ro-cell">${esc(w.ro)}</td>
        <td>${esc(w.en)}</td>
        <td class="st-col">${statusPill(store.cards[w.id + ">je"], now)}</td>
        <td class="st-col">${statusPill(store.cards[w.id + ">ej"], now)}</td>
      </tr>`);
    }
    $("#word-rows").innerHTML = rows.join("") || `<tr><td colspan="6" class="empty">No words found.</td></tr>`;
    $("#word-count").textContent = `${n} word${n === 1 ? "" : "s"}`;
  }

  function statusPill(s, now) {
    const st = SRS.status(s);
    let due = "";
    if (s) {
      if (s.due <= now) due = "due";
      else if (s.step >= 0) due = SRS.formatDelta(s.due - now);
      else {
        const days = SRS.dayIndex(s.due) - today();
        due = days <= 1 ? "tomorrow" : `in ${days}d`;
      }
    }
    return `<span class="pill st-${st}" title="${st}${s ? ` · interval ${s.ivl}d · ease ${s.ease.toFixed(2)} · lapses ${s.lapses}` : ""}">${st}${due ? ` · ${due}` : ""}</span>`;
  }

  // ---------- settings ----------

  function openSettings() {
    $("#set-new").value = store.settings.newPerDay;
    $("#set-furigana").checked = store.settings.furigana;
    $("#set-romaji").checked = store.settings.romajiFront;
    $("#set-speak").checked = store.settings.autoSpeak;
    $("#settings").showModal();
  }

  function saveSettings() {
    const before = JSON.stringify(store.settings);
    const n = parseInt($("#set-new").value, 10);
    store.settings.newPerDay = Number.isFinite(n) && n >= 0 ? n : DEFAULTS.settings.newPerDay;
    store.settings.furigana = $("#set-furigana").checked;
    store.settings.romajiFront = $("#set-romaji").checked;
    store.settings.autoSpeak = $("#set-speak").checked;
    if (JSON.stringify(store.settings) !== before) {
      store.settingsMod = Date.now();
      changed();
    }
    if (!$("#view-home").hidden) renderHome();
    if (!$("#view-study").hidden && session.card && !session.flipped) renderCard(session.card);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(store, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `yabai-vocab-progress-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data.cards !== "object") throw new Error("bad file");
        if (!confirm("Replace your current progress with the imported file?")) return;
        // Stamp everything as changed now, so the import also wins on other devices.
        const now = Date.now();
        const imported = normalize(data);
        for (const id of Object.keys(store.cards)) if (!imported.cards[id]) imported.deleted[id] = now;
        for (const c of Object.values(imported.cards)) c.mod = now;
        imported.settingsMod = now;
        imported.filter = store.filter;
        store = imported;
        changed();
        toast("Progress imported");
        renderHome();
      } catch (e) {
        toast("That file doesn't look like a progress export");
      }
    };
    reader.readAsText(file);
  }

  // ---------- helpers ----------

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => (t.hidden = true), 250);
    }, 1600);
  }

  // ---------- events ----------

  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) return show(nav.dataset.nav);
    const r = e.target.closest("[data-rate]");
    if (r) return rate(r.dataset.rate);
    if (e.target.closest("[data-speak]")) {
      e.stopPropagation();
      return session.card && speak(session.card.word);
    }
  });

  $("#card").addEventListener("click", flip);
  $("#btn-flip").addEventListener("click", flip);
  $("#btn-undo").addEventListener("click", undo);
  $("#btn-study").addEventListener("click", () => startStudy("srs"));
  $("#btn-practice").addEventListener("click", () => startStudy("practice"));

  $$("#dir-seg button").forEach((b) =>
    b.addEventListener("click", () => {
      store.filter.dir = b.dataset.dir;
      save();
      renderHome();
    })
  );
  $("#star-only").addEventListener("change", (e) => {
    store.filter.starOnly = e.target.checked;
    save();
    renderHome();
  });

  $("#word-search").addEventListener("input", renderWords);
  $("#word-lesson").addEventListener("change", renderWords);
  $("#word-star").addEventListener("change", renderWords);

  $("#open-settings").addEventListener("click", openSettings);
  $("#settings").addEventListener("close", saveSettings);
  $("#btn-export").addEventListener("click", exportData);
  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  });
  $("#btn-reset").addEventListener("click", () => {
    if (!confirm("Reset ALL learning progress? This cannot be undone (export first if unsure).")) return;
    const now = Date.now();
    for (const id of Object.keys(store.cards)) store.deleted[id] = now;
    store.cards = {};
    changed();
    $("#settings").close();
    toast("Progress reset");
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ($("#settings").open || e.target.matches("input, select, textarea")) return;
    if ($("#view-study").hidden) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "enter") {
      e.preventDefault();
      if (!session.flipped) flip();
      else if (k === " ") rate("good");
    } else if (["1", "2", "3", "4"].includes(k) && session.flipped) {
      rate(SRS.RATINGS[+k - 1]);
    } else if (k === "z") {
      undo();
    } else if (k === "s" && session.card) {
      speak(session.card.word);
    } else if (k === "escape") {
      show("home");
    }
  });

  // Refresh counts when coming back to the tab later (e.g. next day)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!$("#view-home").hidden) renderHome();
    else if (!$("#view-study").hidden && !session.card) next();
  });

  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => (jaVoice = null);

  // ---------- sync ----------

  function applyRemote(merged) {
    store = { ...store, ...merged, settings: { ...DEFAULTS.settings, ...merged.settings } };
    save();
    if (!$("#view-home").hidden) renderHome();
    else if (!$("#view-words").hidden) renderWords();
    else if (!$("#view-study").hidden && !session.card) next();
  }

  function renderSyncStatus(st) {
    const ind = $("#sync-indicator");
    ind.hidden = !st.connected;
    ind.dataset.state = st.state;
    const ago = st.lastSync ? timeAgo(st.lastSync) : "never";
    const text = {
      off: "Not connected. Progress is only stored on this device.",
      ok: `Synced ${ago}.`,
      syncing: "Syncing…",
      pending: "New answers will sync at the end of the session.",
      offline: st.message,
      error: st.message,
    }[st.state] || "";
    ind.title = text;
    $("#sync-status").textContent = st.state === "off" && st.message ? st.message : text;
    $("#sync-status").dataset.state = st.state === "off" && st.message ? "error" : st.state;
    $("#sync-setup").hidden = st.connected;
    $("#sync-connected").hidden = !st.connected;
    const link = $("#sync-gist");
    link.href = Sync.gistUrl();
  }

  function timeAgo(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(ts).toLocaleDateString();
  }

  async function connectSync() {
    const btn = $("#btn-sync-connect");
    btn.disabled = true;
    try {
      await Sync.connect($("#sync-token").value);
      $("#sync-token").value = "";
      toast("Sync connected");
    } catch (e) {
      /* status line shows the error */
    } finally {
      btn.disabled = false;
    }
  }

  $("#btn-sync-connect").addEventListener("click", connectSync);
  $("#sync-token").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); connectSync(); }
  });
  $("#btn-sync-now").addEventListener("click", () => Sync.sync());
  $("#btn-sync-disconnect").addEventListener("click", () => {
    if (confirm("Stop syncing on this device? Your progress stays here and on GitHub.")) Sync.disconnect();
  });
  $("#sync-indicator").addEventListener("click", () => Sync.sync());
  $("#open-settings").addEventListener("click", () => renderSyncStatus(Sync.status()));

  Sync.init({
    getData: () => store,
    applyRemote,
    onStatus: renderSyncStatus,
  });

  // ---------- offline support / installable app ----------

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  show("home");
})();
