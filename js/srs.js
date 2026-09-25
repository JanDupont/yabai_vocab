// Small Anki-style (SM-2 variant) scheduler.
//
// Card state:
//   step   >= 0 : in (re)learning, index into the step list, `due` is a timestamp
//   step  == -1 : review card, `due` is the start of the due day
//   ivl         : current interval in days (0 while never graduated)
//   ease        : interval multiplier for "Good"
//   relearn     : true when the card is relearning after a lapse
const SRS = (() => {
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const DAY_ROLLOVER_HOURS = 4; // a "day" starts at 04:00 local time, like Anki

  const LEARN_STEPS = [1, 10]; // minutes
  const RELEARN_STEPS = [10];  // minutes
  const GRAD_IVL = 1;          // days after finishing learning with Good
  const EASY_IVL = 4;          // days when pressing Easy on a new/learning card
  const START_EASE = 2.5;
  const MIN_EASE = 1.3;
  const MAX_IVL = 180;         // even well-known words come back at least twice a year
  const LAPSE_FACTOR = 0.2;    // interval multiplier after forgetting

  const RATINGS = ["again", "hard", "good", "easy"];

  function dayIndex(ts) {
    const d = new Date(ts - DAY_ROLLOVER_HOURS * 60 * MIN);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  }

  function startOfDay(index) {
    const d = new Date(index * DAY);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), DAY_ROLLOVER_HOURS).getTime();
  }

  function newState() {
    return { step: 0, ivl: 0, ease: START_EASE, reps: 0, lapses: 0, relearn: false, due: 0 };
  }

  function fuzz(ivl, rand) {
    if (ivl < 3) return ivl;
    const spread = Math.max(1, Math.round(ivl * 0.05));
    return ivl + Math.round((rand() * 2 - 1) * spread);
  }

  function clampIvl(ivl) {
    return Math.min(MAX_IVL, Math.max(1, Math.round(ivl)));
  }

  // Returns a new state. `rand` is injectable so previews can be deterministic.
  function schedule(prev, rating, now, rand = Math.random) {
    const s = { ...(prev || newState()) };
    s.reps += 1;
    s.last = now;
    const today = dayIndex(now);

    const toReview = (ivl) => {
      s.ivl = clampIvl(ivl);
      s.step = -1;
      s.relearn = false;
      s.due = startOfDay(today + s.ivl);
    };

    if (s.step >= 0) {
      const steps = s.relearn ? RELEARN_STEPS : LEARN_STEPS;
      const step = Math.min(s.step, steps.length - 1);
      if (rating === "again") {
        s.step = 0;
        s.due = now + steps[0] * MIN;
      } else if (rating === "hard") {
        const cur = steps[step];
        const next = steps[step + 1];
        const mins = step === 0 && next ? (cur + next) / 2 : cur * 1.5;
        s.due = now + mins * MIN;
      } else if (rating === "good") {
        if (step + 1 < steps.length) {
          s.step = step + 1;
          s.due = now + steps[step + 1] * MIN;
        } else {
          toReview(s.relearn ? s.ivl : GRAD_IVL);
        }
      } else if (rating === "easy") {
        toReview(s.relearn ? s.ivl + 1 : EASY_IVL);
      }
      return s;
    }

    // Review card. Account for studying late: credit the extra days it actually held.
    const scheduledStart = s.due - s.ivl * DAY;
    const elapsed = Math.max(s.ivl, Math.round((now - scheduledStart) / DAY));
    if (rating === "again") {
      s.lapses += 1;
      s.ease = Math.max(MIN_EASE, s.ease - 0.2);
      s.ivl = clampIvl(s.ivl * LAPSE_FACTOR);
      s.step = 0;
      s.relearn = true;
      s.due = now + RELEARN_STEPS[0] * MIN;
    } else if (rating === "hard") {
      s.ease = Math.max(MIN_EASE, s.ease - 0.15);
      toReview(fuzz(Math.max(s.ivl + 1, s.ivl * 1.2), rand));
    } else if (rating === "good") {
      toReview(fuzz(Math.max(s.ivl + 1, elapsed * s.ease), rand));
    } else if (rating === "easy") {
      const good = Math.max(s.ivl + 1, elapsed * s.ease);
      s.ease += 0.15;
      toReview(fuzz(Math.max(good + 1, elapsed * s.ease * 1.3), rand));
    }
    return s;
  }

  // Human-readable "next time you'll see it" label for each rating button.
  function preview(prev, now) {
    const out = {};
    for (const r of RATINGS) {
      const s = schedule(prev, r, now, () => 0.5);
      out[r] = s.step >= 0 ? formatDelta(s.due - now) : formatDays(s.ivl);
    }
    return out;
  }

  function formatDelta(ms) {
    const m = Math.round(ms / MIN);
    if (m < 1) return "<1m";
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h`;
    return formatDays(Math.round(h / 24));
  }

  function formatDays(d) {
    if (d < 31) return `${d}d`;
    if (d < 365) return `${Math.round(d / 30)}mo`;
    return `${(d / 365).toFixed(1)}y`;
  }

  // new | learning | young | mature — used for colour coding in the word list
  function status(s) {
    if (!s) return "new";
    if (s.step >= 0) return "learning";
    return s.ivl >= 21 ? "mature" : "young";
  }

  return { schedule, preview, status, dayIndex, startOfDay, formatDelta, RATINGS, MIN, DAY };
})();
