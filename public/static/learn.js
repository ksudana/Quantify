// Learn tab — guided, interactive circuit-building lessons.
// Reuses app.js globals: $, esc, renderCircuit, freshState, applyGateTo,
// ketBits, baseGate, showTip, scheduleHideTip, hideTipNow. Lesson data in lessons.js.

const genView = $("genView");
const learnView = $("learnView");
const learnCatalogEl = $("learnCatalog");
const learnPlayerEl = $("learnPlayer");
const lpBody = $("lpBody");

/* ---------- tabs ---------- */

function showTab(which) {
  lstStop();
  const learn = which === "learn";
  genView.hidden = learn;
  learnView.hidden = !learn;
  $("tabGen").classList.toggle("active", !learn);
  $("tabLearn").classList.toggle("active", learn);
  if (learn) renderCatalog();
  const wantHash = learn ? "#learn" : location.pathname + location.search;
  if (location.hash !== (learn ? "#learn" : "")) history.replaceState(null, "", wantHash);
}

$("tabGen").addEventListener("click", () => showTab("gen"));
$("tabLearn").addEventListener("click", () => showTab("learn"));

/* ---------- progress store ---------- */

const PROG_KEY = "quantify.learn.v1";

function loadProg() {
  try { return JSON.parse(localStorage.getItem(PROG_KEY))?.lessons || {}; }
  catch { return {}; }
}
let prog = loadProg();
function saveProg() {
  try { localStorage.setItem(PROG_KEY, JSON.stringify({ v: 1, lessons: prog })); }
  catch { /* private mode etc — progress just won't persist */ }
}

$("learnReset").addEventListener("click", () => {
  if (!confirm("Reset all Learn progress?")) return;
  prog = {};
  saveProg();
  renderCatalog();
});

/* ---------- tiny helpers ---------- */

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// Minimal markdown: paragraphs, `- ` bullets, `code`, **bold**.
function inlineMd(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function fmtMd(md) {
  const frag = document.createDocumentFragment();
  for (const para of md.trim().split(/\n\s*\n/)) {
    const lines = para.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^[-*]\s+/.test(l))) {
      const ul = el("ul");
      for (const l of lines) ul.append(el("li", null, inlineMd(l.replace(/^[-*]\s+/, ""))));
      frag.append(ul);
    } else {
      frag.append(el("p", null, lines.map(inlineMd).join("<br>")));
    }
  }
  return frag;
}

/* ---------- learner stepper (standalone twin of the generate-view sim) ---------- */

const lst = {
  n: 0, st: null, moments: [], layout: null, host: null,
  stateEl: null, labelEl: null, playBtn: null, rows: [],
  timer: null, step: 0, speed: 650, onDone: null, done: false,
};

function lstAttach(opts) {
  Object.assign(lst, {
    host: opts.host, stateEl: opts.stateEl, labelEl: opts.labelEl,
    playBtn: opts.playBtn || null, n: opts.n,
    moments: opts.model ? opts.model.moments : [],
    layout: opts.model ? opts.model.layout : null,
    speed: opts.speed || 650,
  });
  const size = 1 << lst.n;
  lst.stateEl.replaceChildren();
  lst.rows = [];
  for (let s = 0; s < size; s++) {
    const row = el("div", "sim-row");
    row.append(
      el("span", "sim-ket", `|${ketBits(s, lst.n)}⟩`),
      (() => { const w = el("div", "sim-barwrap"); w.append(el("div", "sim-bar")); return w; })(),
      el("span", "sim-pct", "0%"),
    );
    lst.stateEl.append(row);
    lst.rows.push({
      row,
      bar: row.querySelector(".sim-bar"),
      pct: row.querySelector(".sim-pct"),
    });
  }
  lstReset();
}

function lstRender() {
  const { re, im } = lst.st;
  for (let s = 0; s < lst.rows.length; s++) {
    const p = re[s] * re[s] + im[s] * im[s];
    const { row, bar, pct } = lst.rows[s];
    bar.style.width = (p * 100).toFixed(1) + "%";
    if (p > 1e-6) {
      const phase = Math.atan2(im[s], re[s]);
      const hue = ((phase * 180) / Math.PI + 360) % 360;
      bar.style.background = `hsl(${hue.toFixed(0)},70%,58%)`;
      row.style.opacity = "1";
      const sign = im[s] >= 0 ? "+" : "";
      row.title = `amplitude ${re[s].toFixed(3)}${sign}${im[s].toFixed(3)}i · ${(p * 100).toFixed(1)}%`;
    } else {
      bar.style.background = "rgba(255,255,255,0.12)";
      row.style.opacity = "0.45";
      row.title = "0%";
    }
    pct.textContent = (p * 100).toFixed(1) + "%";
  }
}

function lstHighlight(col) {
  const h = lst.host && lst.host.querySelector(".cg-hl");
  if (!h || !lst.layout) return;
  if (col < 0) { h.style.opacity = "0"; return; }
  h.setAttribute("x", lst.layout.LEFT + col * lst.layout.COLW);
  h.style.opacity = "1";
}

function lstLabel() {
  if (lst.labelEl) lst.labelEl.textContent = `moment ${lst.step} / ${lst.moments.length}`;
}

function lstPause() {
  if (lst.timer) { clearInterval(lst.timer); lst.timer = null; }
  if (lst.playBtn) lst.playBtn.textContent = "▶ Play";
}

function lstReset() {
  lstPause();
  lst.st = freshState(lst.n);
  lst.step = 0;
  lst.done = false;
  lstHighlight(-1);
  lstRender();
  lstLabel();
}

function lstFwd() {
  if (lst.step >= lst.moments.length) return false;
  for (const g of lst.moments[lst.step]) applyGateTo(lst.st.re, lst.st.im, lst.n, g);
  lstHighlight(lst.step);
  lst.step++;
  lstRender();
  lstLabel();
  if (lst.step >= lst.moments.length) {
    lstPause();
    lst.done = true;
    if (lst.onDone) { const f = lst.onDone; lst.onDone = null; f(); }
  }
  return true;
}

function lstPlay() {
  if (lst.timer || !lst.moments.length) return;
  if (lst.step >= lst.moments.length) lstReset();
  if (lst.playBtn) lst.playBtn.textContent = "⏸ Pause";
  lst.timer = setInterval(() => { if (!lstFwd()) lstPause(); }, lst.speed);
}

function lstStop() {
  lstPause();
  lst.onDone = null;
}

/* ---------- diagram decorations for Learn-tab SVG hosts ---------- */

// Invisible per-wire hit areas so gates can be placed by clicking the wire.
function decorateWires(host, model) {
  const svg = host.querySelector("svg");
  if (!svg || !model) return;
  svg.querySelectorAll(".lp-wire").forEach((r) => r.remove());
  const { LEFT, TOP, ROWH, W } = model.layout;
  for (let q = 0; q < model.nq; q++) {
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", LEFT);
    r.setAttribute("y", TOP + q * ROWH);
    r.setAttribute("width", W - LEFT - 8);
    r.setAttribute("height", ROWH);
    r.setAttribute("fill", "transparent");
    r.setAttribute("class", "lp-wire");
    r.dataset.q = q;
    svg.append(r);
  }
}

// Same hover-tooltips as the generate view, bound to a Learn-tab SVG host.
function decorateTips(host) {
  if (host.dataset.tipsBound) return;
  host.dataset.tipsBound = "1";
  host.addEventListener("mouseover", (e) => {
    const g = e.target.closest(".cg-gate");
    if (g) showTip(g);
  });
  host.addEventListener("mouseout", (e) => {
    if (e.target.closest(".cg-gate")) scheduleHideTip();
  });
}

/* ---------- catalog ---------- */

const LEVEL_CLS = { Beginner: "lv-b", Intermediate: "lv-i", Advanced: "lv-a" };

function lessonUnlocked(id) {
  const p = prog[id];
  return p?.done ? Infinity : (p?.step || 0);
}

function renderCatalog() {
  learnCatalogEl.replaceChildren();
  LESSONS.forEach((lsn, i) => {
    const p = prog[lsn.id];
    const frac = p?.done ? 1 : Math.min(1, (p?.step || 0) / lsn.steps.length);
    const card = el("div", "lesson-card" + (p?.done ? " done" : ""));
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    const state = p?.done ? "✓ Complete" : frac > 0 ? "Continue →" : "Start →";
    card.innerHTML = `
      <div class="lc-top">
        <span class="lv ${LEVEL_CLS[lsn.level] || ""}">${esc(lsn.level)}</span>
        <span class="lc-min">~${lsn.minutes} min</span>
      </div>
      <h3><span class="lc-num">${i + 1}</span>${esc(lsn.title)}</h3>
      <p>${esc(lsn.blurb)}</p>
      <div class="lc-bottom">
        <div class="lc-bar"><i style="width:${Math.round(frac * 100)}%"></i></div>
        <span class="lc-state">${state}</span>
      </div>`;
    const open = () => openLesson(i);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
    learnCatalogEl.append(card);
  });
}

/* ---------- player shell ---------- */

let cur = null; // { i, lesson, si, doneThis }

function openLesson(i) {
  const lsn = LESSONS[i];
  cur = { i, lesson: lsn, si: 0, doneThis: false };
  learnCatalogEl.hidden = true;
  learnPlayerEl.hidden = false;
  $("lpTitle").textContent = lsn.title;
  const lv = $("lpLevel");
  lv.textContent = lsn.level;
  lv.className = "lv " + (LEVEL_CLS[lsn.level] || "");
  gotoStep(prog[lsn.id]?.done ? 0 : Math.min(prog[lsn.id]?.step || 0, lsn.steps.length - 1));
}

function unlockedIdx() {
  const cap = cur.lesson.steps.length - 1;
  const u = lessonUnlocked(cur.lesson.id);
  return u === Infinity ? cap : Math.min(u, cap);
}

function gotoStep(si) {
  const steps = cur.lesson.steps;
  si = Math.max(0, Math.min(si, steps.length - 1));
  si = Math.min(si, unlockedIdx());
  cur.si = si;
  cur.doneThis = si < unlockedIdx(); // revisiting an already-passed step
  prog[cur.lesson.id] = prog[cur.lesson.id] || { step: 0 };
  prog[cur.lesson.id].step = Math.max(prog[cur.lesson.id].step, si);
  saveProg();

  lstStop();
  renderDots();
  lpBody.replaceChildren();
  renderStep(steps[si]);
  renderNav();
  $("lpProgressTxt").textContent = `Step ${si + 1} of ${steps.length}`;
  learnPlayerEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function markDone() {
  cur.doneThis = true;
  prog[cur.lesson.id].step = Math.max(prog[cur.lesson.id].step, cur.si + 1);
  saveProg();
  renderDots();
  renderNav();
}

function renderDots() {
  const dots = $("lpDots");
  dots.replaceChildren();
  const unlocked = unlockedIdx();
  cur.lesson.steps.forEach((st, i) => {
    const d = el("button", "lp-dot");
    d.type = "button";
    d.title = `${i + 1}. ${st.title}`;
    d.classList.toggle("open", i <= unlocked);
    d.classList.toggle("done", i < unlocked || (cur.doneThis && i === cur.si));
    d.classList.toggle("current", i === cur.si);
    d.disabled = i > unlocked;
    d.addEventListener("click", () => { if (d.disabled) return; gotoStep(i); });
    dots.append(d);
  });
}

function renderNav() {
  const last = cur.si === cur.lesson.steps.length - 1;
  const canNext = cur.si < unlockedIdx() || cur.doneThis;
  $("lpPrev").disabled = cur.si === 0;
  const next = $("lpNext");
  next.disabled = !canNext;
  next.classList.toggle("ready", canNext);
  next.textContent = last ? "Finish ✓" : "Next →";
}

$("lpBack").addEventListener("click", showCatalog);
$("lpPrev").addEventListener("click", () => gotoStep(cur.si - 1));
$("lpNext").addEventListener("click", () => {
  if ($("lpNext").disabled || !cur) return;
  if (cur.si === cur.lesson.steps.length - 1) completeLesson();
  else gotoStep(cur.si + 1);
});

function showCatalog() {
  lstStop();
  learnPlayerEl.hidden = true;
  $("lpFoot").hidden = false;
  learnCatalogEl.hidden = false;
  renderCatalog();
}

function completeLesson() {
  prog[cur.lesson.id].done = true;
  saveProg();
  lstStop();
  $("lpFoot").hidden = true;
  lpBody.replaceChildren();
  const box = el("div", "finish");
  box.append(
    el("h3", null, "Lesson complete ✓"),
    el("p", null, inlineMd(`**${cur.lesson.title}** — all ${cur.lesson.steps.length} steps done. The next lesson builds directly on this one.`)),
  );
  const row = el("div", "finish-actions");
  if (cur.i + 1 < LESSONS.length) {
    const nxt = el("button", "go-sm", `Next lesson: ${esc(LESSONS[cur.i + 1].title)} →`);
    nxt.addEventListener("click", () => { $("lpFoot").hidden = false; openLesson(cur.i + 1); });
    row.append(nxt);
  }
  const back = el("button", "ghost", "Back to all lessons");
  back.addEventListener("click", () => showCatalog());
  row.append(back);
  box.append(row);
  lpBody.append(box);
}

/* ---------- keyboard navigation ---------- */

// Build steps install this so Esc can cancel an in-progress gate placement.
let cancelPlacementHook = null;

document.addEventListener("keydown", (e) => {
  if (!genView.hidden || !cur || learnPlayerEl.hidden || $("lpFoot").hidden) return;
  // Capture phase: app.js's own Escape handler closes the reference overlay in
  // bubble phase — checking here first tells us whether it *was* open.
  if (!$("ref").hidden) return;
  const tag = document.activeElement?.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") return;
  if (e.key === "Escape") {
    if (cancelPlacementHook) { cancelPlacementHook(); return; }
    showCatalog();
  } else if (e.key === "ArrowRight" && !$("lpNext").disabled) {
    $("lpNext").click();
  } else if (e.key === "ArrowLeft" && !$("lpPrev").disabled) {
    $("lpPrev").click();
  }
}, true);

/* ---------- step renderers ---------- */

function addBody(...nodes) {
  lpBody.append(...nodes);
}

function stepHead(step) {
  const wrap = el("div", "step-head");
  wrap.append(el("h3", "step-title", esc(step.title)));
  return wrap;
}

function mdBox(step) {
  const box = el("div", "md");
  box.append(fmtMd(step.md));
  return box;
}

function renderTextStep(head, mdb) {
  addBody(head, mdb);
  markDone(); // reading steps never gate progress
}

function renderExploreStep(head, mdb, step) {
  const cap = el("div", "circuit-cap");
  cap.append(el("span", null, "Circuit"));
  const ctrls = el("div", "sim-ctrls");
  const play = el("button", "ghost", "▶ Play");
  const stepB = el("button", "ghost", "Step");
  const restart = el("button", "ghost", "Restart");
  const label = el("span", "sim-step");
  ctrls.append(play, stepB, restart, label);
  cap.append(ctrls);

  const host = el("div", "circuit-svg lp-circuit");
  const state = el("div", "sim-state");
  const note = el("div", "sim-note", "Statevector simulation in your browser · bar length = probability, color = phase");

  let interacted = false;
  const unlockOnce = () => { if (!interacted) { interacted = true; markDone(); } };
  play.addEventListener("click", () => { unlockOnce(); lst.timer ? lstPause() : lstPlay(); });
  stepB.addEventListener("click", () => { unlockOnce(); lstPause(); lstFwd(); });
  restart.addEventListener("click", () => { unlockOnce(); lstReset(); });

  addBody(head, mdb, cap, host, state, note);

  const model = renderCircuit(step.spec, { host, hlId: "lp-hl", silent: true });
  decorateTips(host);
  lstAttach({ host, stateEl: state, labelEl: label, playBtn: play, n: step.spec.qubits, model });
  decorateWires(host, model);
  lstPlay(); // animate once on entry — any control interaction unlocks Next
}

function renderQuizStep(head, mdb, step) {
  const q = el("div", "quiz-q", inlineMd(step.q));
  const opts = el("div", "quiz-opts");
  const feed = el("div", "quiz-feed");
  feed.hidden = true;

  step.options.forEach((opt, i) => {
    const b = el("button", "quiz-opt", inlineMd(opt));
    b.type = "button";
    b.addEventListener("click", () => {
      if (b.disabled || opts.querySelector(".correct")) return;
      if (i === step.answer) {
        b.classList.add("correct");
        opts.querySelectorAll(".quiz-opt").forEach((o) => (o.disabled = true));
        feed.className = "quiz-feed ok";
        feed.innerHTML = inlineMd(step.explain);
        feed.hidden = false;
        markDone();
      } else {
        b.classList.add("wrong");
        b.disabled = true;
        feed.className = "quiz-feed bad";
        feed.textContent = "Not quite — that path closes off. Try another.";
        feed.hidden = false;
      }
    });
    opts.append(b);
  });

  addBody(head, mdb, q, opts, feed);
}

function renderBuildStep(head, mdb, step) {
  const goal = el("div", "goal-pill", `<strong>Goal</strong>${esc(step.goal)}`);
  const status = el("div", "b-status", "Pick a gate from the palette, then click a wire to place it.");
  const palette = el("div", "palette");
  const host = el("div", "circuit-svg lp-circuit");
  host.id = "bCircuit";
  const actions = el("div", "b-actions");
  const undo = el("button", "ghost", "Undo");
  undo.id = "bUndo";
  const clear = el("button", "ghost", "Clear");
  clear.id = "bClear";
  const run = el("button", "go-sm", "▶ Run & check");
  run.id = "bRun";
  actions.append(undo, clear, run);
  const feed = el("div", "b-feed");
  feed.id = "bFeed";
  const state = el("div", "sim-state");

  const S = {
    gates: step.start.map((g) => ({ ...g })),
    pend: null, // palette definition awaiting wire clicks
    picks: [],
    attempts: 0,
    solved: false,
  };

  function clearArmed() {
    palette.querySelectorAll(".armed").forEach((x) => x.classList.remove("armed"));
  }
  function clearSel() {
    host.querySelectorAll(".lp-wire.sel").forEach((r) => r.classList.remove("sel"));
  }
  function cancelPendingPlacement() {
    S.pend = null;
    S.picks = [];
    clearArmed();
    clearSel();
    updateStatus();
  }

  function updateStatus(extra) {
    status.textContent = extra || statusText();
  }

  function statusText() {
    if (!S.pend) {
      return S.gates.length
        ? `${S.gates.length} gate${S.gates.length === 1 ? "" : "s"} placed · pick another gate or Run & check`
        : "Pick a gate from the palette, then click a wire to place it.";
    }
    const have = S.picks.length;
    if (have === 0) {
      if (S.pend.arity >= 3) return "CCX: click control 1 of 2, then the target.";
      if (S.pend.swapMode) return "SWAP: click the first wire.";
      return `${S.pend.label}: click the control wire.`;
    }
    if (S.pend.arity >= 3 && have === 1) return "CCX: click control 2 of 2.";
    if (S.pend.arity >= 3) return "CCX: now click the target wire.";
    if (S.pend.swapMode) return "SWAP: click the second wire.";
    return `${S.pend.label}: now click the target wire.`;
  }

  // --- palette buttons ---
  for (const id of step.palette) {
    const def = PALETTE_DEFS[id];
    if (!def) continue;
    const b = el("button", "pal-btn", esc(def.label));
    b.type = "button";
    b.title = def.tip;
    b.dataset.pal = id;
    b.addEventListener("click", () => {
      if (S.pend && S.pend.id === id) { cancelPendingPlacement(); return; }
      // Carry the palette id so commit can resolve the gate name.
      S.pend = { id, ...def };
      S.picks = [];
      clearArmed();
      clearSel();
      b.classList.add("armed");
      updateStatus();
    });
    palette.append(b);
  }

  // --- redraw circuit + rewire stepper after any edit ---
  function redraw() {
    const spec = S.gates.length
      ? { qubits: step.qubits, gates: S.gates.map((g) => ({ ...g })) }
      : { qubits: step.qubits, gates: [{ name: "barrier" }] }; // empty canvas: wires only
    const model = renderCircuit(spec, { host, hlId: "lp-hl", silent: true });
    decorateTips(host);
    lstAttach({ host, stateEl: state, labelEl: null, n: step.qubits, model });
    decorateWires(host, model);
    updateStatus();
  }

  // --- placement: click wires to commit the pending gate ---
  host.addEventListener("click", (e) => {
    const wire = e.target.closest(".lp-wire");
    if (!wire) return;
    const q = +wire.dataset.q;
    if (!S.pend) { updateStatus("Pick a gate first — then click a wire."); return; }
    if (S.picks.includes(q)) { updateStatus("Qubits must be distinct — pick a different wire."); return; }
    S.picks.push(q);
    wire.classList.add("sel");
    if (S.picks.length < S.pend.arity) { updateStatus(); return; }

    const def = S.pend;
    let gate;
    if (def.swapMode) {
      gate = { name: "swap", targets: [...S.picks] };
    } else if (def.arity === 1) {
      gate = { name: def.gateName || def.id, targets: [S.picks[0]] };
      if (def.params) gate.params = [...def.params];
    } else {
      gate = {
        name: def.gateName || def.id,
        controls: S.picks.slice(0, -1),
        targets: [S.picks[S.picks.length - 1]],
      };
    }
    S.gates.push(gate);
    cancelPendingPlacement();
    feed.hidden = true;
    redraw();
  });

  undo.addEventListener("click", () => {
    cancelPendingPlacement();
    if (!S.gates.length) return;
    S.gates.pop();
    feed.hidden = true;
    redraw();
  });
  clear.addEventListener("click", () => {
    cancelPendingPlacement();
    if (!S.gates.length && !step.start.length) return;
    S.gates = [];
    feed.hidden = true;
    redraw();
  });

  // --- validation ---
  function computeProbs() {
    const st = freshState(step.qubits);
    for (const g of S.gates) {
      // Normalize like renderCircuit does — builder gates omit `controls`.
      applyGateTo(st.re, st.im, st.n, { ...g, controls: g.controls || [], targets: g.targets || [] });
    }
    const probs = {};
    for (let s = 0; s < (1 << st.n); s++) {
      const p = st.re[s] * st.re[s] + st.im[s] * st.im[s];
      if (p > 1e-9) probs["|" + ketBits(s, st.n) + "⟩"] = p * 100;
    }
    return probs;
  }

  function requirementsOk() {
    if (step.minGates && S.gates.length < step.minGates) return false;
    if (step.requireGates && !step.requireGates.every((name) =>
      S.gates.some((g) => baseGate(g.name) === name),
    )) return false;
    return true;
  }

  function evaluate(viaSolution) {
    const probs = computeProbs();
    S.attempts++;
    if (requirementsOk() && step.check(probs)) {
      S.solved = true;
      feed.className = "b-feed ok";
      feed.innerHTML = inlineMd(`✓ ${viaSolution ? "(solution loaded) " : ""}${step.success}`);
      feed.hidden = false;
      markDone();
      return;
    }
    let msg;
    if (step.minGates && S.gates.length < step.minGates) {
      msg = "Run the actual recipe — place at least one gate before checking.";
    } else if (step.requireGates && !step.requireGates.every((name) =>
      S.gates.some((g) => baseGate(g.name) === name))) {
      msg = `This challenge needs a ${step.requireGates.join(", ").toUpperCase()} somewhere in the circuit.`;
    } else {
      msg = step.hint;
    }
    feed.className = "b-feed bad";
    feed.replaceChildren(el("span", null, inlineMd(`✗ Not there yet. ${msg}`)));
    if (S.attempts >= 2 && !feed.querySelector(".b-solution")) {
      const sol = el("button", "ghost b-solution", "Show solution");
      sol.addEventListener("click", () => {
        // Solutions continue FROM the start gates, they don't replace them.
        S.gates = [...step.start.map((g) => ({ ...g })), ...step.solution.map((g) => ({ ...g }))];
        cancelPendingPlacement();
        redraw();
        doRun(true);
      });
      feed.append(sol);
    }
    feed.hidden = false;
  }

  function doRun(viaSolution) {
    if (lst.timer || !S.gates.length) {
      if (!S.gates.length) updateStatus("Place some gates first — then Run & check.");
      return;
    }
    run.disabled = true;
    feed.hidden = true;
    lstReset();
    lst.onDone = () => {
      evaluate(viaSolution);
      run.disabled = false;
    };
    lstPlay();
  }

  run.addEventListener("click", () => doRun(false));

  cancelPlacementHook = () => {
    if (S.pend) cancelPendingPlacement();
    else showCatalog();
  };

  redraw();
  addBody(head, mdb, goal, status, palette, host, actions, feed, state);
}

function renderStep(step) {
  cancelPlacementHook = null;
  const head = stepHead(step);
  switch (step.kind) {
    case "text": return renderTextStep(head, mdBox(step));
    case "explore": return renderExploreStep(head, mdBox(step), step);
    case "quiz": return renderQuizStep(head, mdBox(step), step);
    case "build": return renderBuildStep(head, mdBox(step), step);
  }
}

/* ---------- boot ---------- */

renderCatalog();
if (location.hash === "#learn") showTab("learn");

// Exposed for tests/debugging without reaching across closures.
window.__quantifyLearn = { openLesson, gotoStep, showCatalog, showTab };
