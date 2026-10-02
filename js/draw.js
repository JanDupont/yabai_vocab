// Kanji drawing pad. Strokes come from KanjiVG (data/kanjivg.js): one SVG path per
// stroke, in stroke order, in a 109 × 109 box.
//
// With checking on, every stroke you draw is compared with the next expected stroke.
// A good one snaps to the model stroke, a bad one fades out. With checking off (or for
// a kanji without stroke data) the pad is a plain sketch area.
const Draw = (() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const SIZE = 109;
  const POINTS = 24;      // samples per stroke when comparing
  const MIN_LENGTH = 3;   // shorter than this is a tap, not a stroke
  const END_TOL = 22;     // how far start and end may be off
  const MEAN_TOL = 14;    // how far the stroke may be off on average
  const SHORT = 15;       // dots and ticks: no length check
  const HINT_AFTER = 3;   // misses on the same stroke before the model stroke is shown
  const SNAP_MS = 150;

  function node(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function length(pts) {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
    return l;
  }

  // n points spread evenly along the line
  function resample(pts, n) {
    const total = length(pts);
    if (!total) return Array.from({ length: n }, () => pts[0]);
    const out = [pts[0]];
    let i = 1, walked = 0;
    for (let k = 1; k < n - 1; k++) {
      const target = (total * k) / (n - 1);
      while (i < pts.length - 1 && walked + dist(pts[i - 1], pts[i]) < target) walked += dist(pts[i - 1], pts[i++]);
      const seg = dist(pts[i - 1], pts[i]) || 1;
      const t = (target - walked) / seg;
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function matches(user, model) {
    const u = resample(user, POINTS);
    if (dist(u[0], model.pts[0]) > END_TOL || dist(u[POINTS - 1], model.pts[POINTS - 1]) > END_TOL) return false;
    let sum = 0;
    for (let i = 0; i < POINTS; i++) sum += dist(u[i], model.pts[i]);
    if (sum / POINTS > MEAN_TOL) return false;
    const len = length(user);
    return model.len < SHORT ? len < SHORT * 3 : len > model.len * 0.4 && len < model.len * 2.2;
  }

  const fmt = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  // opts: strokes (path data, may be missing), check, onDone(), onMessage(text)
  function create(host, opts) {
    const strokes = opts.strokes || [];
    const check = !!opts.check && strokes.length > 0;

    const svg = node("svg", { viewBox: `0 0 ${SIZE} ${SIZE}`, class: "pad" });
    node("path", { class: "pad-guide", d: `M${SIZE / 2},4V${SIZE - 4}M4,${SIZE / 2}H${SIZE - 4}` }, svg);
    const gDone = node("g", { class: "pad-done" }, svg);
    const gUser = node("g", { class: "pad-user" }, svg);
    host.replaceChildren(svg);

    // Sample the model strokes once (the paths have to be in the document to be measured).
    const gModel = node("g", { visibility: "hidden" }, svg);
    const models = !check ? [] : strokes.map((d) => {
      const p = node("path", { d }, gModel);
      const len = p.getTotalLength();
      const pts = Array.from({ length: POINTS }, (_, i) => {
        const pt = p.getPointAtLength((len * i) / (POINTS - 1));
        return [pt.x, pt.y];
      });
      return { d, len, pts };
    });
    gModel.remove();

    const state = { done: 0, misses: 0, hints: 0, run: 0, drawn: [] };
    let cur = null; // stroke being drawn: { id, pts, line }

    const say = (text) => opts.onMessage && opts.onMessage(text);
    const finished = () => check && state.done === models.length;

    function point(e) {
      const r = svg.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
    }

    svg.addEventListener("pointerdown", (e) => {
      if (cur || finished() || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      const p = point(e);
      cur = { id: e.pointerId, pts: [p], line: node("polyline", { points: fmt([p]) }, gUser) };
      say("");
    });

    svg.addEventListener("pointermove", (e) => {
      if (!cur || e.pointerId !== cur.id) return;
      const p = point(e);
      if (dist(p, cur.pts[cur.pts.length - 1]) < 0.6) return;
      cur.pts.push(p);
      cur.line.setAttribute("points", fmt(cur.pts));
    });

    function end(e) {
      if (!cur || e.pointerId !== cur.id) return;
      const { pts, line } = cur;
      cur = null;
      if (length(pts) < MIN_LENGTH) return line.remove();
      if (!check) return state.drawn.push({ pts, line });
      if (matches(pts, models[state.done])) return snap(pts, line);

      state.misses++;
      state.run++;
      line.classList.add("bad");
      setTimeout(() => line.remove(), 400);
      const model = models[state.done];
      if (matches(pts.slice().reverse(), model)) say("Right stroke, wrong direction");
      else if (models.some((m, i) => i > state.done && matches(pts, m))) say("That stroke comes later");
      else say("");
      if (state.run >= HINT_AFTER) hint();
    }
    svg.addEventListener("pointerup", end);
    // The browser took the gesture over (scroll, zoom): drop the stroke instead of judging a stub.
    svg.addEventListener("pointercancel", (e) => {
      if (!cur || e.pointerId !== cur.id) return;
      cur.line.remove();
      cur = null;
    });
    // iOS Safari doesn't reliably honour touch-action on SVG, so a vertical stroke would scroll
    // the page and cancel the pointer. Blocking the touch events themselves always works.
    for (const type of ["touchstart", "touchmove"]) {
      svg.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }

    // Replace the drawn stroke with the model stroke, with a short morph in between.
    function snap(pts, line) {
      const model = models[state.done];
      const from = resample(pts, POINTS);
      const path = node("path", { d: model.d });
      state.done++;
      state.run = 0;
      const t0 = performance.now();
      (function frame(now) {
        const t = Math.min(1, (now - t0) / SNAP_MS);
        if (t < 1) {
          line.setAttribute("points", fmt(from.map((p, i) => [p[0] + (model.pts[i][0] - p[0]) * t, p[1] + (model.pts[i][1] - p[1]) * t])));
          return requestAnimationFrame(frame);
        }
        line.remove();
        // an undo or clear during the morph may have taken this stroke back already
        if (gDone.children.length < state.done) gDone.appendChild(path);
      })(t0);
      if (finished() && opts.onDone) opts.onDone();
    }

    function hint() {
      if (!check || finished()) return;
      state.hints++;
      state.run = 0;
      const p = node("path", { d: models[state.done].d, class: "pad-hint" }, svg);
      setTimeout(() => p.remove(), 1200);
    }

    function undo() {
      say("");
      if (!check) {
        const last = state.drawn.pop();
        if (last) last.line.remove();
      } else if (state.done > 0) {
        state.done--;
        state.run = 0;
        if (gDone.children.length > state.done) gDone.lastChild.remove();
      }
    }

    function clear() {
      say("");
      state.done = 0;
      state.run = 0;
      state.drawn = [];
      gDone.replaceChildren();
      gUser.replaceChildren();
    }

    return {
      check,
      hint,
      undo,
      clear,
      result: () => ({
        check,
        finished: finished(),
        done: state.done,
        total: strokes.length,
        misses: state.misses,
        hints: state.hints,
        drawn: state.drawn.map((s) => s.pts),
      }),
    };
  }

  // Model kanji with stroke numbers, as SVG markup. `drawn` lays the user's own strokes on top.
  function diagram(strokes, drawn) {
    if (!strokes || !strokes.length) return "";
    const paths = strokes.map((d) => `<path d="${d}"/>`).join("");
    const numbers = strokes.map((d, i) => {
      const m = /^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(d);
      return m ? `<text x="${(+m[1] - 4).toFixed(1)}" y="${(+m[2] - 1.5).toFixed(1)}">${i + 1}</text>` : "";
    }).join("");
    const own = (drawn || []).map((pts) => `<polyline points="${fmt(pts)}"/>`).join("");
    return `<svg viewBox="0 0 ${SIZE} ${SIZE}" class="pad diagram${own ? " compare" : ""}">
      <g class="pad-done">${paths}</g><g class="pad-user">${own}</g><g class="pad-numbers">${numbers}</g></svg>`;
  }

  return { create, diagram };
})();
