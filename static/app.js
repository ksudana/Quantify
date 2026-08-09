const $ = (id) => document.getElementById(id);

const usecase = $("usecase");
const out = $("out");
const outPanel = $("outPanel");
const outLabel = $("outLabel");
const dot = $("dot");
const go = $("go");
const usage = $("usage");
const circuitPanel = $("circuit");
const circuitSvg = $("circuitSvg");
const simPanel = $("sim");
const simStateEl = $("simState");
const simPlayBtn = $("simPlay");
const simStepBtn = $("simStep");
const simRestartBtn = $("simRestart");
const simStepLabel = $("simStepLabel");
const simWarn = $("simWarn");
const tip = $("tip");
const tipTitle = $("tipTitle");
const tipNote = $("tipNote");
const tipLink = $("tipLink");
const refOverlay = $("ref");
const refBody = $("refBody");

let raw = "";
let busy = false;
let lastCircuitJson = "";
let circuitModel = null;
let simPlaying = false;

// Controlled gate → the base gate that acts on the target.
const CTRL_BASE = {
  cx: "x", cnot: "x", ccx: "x", toffoli: "x", mcx: "x", cy: "y", cz: "z",
  ch: "h", crx: "rx", cry: "ry", crz: "rz", cp: "p", cu: "u",
  cswap: "swap", fredkin: "swap",
};

// Resolve any controlled variant to the base gate acting on the target — cx/ccx/
// mcx → x, cz/ccz/mcz → z, crz → rz, etc. Controls always come from `controls`.
function baseGate(name) {
  name = (name || "").toLowerCase();
  if (CTRL_BASE[name]) return CTRL_BASE[name];
  const m = name.match(/^m?c+(x|y|z|h|s|t|sx|rx|ry|rz|p|u1|swap)$/);
  return m ? m[1] : name;
}

/* ---------- controls ---------- */

for (const seg of document.querySelectorAll(".seg")) {
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    seg.dataset.value = btn.dataset.v;
    if (seg.id === "backend") syncSimVisibility();
  });
}

$("examples").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  usecase.value = btn.dataset.ex;
  usecase.focus();
  updateGhost();
});

/* ---------- ghost-text autocomplete ---------- */

const ghost = $("ghost");
const tabHint = $("tabhint");
// Single source of truth: the same use cases shown as example chips.
const EXAMPLES = [...document.querySelectorAll("#examples button")].map(
  (b) => b.dataset.ex,
);

let emptyIdx = 0;
let suggestion = "";

function computeSuggestion(v) {
  if (v.length === 0) return EXAMPLES[emptyIdx % EXAMPLES.length];
  const lv = v.toLowerCase();
  return EXAMPLES.find((e) => e.length > v.length && e.toLowerCase().startsWith(lv)) || "";
}

function updateGhost() {
  const v = usecase.value;
  suggestion = computeSuggestion(v);
  const remainder = suggestion ? suggestion.slice(v.length) : "";
  ghost.replaceChildren();
  if (!remainder) {
    tabHint.hidden = true;
    return;
  }
  const typed = document.createElement("span");
  typed.className = "typed";
  typed.textContent = v; // transparent spacer so remainder lines up
  const rest = document.createElement("span");
  rest.textContent = remainder;
  ghost.append(typed, rest);
  tabHint.hidden = false;
}

function acceptSuggestion() {
  if (!suggestion || suggestion.length <= usecase.value.length) return false;
  usecase.value = suggestion;
  usecase.setSelectionRange(suggestion.length, suggestion.length);
  updateGhost();
  return true;
}

usecase.addEventListener("input", updateGhost);
usecase.addEventListener("scroll", () => {
  ghost.scrollTop = usecase.scrollTop;
});
usecase.addEventListener("keydown", (e) => {
  // Only swallow Tab when we actually completed something — otherwise Tab
  // keeps its normal focus-moving behavior.
  if (e.key === "Tab" && !e.shiftKey && acceptSuggestion()) {
    e.preventDefault();
  }
});

// Cycle the empty-state suggestion so all examples are discoverable, but hold
// steady while the box is focused so it can't shift out from under a Tab.
setInterval(() => {
  if (usecase.value.length === 0 && document.activeElement !== usecase) {
    emptyIdx = (emptyIdx + 1) % EXAMPLES.length;
    updateGhost();
  }
}, 4000);

updateGhost();

go.addEventListener("click", generate);
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
});

/* ---------- rendering ---------- */

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(String(s)).replace(/"/g, "&quot;");

// Minimal markdown for the fixed response shape: ## headings, ```python fences,
// - bullets, `inline code`. Everything is escaped before any tag is inserted.
function render(md) {
  const parts = md.split(/```/);
  let html = "";

  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const lang = (part.match(/^([a-zA-Z]+)\n/) || [])[1] || "";
      if (lang.toLowerCase() === "json") return; // circuit data → drawn as SVG
      const body = part.replace(/^[a-zA-Z]*\n/, "");
      html += `<pre><code>${esc(body)}</code></pre>`;
      return;
    }
    let block = "";
    let inList = false;
    for (const line of part.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("## ")) {
        if (inList) { block += "</ul>"; inList = false; }
        const heading = t.slice(3);
        if (heading.trim().toLowerCase() === "circuit") continue; // shown as diagram
        block += `<h2>${inline(heading)}</h2>`;
      } else if (/^[-*]\s+/.test(t)) {
        if (!inList) { block += "<ul>"; inList = true; }
        block += `<li>${inline(t.replace(/^[-*]\s+/, ""))}</li>`;
      } else {
        if (inList) { block += "</ul>"; inList = false; }
        block += `<p>${inline(t)}</p>`;
      }
    }
    if (inList) block += "</ul>";
    html += block;
  });
  return html;
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function extractCode(md) {
  const m = md.match(/```python\n([\s\S]*?)```/);
  return m ? m[1] : "";
}

/* ---------- circuit diagram ---------- */

// Parse the ```json fence once it's complete and valid, then draw it.
function maybeDrawCircuit(md) {
  const m = md.match(/```json\s*([\s\S]*?)```/i);
  if (!m) return;
  const jsonStr = m[1].trim();
  if (jsonStr === lastCircuitJson) return;
  let spec;
  try {
    spec = JSON.parse(jsonStr);
  } catch {
    return; // still streaming / not valid yet
  }
  lastCircuitJson = jsonStr;
  renderCircuit(spec);
}

// Draw a Qiskit-style circuit from the structured spec. Pure SVG, no code
// execution. Self-contained (embedded <style>) so the saved file renders too.
function renderCircuit(spec) {
  circuitPanel.hidden = false;
  const nq = Math.max(0, spec.qubits | 0);
  const gates = Array.isArray(spec.gates) ? spec.gates : [];
  if (!nq || gates.length === 0) {
    circuitSvg.innerHTML = `<div class="cg-empty">No circuit diagram for this use case.</div>`;
    circuitModel = null;
    syncSimVisibility();
    return;
  }
  const nc = Math.max(0, spec.clbits | 0);

  const LEFT = 54, TOP = 16, COLW = 50, ROWH = 46, BOX = 30, CR = 4.5;
  const qy = (i) => TOP + i * ROWH + ROWH / 2;
  const cyc = (j) => TOP + (nq + j) * ROWH + ROWH / 2;
  const colX = (c) => LEFT + c * COLW + COLW / 2;

  const norm = (g) => ({
    name: String(g.name || "").toLowerCase(),
    controls: [].concat(g.controls ?? g.control ?? []).map((n) => n | 0),
    targets: [].concat(g.targets ?? g.target ?? []).map((n) => n | 0),
    clbits: [].concat(g.clbits ?? g.clbit ?? []).map((n) => n | 0),
    params: [].concat(g.params ?? []),
    note: typeof g.note === "string" ? g.note : "",
  });

  // Moment layering (ASAP). A gate must come no earlier than every qubit it
  // *actually* touches is free — this preserves per-qubit gate order, which the
  // simulator relies on. Within that constraint we pick the leftmost column
  // whose full visual span (min..max row) is clear, so the diagram stays tidy.
  const cols = [];
  const qubitLast = new Array(nq).fill(-1); // last column each qubit was used in
  const placed = gates.map(norm).map((g) => {
    let actual;
    if (g.name === "barrier") actual = [...Array(nq).keys()];
    else actual = [...g.controls, ...g.targets].filter((n) => n >= 0 && n < nq);
    const lo = actual.length ? Math.min(...actual) : 0;
    const hi = actual.length ? Math.max(...actual) : 0;
    let minCol = 0;
    for (const q of actual) minCol = Math.max(minCol, qubitLast[q] + 1);
    let c = minCol;
    for (; c < cols.length; c++) {
      let free = true;
      for (let r = lo; r <= hi; r++) if (cols[c][r]) { free = false; break; }
      if (free) break;
    }
    while (cols.length <= c) cols.push(new Array(nq).fill(false));
    for (let r = lo; r <= hi; r++) cols[c][r] = true;
    for (const q of actual) qubitLast[q] = c;
    return { g, col: c };
  });

  const ncols = Math.max(1, cols.length);
  const W = LEFT + ncols * COLW + 14;
  const H = TOP * 2 + (nq + nc) * ROWH;
  const P = [];
  // Column highlight band the simulator moves as it steps (behind everything).
  P.push(`<rect id="cg-hl" x="${LEFT}" y="${TOP}" width="${COLW}" height="${(nq + nc) * ROWH}" rx="6" class="cg-hl" style="opacity:0"/>`);

  const line = (x1, y1, x2, y2, cls = "cg-line") =>
    P.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`);
  const boxAt = (x, y, label, cls = "cg-box") => {
    const w = Math.max(BOX, 13 + label.length * 8);
    P.push(`<rect x="${x - w / 2}" y="${y - BOX / 2}" width="${w}" height="${BOX}" rx="6" class="${cls}"/>`);
    P.push(`<text x="${x}" y="${y}" class="cg-label">${esc(label)}</text>`);
  };
  const ctrlDot = (x, y) => P.push(`<circle cx="${x}" cy="${y}" r="${CR}" class="cg-ctrl"/>`);
  const oplus = (x, y) => {
    const r = 12;
    P.push(`<circle cx="${x}" cy="${y}" r="${r}" class="cg-open"/>`);
    line(x - r, y, x + r, y); line(x, y - r, x, y + r);
  };
  const cross = (x, y) => {
    const r = 7;
    line(x - r, y - r, x + r, y + r); line(x - r, y + r, x + r, y - r);
  };
  const meter = (x, y) => {
    const w = 32, h = 26;
    P.push(`<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="5" class="cg-mbox"/>`);
    P.push(`<path d="M ${x - 8} ${y + 5} A 8 8 0 0 1 ${x + 8} ${y + 5}" class="cg-arc"/>`);
    line(x, y + 5, x + 7, y - 6, "cg-arc");
  };

  // register labels + wires
  for (let i = 0; i < nq; i++) {
    P.push(`<text x="10" y="${qy(i)}" class="cg-reg">q${i}</text>`);
    line(LEFT - 6, qy(i), W - 6, qy(i), "cg-wire");
  }
  for (let j = 0; j < nc; j++) {
    P.push(`<text x="10" y="${cyc(j)}" class="cg-reg">c${j}</text>`);
    line(LEFT - 6, cyc(j) - 1.5, W - 6, cyc(j) - 1.5, "cg-cwire");
    line(LEFT - 6, cyc(j) + 1.5, W - 6, cyc(j) + 1.5, "cg-cwire");
  }

  const fmtP = (g) =>
    g.params.length
      ? "(" + g.params.map((v) => (Number.isFinite(+v) ? Math.round(+v * 100) / 100 : v)).join(",") + ")"
      : "";

  for (const { g, col } of placed) {
    const x = colX(col);
    // Wrap each gate so it's a single hover target with its own explanation.
    P.push(`<g class="cg-gate" data-gate="${escAttr(gateRefKey(g))}" data-title="${escAttr(gateTitle(g))}" data-note="${escAttr(g.note || "")}">`);
    if (g.name === "barrier") {
      P.push(`<line x1="${x}" y1="${qy(0) - ROWH / 2 + 6}" x2="${x}" y2="${qy(nq - 1) + ROWH / 2 - 6}" class="cg-barrier"/>`);
      P.push(`</g>`);
      continue;
    }
    if (g.name === "measure") {
      for (let k = 0; k < g.targets.length; k++) {
        const t = g.targets[k];
        if (t < 0 || t >= nq) continue;
        meter(x, qy(t));
        const cj = g.clbits[k];
        if (nc > 0 && cj >= 0 && cj < nc) {
          line(x, qy(t) + 13, x, cyc(cj));
          P.push(`<path d="M ${x - 4} ${cyc(cj) - 6} L ${x} ${cyc(cj)} L ${x + 4} ${cyc(cj) - 6}" fill="none" class="cg-line"/>`);
        }
      }
      P.push(`</g>`);
      continue;
    }

    const inv = [...g.controls, ...g.targets].filter((n) => n >= 0 && n < nq);
    if (inv.length > 1) line(x, qy(Math.min(...inv)), x, qy(Math.max(...inv)));
    for (const c of g.controls) if (c >= 0 && c < nq && !g.targets.includes(c)) ctrlDot(x, qy(c));

    const base = baseGate(g.name);
    for (const t of g.targets) {
      if (t < 0 || t >= nq) continue;
      if (base === "x") {
        if (g.name === "x" && g.controls.length === 0) boxAt(x, qy(t), "X");
        else oplus(x, qy(t));
      } else if (base === "swap") {
        cross(x, qy(t));
      } else {
        boxAt(x, qy(t), base.toUpperCase() + fmtP(g));
      }
    }
    P.push(`</g>`);
  }

  const style = `<style>
    .cg-wire{stroke:rgba(160,170,210,.5);stroke-width:1.5;pointer-events:none}
    .cg-cwire{stroke:rgba(160,170,210,.35);stroke-width:1;pointer-events:none}
    .cg-hl{pointer-events:none}
    .cg-gate{cursor:pointer}
    .cg-line{stroke:#8f7bff;stroke-width:1.8}
    .cg-barrier{stroke:rgba(255,255,255,.28);stroke-width:1.4;stroke-dasharray:4 3}
    .cg-reg{fill:#8a90ad;font:600 12px ui-monospace,Menlo,monospace;dominant-baseline:central}
    .cg-box{fill:#7c5cff;stroke:#b9a8ff;stroke-width:1}
    .cg-mbox{fill:#26d0c4;stroke:#7ff0e6;stroke-width:1}
    .cg-label{fill:#fff;font:600 13px ui-sans-serif,system-ui,sans-serif;text-anchor:middle;dominant-baseline:central}
    .cg-ctrl{fill:#8f7bff}
    .cg-open{fill:none;stroke:#8f7bff;stroke-width:1.8}
    .cg-arc{fill:none;stroke:#053b36;stroke-width:1.6}
    .cg-hl{fill:rgba(124,92,255,.18)}
  </style>`;
  circuitSvg.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${style}${P.join("")}</svg>`;

  // Group gates into moments (columns) for the simulator, and publish the model.
  const moments = Array.from({ length: ncols }, () => []);
  for (const { g, col } of placed) moments[col].push(g);
  circuitModel = { nq, nc, moments, ncols, layout: { LEFT, COLW } };
  syncSimVisibility();
}

/* ---------- in-browser statevector simulator ---------- */

const SQ = Math.SQRT1_2;
// Complex 2x2 gate as [u00re,u00im, u01re,u01im, u10re,u10im, u11re,u11im].
function gateMatrix(name, params) {
  const a = params && params.length ? +params[0] : 0;
  switch (name) {
    case "h": return [SQ, 0, SQ, 0, SQ, 0, -SQ, 0];
    case "x": return [0, 0, 1, 0, 1, 0, 0, 0];
    case "y": return [0, 0, 0, -1, 0, 1, 0, 0];
    case "z": return [1, 0, 0, 0, 0, 0, -1, 0];
    case "s": return [1, 0, 0, 0, 0, 0, 0, 1];
    case "sdg": return [1, 0, 0, 0, 0, 0, 0, -1];
    case "t": return [1, 0, 0, 0, 0, 0, Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)];
    case "tdg": return [1, 0, 0, 0, 0, 0, Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4)];
    case "sx": return [0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5];
    case "id": case "i": return [1, 0, 0, 0, 0, 0, 1, 0];
    case "rx": { const c = Math.cos(a / 2), s = Math.sin(a / 2); return [c, 0, 0, -s, 0, -s, c, 0]; }
    case "ry": { const c = Math.cos(a / 2), s = Math.sin(a / 2); return [c, 0, -s, 0, s, 0, c, 0]; }
    case "rz": { const c = Math.cos(a / 2), s = Math.sin(a / 2); return [c, -s, 0, 0, 0, 0, c, s]; }
    case "p": case "u1": { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, 0, c, s]; }
    default: return null;
  }
}

const sim = { re: null, im: null, n: 0, moments: [], step: 0, timer: null, rows: [], layout: null };

function applyU(re, im, n, target, controls, U) {
  const tb = 1 << target, size = 1 << n;
  let cmask = 0;
  for (const c of controls) cmask |= 1 << c;
  for (let s = 0; s < size; s++) {
    if (s & tb) continue;
    if ((s & cmask) !== cmask) continue;
    const s0 = s, s1 = s | tb;
    const ar = re[s0], ai = im[s0], br = re[s1], bi = im[s1];
    re[s0] = U[0] * ar - U[1] * ai + U[2] * br - U[3] * bi;
    im[s0] = U[0] * ai + U[1] * ar + U[2] * bi + U[3] * br;
    re[s1] = U[4] * ar - U[5] * ai + U[6] * br - U[7] * bi;
    im[s1] = U[4] * ai + U[5] * ar + U[6] * bi + U[7] * br;
  }
}

function applySwap(re, im, n, a, b, controls) {
  const ta = 1 << a, tb = 1 << b, size = 1 << n;
  let cmask = 0;
  for (const c of controls) cmask |= 1 << c;
  for (let s = 0; s < size; s++) {
    if ((s & cmask) !== cmask) continue;
    if ((s & ta) === 0 && (s & tb) !== 0) {
      const p = (s | ta) & ~tb;
      let t = re[s]; re[s] = re[p]; re[p] = t;
      t = im[s]; im[s] = im[p]; im[p] = t;
    }
  }
}

function applyGate(g) {
  const { re, im, n } = sim;
  if (g.name === "barrier" || g.name === "measure") return;
  const base = baseGate(g.name);
  // A qubit can't control itself — some models list the target inside controls
  // (e.g. a symmetric MCZ as controls=[2,1,0], targets=[0]).
  if (base === "swap") {
    if (g.targets.length >= 2) {
      const ctrls = g.controls.filter((c) => !g.targets.includes(c));
      applySwap(re, im, n, g.targets[0], g.targets[1], ctrls);
    }
    return;
  }
  const U = gateMatrix(base, g.params);
  if (!U) return;
  for (const t of g.targets) {
    if (t < 0 || t >= n) continue;
    const ctrls = g.controls.filter((c) => c !== t);
    applyU(re, im, n, t, ctrls, U);
  }
}

const ketBits = (s, n) => {
  let out = "";
  for (let i = n - 1; i >= 0; i--) out += (s >> i) & 1;
  return out;
};

function initSimRows() {
  const size = 1 << sim.n;
  simStateEl.replaceChildren();
  sim.rows = [];
  for (let s = 0; s < size; s++) {
    const row = document.createElement("div");
    row.className = "sim-row";
    const ket = document.createElement("span");
    ket.className = "sim-ket";
    ket.textContent = `|${ketBits(s, sim.n)}⟩`;
    const wrap = document.createElement("div");
    wrap.className = "sim-barwrap";
    const bar = document.createElement("div");
    bar.className = "sim-bar";
    wrap.append(bar);
    const pct = document.createElement("span");
    pct.className = "sim-pct";
    pct.textContent = "0%";
    row.append(ket, wrap, pct);
    simStateEl.append(row);
    sim.rows.push({ row, bar, pct });
  }
}

function renderSimState() {
  const { re, im, n } = sim, size = 1 << n;
  for (let s = 0; s < size; s++) {
    const p = re[s] * re[s] + im[s] * im[s];
    const { row, bar, pct } = sim.rows[s];
    bar.style.width = (p * 100).toFixed(1) + "%";
    if (p > 1e-6) {
      const phase = Math.atan2(im[s], re[s]);
      const hue = ((phase * 180) / Math.PI + 360) % 360;
      bar.style.background = `hsl(${hue.toFixed(0)},70%,58%)`;
      row.style.opacity = "1";
      const sign = im[s] >= 0 ? "+" : "";
      row.title = `amplitude ${re[s].toFixed(3)}${sign}${im[s].toFixed(3)}i · ${(p * 100).toFixed(1)}% · phase ${((phase * 180) / Math.PI).toFixed(0)}°`;
    } else {
      bar.style.background = "rgba(255,255,255,0.12)";
      row.style.opacity = "0.45";
      row.title = "0%";
    }
    pct.textContent = (p * 100).toFixed(1) + "%";
  }
}

function highlightColumn(col) {
  const hl = circuitSvg.querySelector("#cg-hl");
  if (!hl || !sim.layout) return;
  if (col < 0) { hl.style.opacity = "0"; return; }
  hl.setAttribute("x", sim.layout.LEFT + col * sim.layout.COLW);
  hl.style.opacity = "1";
}

function updateSimLabel() {
  simStepLabel.textContent = `moment ${sim.step} / ${sim.moments.length}`;
}

function simReset() {
  simPause();
  const size = 1 << sim.n;
  sim.re = new Float64Array(size);
  sim.im = new Float64Array(size);
  sim.re[0] = 1;
  sim.step = 0;
  highlightColumn(-1);
  renderSimState();
  updateSimLabel();
}

function simStepForward() {
  if (sim.step >= sim.moments.length) return false;
  const col = sim.step;
  for (const g of sim.moments[col]) applyGate(g);
  highlightColumn(col);
  sim.step = col + 1;
  renderSimState();
  updateSimLabel();
  if (sim.step >= sim.moments.length) simPause();
  return true;
}

function simPlay() {
  if (sim.step >= sim.moments.length) simReset();
  if (sim.timer) return;
  simPlaying = true;
  simPlayBtn.textContent = "⏸ Pause";
  sim.timer = setInterval(() => {
    if (!simStepForward()) simPause();
  }, 650);
}

function simPause() {
  if (sim.timer) { clearInterval(sim.timer); sim.timer = null; }
  simPlaying = false;
  simPlayBtn.textContent = "▶ Play";
}

function simStop() {
  simPause();
  sim.step = 0;
}

// Show/hide + (re)load the simulator based on the target toggle and circuit.
function syncSimVisibility() {
  const isSim = $("backend").dataset.value === "simulator";
  const hasCircuit = circuitModel && circuitModel.nq > 0 && circuitModel.moments.length > 0;
  if (isSim && hasCircuit) {
    sim.n = circuitModel.nq;
    sim.moments = circuitModel.moments;
    sim.layout = circuitModel.layout;
    simPanel.hidden = false;
    // Warn if any gate can't be modeled — otherwise it's silently skipped and
    // the distribution would be wrong with no indication.
    const unmodeled = [...new Set(
      sim.moments.flat()
        .filter((g) => g.name !== "measure" && g.name !== "barrier")
        .filter((g) => baseGate(g.name) !== "swap" && !gateMatrix(baseGate(g.name)))
        .map((g) => g.name),
    )];
    if (unmodeled.length) {
      simWarn.textContent = `⚠ Simulation approximate — these gates aren't modeled and were skipped: ${unmodeled.join(", ")}. The distribution may be inaccurate.`;
      simWarn.hidden = false;
    } else {
      simWarn.hidden = true;
    }
    initSimRows();
    simReset();
    simPlay(); // animate the run as soon as the circuit is ready
  } else {
    simStop();
    simPanel.hidden = true;
    simWarn.hidden = true;
  }
}

simPlayBtn.addEventListener("click", () => (simPlaying ? simPause() : simPlay()));
simStepBtn.addEventListener("click", () => { simPause(); simStepForward(); });
simRestartBtn.addEventListener("click", () => simReset());

/* ---------- gate reference + hover tooltips ---------- */

const REFERENCE = {
  h: { name: "Hadamard Gate", sym: "H", desc: "Creates an equal superposition — it maps |0⟩ to (|0⟩+|1⟩)/√2 and |1⟩ to (|0⟩−|1⟩)/√2. The standard way to put a qubit into superposition and to switch between the computational and ± bases." },
  x: { name: "Pauli-X Gate", sym: "X", desc: "The quantum NOT: swaps |0⟩ and |1⟩. A rotation by π about the X axis of the Bloch sphere." },
  y: { name: "Pauli-Y Gate", sym: "Y", desc: "A combined bit-and-phase flip: rotation by π about the Y axis, mapping |0⟩→i|1⟩ and |1⟩→−i|0⟩." },
  z: { name: "Pauli-Z Gate", sym: "Z", desc: "A phase flip: leaves |0⟩ unchanged and multiplies |1⟩ by −1. Rotation by π about the Z axis." },
  s: { name: "S Gate", sym: "S", desc: "Quarter-turn phase gate: adds a +90° (factor i) phase to |1⟩. Equal to √Z." },
  sdg: { name: "S† Gate", sym: "S†", desc: "Inverse of the S gate: adds a −90° phase to |1⟩." },
  t: { name: "T Gate", sym: "T", desc: "Eighth-turn phase gate: adds a +45° phase to |1⟩. Equal to √S and central to universal fault-tolerant gate sets." },
  tdg: { name: "T† Gate", sym: "T†", desc: "Inverse of the T gate: adds a −45° phase to |1⟩." },
  sx: { name: "√X Gate", sym: "SX", desc: "Square root of NOT — applied twice it equals X. A common hardware-native gate." },
  rx: { name: "RX Rotation", sym: "RX(θ)", desc: "Rotates the qubit by angle θ about the X axis of the Bloch sphere." },
  ry: { name: "RY Rotation", sym: "RY(θ)", desc: "Rotates the qubit by angle θ about the Y axis — useful for real-valued superpositions with tunable amplitudes." },
  rz: { name: "RZ Rotation", sym: "RZ(θ)", desc: "Rotates the qubit by angle θ about the Z axis, applying a relative phase between |0⟩ and |1⟩." },
  p: { name: "Phase Gate", sym: "P(λ)", desc: "Applies a relative phase e^{iλ} to |1⟩ while leaving |0⟩ unchanged." },
  cx: { name: "CNOT Gate", sym: "CX", desc: "Controlled-NOT: flips the target qubit if and only if the control qubit is |1⟩. The workhorse entangling gate." },
  cz: { name: "Controlled-Z Gate", sym: "CZ", desc: "Applies a −1 phase only when both qubits are |1⟩. Symmetric between its two qubits and entangling." },
  cy: { name: "Controlled-Y Gate", sym: "CY", desc: "Applies a Y gate to the target when the control qubit is |1⟩." },
  ch: { name: "Controlled-H Gate", sym: "CH", desc: "Applies a Hadamard to the target when the control qubit is |1⟩." },
  ccx: { name: "Toffoli Gate", sym: "CCX", desc: "Controlled-controlled-NOT: flips the target only when both controls are |1⟩. Enables reversible classical logic such as AND." },
  swap: { name: "SWAP Gate", sym: "SWAP", desc: "Exchanges the states of two qubits." },
  cswap: { name: "Fredkin Gate", sym: "CSWAP", desc: "Controlled-SWAP: swaps two target qubits when the control is |1⟩." },
  measure: { name: "Measurement", sym: "", desc: "Reads a qubit in the computational basis, collapsing it to 0 or 1 with probabilities given by the squared amplitudes, and stores the outcome in a classical bit." },
  barrier: { name: "Barrier", sym: "", desc: "Not a physical operation — it stops the compiler from reordering or optimizing across it and visually separates stages of a circuit." },
};

function gateRefKey(g) {
  const n = (g.name || "").toLowerCase();
  if (REFERENCE[n]) return n;
  const base = baseGate(n);
  return REFERENCE[base] ? base : n;
}

function gateTitle(g) {
  const n = (g.name || "").toLowerCase();
  const key = gateRefKey(g);
  const base = REFERENCE[key] ? REFERENCE[key].name : n.toUpperCase() + " Gate";
  // Controlled variant that has no dedicated reference entry (e.g. CRZ) → mark it.
  if (!REFERENCE[n] && (CTRL_BASE[n] || (g.controls && g.controls.length))) {
    return "Controlled " + base;
  }
  return base;
}

let tipTimer = null;

function showTip(gel) {
  clearTimeout(tipTimer);
  const key = gel.dataset.gate;
  const ref = REFERENCE[key];
  const title = gel.dataset.title || (ref ? ref.name : key);
  tipTitle.textContent = title;
  const note = gel.dataset.note;
  tipNote.textContent = note && note.length ? note : ref ? ref.desc : "";
  tipLink.textContent = `Reference: ${ref ? ref.name : title} →`;
  tipLink.onclick = (e) => { e.preventDefault(); hideTipNow(); openReference(key); };
  tip.hidden = false;
  const r = gel.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
  let top = r.top - t.height - 10;
  if (top < 8) top = r.bottom + 10;
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}

function scheduleHideTip() {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(hideTipNow, 140);
}
function hideTipNow() {
  tip.hidden = true;
}

circuitSvg.addEventListener("mouseover", (e) => {
  const g = e.target.closest(".cg-gate");
  if (g) showTip(g);
});
circuitSvg.addEventListener("mouseout", (e) => {
  if (e.target.closest(".cg-gate")) scheduleHideTip();
});
tip.addEventListener("mouseenter", () => clearTimeout(tipTimer));
tip.addEventListener("mouseleave", hideTipNow);

/* ---------- reference overlay ---------- */

function buildReference() {
  refBody.replaceChildren();
  for (const [key, r] of Object.entries(REFERENCE)) {
    const sec = document.createElement("section");
    sec.className = "ref-item";
    sec.id = "ref-" + key;
    const h = document.createElement("h3");
    h.textContent = r.name;
    if (r.sym) {
      const sp = document.createElement("span");
      sp.className = "ref-sym";
      sp.textContent = r.sym;
      h.append(sp);
    }
    const p = document.createElement("p");
    p.textContent = r.desc;
    sec.append(h, p);
    refBody.append(sec);
  }
}

function openReference(key) {
  refOverlay.hidden = false;
  const el = key && document.getElementById("ref-" + key);
  if (el) {
    el.scrollIntoView({ block: "center" });
    el.classList.add("ref-hi");
    setTimeout(() => el.classList.remove("ref-hi"), 1500);
  }
}
function closeReference() {
  refOverlay.hidden = true;
}

$("refBtn").addEventListener("click", () => openReference(null));
$("refClose").addEventListener("click", closeReference);
refOverlay.addEventListener("click", (e) => {
  if (e.target === refOverlay) closeReference();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeReference();
});
buildReference();

/* ---------- generate ---------- */

async function generate() {
  if (busy) return;
  const text = usecase.value.trim();
  if (text.length < 3) { usecase.focus(); return; }

  busy = true;
  go.disabled = true;
  raw = "";
  lastCircuitJson = "";
  circuitModel = null;
  usage.textContent = "";
  outPanel.hidden = false;
  out.innerHTML = "";
  circuitPanel.hidden = true;
  circuitSvg.innerHTML = "";
  simStop();
  simPanel.hidden = true;
  hideTipNow();
  dot.className = "dot live";
  outLabel.textContent = "Generating…";
  outPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        use_case: text,
        backend: $("backend").dataset.value,
        effort: $("effort").dataset.value,
      }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop();

      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const msg = JSON.parse(chunk.slice(6));
        if (msg.delta) {
          raw += msg.delta;
          out.innerHTML = render(raw);
          maybeDrawCircuit(raw);
        } else if (msg.error) {
          fail(msg.error);
          return;
        } else if (msg.done) {
          maybeDrawCircuit(raw);
          dot.className = "dot";
          outLabel.textContent = "Ready";
          if (msg.usage) {
            usage.textContent = `${msg.usage.input_tokens} in · ${msg.usage.output_tokens} out`;
          }
        }
      }
    }
  } catch (err) {
    fail(err.message);
  } finally {
    busy = false;
    go.disabled = false;
  }
}

function fail(message) {
  dot.className = "dot err";
  outLabel.textContent = "Error";
  out.insertAdjacentHTML("beforeend", `<div class="err-box">${esc(message)}</div>`);
}

/* ---------- actions ---------- */

$("copy").addEventListener("click", async (e) => {
  const code = extractCode(raw);
  if (!code) return;
  await navigator.clipboard.writeText(code);
  const b = e.target;
  b.textContent = "Copied";
  setTimeout(() => (b.textContent = "Copy code"), 1400);
});

$("download").addEventListener("click", () => {
  const code = extractCode(raw);
  if (!code) return;
  const url = URL.createObjectURL(new Blob([code], { type: "text/x-python" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "quantify_circuit.py";
  a.click();
  URL.revokeObjectURL(url);
});

$("saveSvg").addEventListener("click", () => {
  const svg = circuitSvg.querySelector("svg");
  if (!svg) return;
  const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quantify_circuit.svg";
  a.click();
  URL.revokeObjectURL(url);
});

/* ---------- health ---------- */

fetch("/api/health")
  .then((r) => r.json())
  .then((h) => {
    const el = $("status");
    if (h.key_configured) {
      el.textContent = `● ${h.model}`;
      el.className = "pill ok";
    } else {
      el.textContent = "no API key — set OPENROUTER_API_KEY";
      el.className = "pill warn";
    }
  })
  .catch(() => {
    $("status").textContent = "offline";
    $("status").className = "pill warn";
  });
