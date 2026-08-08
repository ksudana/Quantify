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

let raw = "";
let busy = false;
let lastCircuitJson = "";

/* ---------- controls ---------- */

for (const seg of document.querySelectorAll(".seg")) {
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    seg.dataset.value = btn.dataset.v;
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
  });

  // Greedy moment packing: place each gate in the leftmost column whose rows
  // (min..max of the qubits it spans) are free.
  const cols = [];
  const placed = gates.map(norm).map((g) => {
    let lo, hi;
    if (g.name === "barrier") { lo = 0; hi = nq - 1; }
    else {
      const inv = [...g.controls, ...g.targets].filter((n) => n >= 0 && n < nq);
      lo = inv.length ? Math.min(...inv) : 0;
      hi = inv.length ? Math.max(...inv) : 0;
    }
    let c = 0;
    for (; c < cols.length; c++) {
      let free = true;
      for (let r = lo; r <= hi; r++) if (cols[c][r]) { free = false; break; }
      if (free) break;
    }
    if (c === cols.length) cols[c] = new Array(nq).fill(false);
    for (let r = lo; r <= hi; r++) cols[c][r] = true;
    return { g, col: c };
  });

  const ncols = Math.max(1, cols.length);
  const W = LEFT + ncols * COLW + 14;
  const H = TOP * 2 + (nq + nc) * ROWH;
  const P = [];

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

  // Controlled gate → base gate drawn on the target.
  const CTRL_BASE = {
    cx: "x", cnot: "x", ccx: "x", toffoli: "x", mcx: "x", cy: "y", cz: "z",
    ch: "h", crx: "rx", cry: "ry", crz: "rz", cp: "p", cu: "u",
    cswap: "swap", fredkin: "swap",
  };
  const fmtP = (g) =>
    g.params.length
      ? "(" + g.params.map((v) => (Number.isFinite(+v) ? Math.round(+v * 100) / 100 : v)).join(",") + ")"
      : "";

  for (const { g, col } of placed) {
    const x = colX(col);
    if (g.name === "barrier") {
      P.push(`<line x1="${x}" y1="${qy(0) - ROWH / 2 + 6}" x2="${x}" y2="${qy(nq - 1) + ROWH / 2 - 6}" class="cg-barrier"/>`);
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
      continue;
    }

    const inv = [...g.controls, ...g.targets].filter((n) => n >= 0 && n < nq);
    if (inv.length > 1) line(x, qy(Math.min(...inv)), x, qy(Math.max(...inv)));
    for (const c of g.controls) if (c >= 0 && c < nq) ctrlDot(x, qy(c));

    const base = CTRL_BASE[g.name] || g.name;
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
  }

  const style = `<style>
    .cg-wire{stroke:rgba(160,170,210,.5);stroke-width:1.5}
    .cg-cwire{stroke:rgba(160,170,210,.35);stroke-width:1}
    .cg-line{stroke:#8f7bff;stroke-width:1.8}
    .cg-barrier{stroke:rgba(255,255,255,.28);stroke-width:1.4;stroke-dasharray:4 3}
    .cg-reg{fill:#8a90ad;font:600 12px ui-monospace,Menlo,monospace;dominant-baseline:central}
    .cg-box{fill:#7c5cff;stroke:#b9a8ff;stroke-width:1}
    .cg-mbox{fill:#26d0c4;stroke:#7ff0e6;stroke-width:1}
    .cg-label{fill:#fff;font:600 13px ui-sans-serif,system-ui,sans-serif;text-anchor:middle;dominant-baseline:central}
    .cg-ctrl{fill:#8f7bff}
    .cg-open{fill:none;stroke:#8f7bff;stroke-width:1.8}
    .cg-arc{fill:none;stroke:#053b36;stroke-width:1.6}
  </style>`;
  circuitSvg.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${style}${P.join("")}</svg>`;
}

/* ---------- generate ---------- */

async function generate() {
  if (busy) return;
  const text = usecase.value.trim();
  if (text.length < 3) { usecase.focus(); return; }

  busy = true;
  go.disabled = true;
  raw = "";
  lastCircuitJson = "";
  usage.textContent = "";
  outPanel.hidden = false;
  out.innerHTML = "";
  circuitPanel.hidden = true;
  circuitSvg.innerHTML = "";
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
