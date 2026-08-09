// Real-browser UI tests via Playwright. Drives the live app at :8000.
// Uses the app's own renderCircuit() with known circuits so the simulator
// output is deterministic (no dependence on the model).
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PW_BASE || "http://localhost:8000";
let pass = 0, fail = 0;
const ok = (cond, msg) => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); };

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(BASE, { waitUntil: "networkidle" });
ok((await page.title()).includes("Quantify"), "page loads");

// Helper: render a circuit, run the simulator to completion, read the bars.
async function simulate(spec) {
  return await page.evaluate((spec) => {
    document.getElementById("backend").dataset.value = "simulator"; // ensure sim target
    outPanel.hidden = false;          // reveal the output panel
    renderCircuit(spec);              // draws diagram + wires the simulator
    simPause();                       // stop autoplay; step deterministically
    simReset();
    while (simStepForward()) {}       // run to the last moment
    const n = spec.qubits, size = 1 << n;
    const probs = {};
    for (let s = 0; s < size; s++) {
      const p = sim.re[s] * sim.re[s] + sim.im[s] * sim.im[s];
      if (p > 1e-6) probs["|" + s.toString(2).padStart(n, "0") + "⟩"] = +(p * 100).toFixed(1);
    }
    return {
      probs,
      moments: sim.moments.length,
      barRows: document.querySelectorAll("#simState .sim-row").length,
      firstBarWidth: document.querySelector("#simState .sim-bar")?.style.width || "",
      simVisible: !document.getElementById("sim").hidden,
      warnVisible: !document.getElementById("simWarn").hidden,
      warnText: document.getElementById("simWarn").textContent,
      gateGroups: document.querySelectorAll("#circuitSvg .cg-gate").length,
      highlightOpacity: document.querySelector("#cg-hl")?.style.opacity,
    };
  }, spec);
}

// 1. Bell state → |00> and |11> at 50%
{
  const r = await simulate({ qubits: 2, clbits: 2, gates: [
    { name: "h", targets: [0] }, { name: "cx", controls: [0], targets: [1] },
    { name: "measure", targets: [0], clbits: [0] }, { name: "measure", targets: [1], clbits: [1] },
  ]});
  ok(r.simVisible, "Bell: simulator panel visible");
  ok(r.probs["|00⟩"] === 50 && r.probs["|11⟩"] === 50 && !r.probs["|01⟩"] && !r.probs["|10⟩"], `Bell: 50/50 on 00,11 (${JSON.stringify(r.probs)})`);
  ok(r.barRows === 4, `Bell: 4 state rows rendered (${r.barRows})`);
  ok(!r.warnVisible, "Bell: no unmodeled-gate warning");
}

// 2. The exact 3-qubit Grover the model produced with a symmetric MCZ
//    (controls=[2,1,0], targets=[0]) — the circuit that used to give a flat
//    12.5%. Loaded verbatim as a fixture. Expect |101> to dominate (~94.5%).
{
  const spec = JSON.parse(readFileSync(join(here, "grover3_mcz.json"), "utf8"));
  const r = await simulate(spec);
  const top = Object.entries(r.probs).sort((a, b) => b[1] - a[1])[0];
  ok(top[0] === "|101⟩" && top[1] > 90, `Grover(real mcz circuit): |101> dominates (${top[0]} ${top[1]}%)`);
  ok(!r.warnVisible, "Grover(mcz): no warning (mcz is now modeled)");
  ok(r.gateGroups === spec.gates.length, `diagram drew all ${spec.gates.length} gates (${r.gateGroups})`);
}

// 3. Unmodeled gate → warning shown
{
  const r = await simulate({ qubits: 1, gates: [{ name: "u3", targets: [0], params: [1,2,3] }] });
  ok(r.warnVisible && /u3/.test(r.warnText), `unmodeled u3 triggers warning ("${r.warnText.slice(0,60)}…")`);
}

// 4. Diagram is interactive: hover a gate → tooltip with contextual note + reference link
{
  await page.evaluate(() => {
    outPanel.hidden = false;
    renderCircuit({ qubits: 2, gates: [
      { name: "h", targets: [0], note: "Superpose qubit 0 to start the Bell pair." },
      { name: "cx", controls: [0], targets: [1], note: "Entangle qubit 1 with qubit 0." },
    ]});
    simPause();
  });
  await page.locator("#circuitSvg .cg-gate").first().hover();
  await page.waitForSelector("#tip:not([hidden])", { timeout: 2000 });
  const tipTitle = await page.textContent("#tipTitle");
  const tipNote = await page.textContent("#tipNote");
  const tipLink = await page.textContent("#tipLink");
  ok(tipTitle.includes("Hadamard"), `hover: tooltip title is the gate ("${tipTitle}")`);
  ok(tipNote.includes("Superpose qubit 0"), `hover: tooltip shows contextual note ("${tipNote}")`);
  ok(/Hadamard/.test(tipLink), `hover: reference link present ("${tipLink}")`);
}

// 5. Tooltip link opens the Reference overlay at the right entry
{
  await page.click("#tipLink");
  await page.waitForSelector("#ref:not([hidden])", { timeout: 2000 });
  const heading = await page.textContent("#ref-h h3");
  ok(/Hadamard Gate/.test(heading), `reference overlay opens at Hadamard entry ("${heading}")`);
  await page.keyboard.press("Escape");
  ok(await page.locator("#ref").isHidden(), "Escape closes the reference overlay");
}

// 6. Header Reference button opens the full overlay
{
  await page.click("#refBtn");
  await page.waitForSelector("#ref:not([hidden])", { timeout: 2000 });
  const count = await page.locator("#refBody .ref-item").count();
  ok(count >= 20, `reference lists all gates (${count} entries)`);
  await page.click("#refClose");
}

// 7. Switching target to IBM Hardware hides the simulator
{
  await page.evaluate(() => {
    outPanel.hidden = false;
    renderCircuit({ qubits: 1, gates: [{ name: "h", targets: [0] }] });
  });
  ok(!(await page.locator("#sim").isHidden()), "Simulator target: sim panel shown");
  await page.evaluate(() => { // click the IBM Hardware button in the backend seg
    [...document.querySelectorAll("#backend button")].find((b)=>b.dataset.v==="hardware").click();
  });
  ok(await page.locator("#sim").isHidden(), "IBM Hardware target: sim panel hidden");
}

// 8. Stress battery — diverse circuits with hand-derived expected outcomes,
//    all run through the real moment-stepping path. Interference cases (a wrong
//    phase changes the *outcome*, not just the color) and the span-hole case
//    are regressions for the moment-ordering bug.
{
  const PI = Math.PI;
  const cx = (c, t) => ({ name: "cx", controls: [c], targets: [t] });
  const ghz = (n) => ({ qubits: n, gates: [{ name: "h", targets: [0] }, ...Array.from({ length: n - 1 }, (_, i) => cx(i, i + 1))] });
  const stress = [
    { name: "H·Z·H = X (interference)", spec: { qubits: 1, gates: [{ name: "h", targets: [0] }, { name: "z", targets: [0] }, { name: "h", targets: [0] }] }, expect: { "|1⟩": 100 } },
    { name: "H·RZ(π)·H = X (phase interference)", spec: { qubits: 1, gates: [{ name: "h", targets: [0] }, { name: "rz", targets: [0], params: [PI] }, { name: "h", targets: [0] }] }, expect: { "|1⟩": 100 } },
    { name: "RY(π/3) → 75/25 (rotation)", spec: { qubits: 1, gates: [{ name: "ry", targets: [0], params: [PI / 3] }] }, expect: { "|0⟩": 75, "|1⟩": 25 } },
    { name: "Toffoli 11→1", spec: { qubits: 3, gates: [{ name: "x", targets: [0] }, { name: "x", targets: [1] }, { name: "ccx", controls: [0, 1], targets: [2] }] }, expect: { "|111⟩": 100 } },
    { name: "GHZ-4", spec: ghz(4), expect: { "|0000⟩": 50, "|1111⟩": 50 } },
    { name: "GHZ-5 (32 states)", spec: ghz(5), expect: { "|00000⟩": 50, "|11111⟩": 50 }, rows: 32 },
    { name: "SWAP moves excitation q0→q2", spec: { qubits: 3, gates: [{ name: "x", targets: [0] }, { name: "swap", targets: [0, 2] }] }, expect: { "|100⟩": 100 } },
    { name: "idle qubits stay |0⟩", spec: { qubits: 3, gates: [{ name: "x", targets: [1] }] }, expect: { "|010⟩": 100 } },
    { name: "order preserved across span-hole", spec: { qubits: 3, gates: [{ name: "h", targets: [0] }, cx(0, 2), { name: "z", targets: [0] }, cx(0, 2), { name: "h", targets: [0] }] }, expect: { "|001⟩": 100 } },
  ];
  for (const t of stress) {
    const r = await simulate(t.spec);
    const keys = new Set([...Object.keys(t.expect), ...Object.keys(r.probs)]);
    const good = [...keys].every((k) => Math.abs((r.probs[k] || 0) - (t.expect[k] || 0)) < 0.3);
    ok(good, `${t.name} (${JSON.stringify(r.probs)})`);
    if (t.rows) ok(r.barRows === t.rows, `  ${t.name}: ${t.rows} state rows rendered (${r.barRows})`);
  }
}

// 9. Model selector: dropdown populates from /api/models and the chosen model
//    is sent on generate (request intercepted, so no real model call).
{
  await page.waitForFunction(() => document.querySelectorAll("#model option").length >= 2, { timeout: 3000 });
  const opts = await page.$$eval("#model option", (els) => els.map((e) => e.value));
  ok(opts.length >= 2, `model dropdown populated (${opts.length} options)`);
  const chosen = opts[opts.length - 1];
  await page.selectOption("#model", chosen);
  let sentModel = null;
  await page.route("**/api/generate", async (route) => {
    sentModel = JSON.parse(route.request().postData() || "{}").model;
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: {"done":true,"model":"${chosen}"}\n\n` });
  });
  await page.fill("#usecase", "Create a Bell state");
  await page.click("#go");
  await page.waitForFunction(() => document.getElementById("outLabel").textContent === "Ready", { timeout: 5000 });
  ok(sentModel === chosen, `chosen model sent to backend (${sentModel})`);
  await page.unroute("**/api/generate");
}

ok(errors.length === 0, `no page/console errors${errors.length ? " -> " + errors.join(" | ") : ""}`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
