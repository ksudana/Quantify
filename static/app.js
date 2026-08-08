const $ = (id) => document.getElementById(id);

const usecase = $("usecase");
const out = $("out");
const outPanel = $("outPanel");
const outLabel = $("outLabel");
const dot = $("dot");
const go = $("go");
const usage = $("usage");

let raw = "";
let busy = false;

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
});

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
        block += `<h2>${inline(t.slice(3))}</h2>`;
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
  const m = md.match(/```(?:python)?\n([\s\S]*?)```/);
  return m ? m[1] : "";
}

/* ---------- generate ---------- */

async function generate() {
  if (busy) return;
  const text = usecase.value.trim();
  if (text.length < 3) { usecase.focus(); return; }

  busy = true;
  go.disabled = true;
  raw = "";
  usage.textContent = "";
  outPanel.hidden = false;
  out.innerHTML = "";
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
        } else if (msg.error) {
          fail(msg.error);
          return;
        } else if (msg.done) {
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
