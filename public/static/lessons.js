// Lesson content for the Learn tab. Data only — the player lives in learn.js.
//
// Step kinds:
//   text    — explanation, Next always available
//   explore — a fixed circuit wired to the step-through simulator
//   quiz    — multiple choice; must pick the right answer to continue
//   build   — circuit-builder challenge; Run & check validates the distribution
//
// Build steps use the same gate-spec format as generated circuits:
//   { name, targets, controls?, params?, note? }
// `check(probs)` receives { "|q1 q0⟩": percent } — displayed kets are
// big-endian strings over the little-endian state index (last char = q0).
const LESSONS = [
  {
    id: "first-qubit",
    title: "Your First Qubit",
    level: "Beginner",
    minutes: 6,
    blurb: "Bits, qubits and your first gates — flip a qubit, then smear it across two realities.",
    steps: [
      {
        kind: "text",
        title: "Welcome to the playground",
        md: `
Every circuit starts with qubits resting in the state \`|0⟩\`. The bar chart under each circuit is a map of reality: one bar per possible outcome, its **length** is the probability of measuring it. Right now all probability sits on \`|0⟩\` — a qubit is boring until you act.

Gates are the verbs of quantum computing. You'll place them on **wires** (the horizontal lines); each wire is one qubit, read left to right in time.
`,
      },
      {
        kind: "build",
        title: "Warm-up: flip it",
        md: `
The \`X\` gate is the quantum NOT.

**Goal:** make measuring \`1⟩\` a certainty.`,
        qubits: 1,
        palette: ["x", "h"],
        start: [],
        goal: "P(|1⟩) = 100%",
        check: (p) => (p["|1⟩"] || 0) > 99,
        hint: "Pick X from the palette, then click the q0 wire to place it.",
        solution: [{ name: "x", targets: [0] }],
        success: "X swaps the amplitudes of |0⟩ and |1⟩ — a perfect flip.",
      },
      {
        kind: "text",
        title: "Superposition",
        md: `
\`H\` — the **Hadamard** — is the strangest everyday gate: it puts a qubit into a *superposition*, partly \`|0⟩\` and partly \`|1⟩\` at once.

Amplitudes are not probabilities. H gives each outcome amplitude \`1/√2\`, and squaring — \`(1/√2)² = ½\` — is what produces the 50/50 you're about to build.
`,
      },
      {
        kind: "build",
        title: "Split the qubit",
        md: `
**Goal:** an even superposition — \`|0⟩\` and \`|1⟩\` at 50% each.`,
        qubits: 1,
        palette: ["x", "h"],
        start: [],
        goal: "P(|0⟩) = P(|1⟩) = 50%",
        check: (p) => Math.abs((p["|0⟩"] || 0) - 50) < 1 && Math.abs((p["|1⟩"] || 0) - 50) < 1,
        hint: "A single H does it.",
        solution: [{ name: "h", targets: [0] }],
        success: "One gate, two realities. Every shot, nature samples this distribution fresh.",
      },
      {
        kind: "quiz",
        title: "Shots",
        md: "You run your superposition circuit 100 times (100 *shots*), recording the bit each time.",
        q: "Roughly how many 1s do you record?",
        options: ["Exactly 50", "About 50, jittering around it", "Always 0 — measurement resets the qubit", "All 100"],
        answer: 1,
        explain: "The Born rule: each shot independently samples the distribution. Expect ≈50 with statistical noise — swings of ±10 are normal at 100 shots.",
      },
      {
        kind: "text",
        title: "Recap",
        md: `
- Qubits start in \`|0⟩\`; bars show measurement probabilities.
- \`X\` flips. \`H\` splits into superposition.
- Measurement *samples* the distribution — one outcome per shot.

Next up: amplitudes have a hidden **direction** — and that's where the magic starts.
`,
      },
    ],
  },

  {
    id: "phases",
    title: "Phases & Interference",
    level: "Beginner",
    minutes: 8,
    blurb: "Amplitudes are arrows, not just percentages. Make them cancel — the heart of every algorithm.",
    steps: [
      {
        kind: "text",
        title: "The hidden direction",
        md: `
An amplitude is a little arrow: a length **and** an angle (its *phase*). The bar chart encodes both — length is probability, **color** is phase.

Probabilities only see lengths, so phases are invisible… until two paths to the same outcome meet. Arrows pointing opposite ways **cancel**: that's *destructive interference*. Every quantum algorithm is a machine for choreographing that cancellation.
`,
      },
      {
        kind: "explore",
        title: "Z flips the arrow, not the bar",
        md: `
Step through this circuit: \`H\`, then \`Z\`.

After \`H\` both bars glow the same hue (both amplitudes point the same way). \`Z\` multiplies the \`|1⟩\` amplitude by −1 — watch the **color** flip while the **lengths** don't move.`,
        spec: { qubits: 1, gates: [
          { name: "h", targets: [0], note: "Split into +1/√2 · (+|0⟩ + |1⟩)." },
          { name: "z", targets: [0], note: "Flip the sign of |1⟩ → (|0⟩ − |1⟩)/√2." },
        ]},
      },
      {
        kind: "quiz",
        title: "Invisible phase",
        md: "Circuit: `H` then `Z` applied to `|0⟩`. You now measure many shots.",
        q: "What is P(|1⟩)?",
        options: ["25%", "50%", "100%", "It depends on the phase Z applied"],
        answer: 1,
        explain: "Z rotates an arrow without changing its length — probabilities stay 50/50. To *see* a phase you must recombine the paths first.",
      },
      {
        kind: "build",
        title: "Interference engineering",
        md: `
You start from the 50/50 state. Using a phase gate and one more idea, turn uncertainty into certainty.

**Goal:** make \`|1⟩\` certain — \`P(|1⟩) ≥ 95%\`.`,
        qubits: 1,
        palette: ["h", "z", "s", "t", "rz45"],
        start: [{ name: "h", targets: [0] }],
        goal: "P(|1⟩) ≥ 95%",
        check: (p) => (p["|1⟩"] || 0) > 95,
        hint: "Sandwich: Z between two H's acts exactly like X. You already have the first H.",
        solution: [{ name: "z", targets: [0] }, { name: "h", targets: [0] }],
        success: "H·Z·H = X. The two paths to |0⟩ arrived with opposite signs and annihilated — destructive interference.",
      },
      {
        kind: "text",
        title: "Recap",
        md: `
- Amplitudes carry phase; bars show it as color.
- Phase alone is invisible — recombination makes it measurable.
- **Interference** converts phase differences into probability differences.

Grover's search later is exactly this trick, weaponized.
`,
      },
    ],
  },

  {
    id: "bell",
    title: "Entanglement: the Bell State",
    level: "Intermediate",
    minutes: 8,
    blurb: "Two qubits, one shared coin flip — the correlation Einstein called spooky.",
    steps: [
      {
        kind: "text",
        title: "Two wires, four outcomes",
        md: `
Add a second qubit and outcomes double: \`|00⟩, |01⟩, |10⟩, |11⟩\` (read \`q1 q0\`, leftmost wire on top).

The workhorse two-qubit gate is \`CX\`: **if the control qubit is 1, flip the target**; otherwise do nothing. Alone it's just an if-statement. Paired with superposition, it builds entanglement.
`,
      },
      {
        kind: "explore",
        title: "CX copies a flip",
        md: `
Step through: \`X\` on q0, then \`CX\` with q0 as control.

Watch the copy happen: the control sits at 1, so CX flips the target too — \`|01⟩\` jumps to \`|11⟩\`. Then imagine removing the X: the control would rest at 0 and CX would stand down entirely. That conditional-ness is what you're about to exploit.`,
        spec: { qubits: 2, gates: [
          { name: "x", targets: [0], note: "Set the control qubit to 1." },
          { name: "cx", controls: [0], targets: [1], note: "Control is 1 → target flips: |01⟩ becomes |11⟩." },
        ]},
      },
      {
        kind: "build",
        title: "Build the Bell state",
        md: `
**Goal:** only \`|00⟩\` and \`|11⟩\`, fifty-fifty. The other two outcomes must vanish entirely.`,
        qubits: 2,
        palette: ["h", "cx", "cz", "x"],
        start: [],
        goal: "P(|00⟩) = P(|11⟩) = 50%, nothing else",
        check: (p) =>
          Math.abs((p["|00⟩"] || 0) - 50) < 1 &&
          Math.abs((p["|11⟩"] || 0) - 50) < 1 &&
          (p["|01⟩"] || 0) < 0.3 && (p["|10⟩"] || 0) < 0.3,
        hint: "Superpose the control first, then let CX act. Two gates total.",
        solution: [
          { name: "h", targets: [0] },
          { name: "cx", controls: [0], targets: [1] },
        ],
        success: "Neither qubit has a value of its own anymore — but ask about the pair and they always agree. That's entanglement.",
      },
      {
        kind: "quiz",
        title: "Spooky correlation",
        md: "Your Bell state is measured: q0 reads **0**.",
        q: "What will q1 read?",
        options: ["Always 0 — perfectly correlated", "Always 1", "Random, 50/50", "Impossible to say"],
        answer: 0,
        explain: "Only |00⟩ and |11⟩ exist, so the partners always match. The individual result is random; the correlation is perfect — 'spooky action at a distance', engineered on demand.",
      },
      {
        kind: "text",
        title: "Recap",
        md: `
- \`CX\` + superposition = entanglement.
- Entangled qubits have no individual state — only a joint one.
- This correlation is *the* resource of quantum technology: teleportation, error correction, and more all burn it as fuel.
`,
      },
    ],
  },

  {
    id: "ghz",
    title: "GHZ: Entanglement at Scale",
    level: "Intermediate",
    minutes: 7,
    blurb: "Chain CX gates to share one coin flip across many qubits — Schrödinger's cat state.",
    steps: [
      {
        kind: "text",
        title: "Spread the superposition",
        md: `
Why stop at two? Chain \`CX\` gates so each qubit copies its neighbor's parity, and one original superposition ripples through the whole register.

Three qubits fully correlated — \`|000⟩\` or \`|111⟩\`, nothing between — is the **GHZ state**, nicknamed the cat state because it's the largest thing being simultaneously 'all off' and 'all on'.
`,
      },
      {
        kind: "build",
        title: "Build GHZ(3)",
        md: `
**Goal:** \`|000⟩\` and \`|111⟩\` at 50% each, all six middle outcomes dead.`,
        qubits: 3,
        palette: ["h", "cx"],
        start: [],
        goal: "P(|000⟩) = P(|111⟩) = 50%",
        check: (p) =>
          Math.abs((p["|000⟩"] || 0) - 50) < 1 &&
          Math.abs((p["|111⟩"] || 0) - 50) < 1 &&
          Object.entries(p).filter(([k]) => k !== "|000⟩" && k !== "|111⟩").every(([, v]) => v < 0.3),
        hint: "Work left to right: H on q0, then CX from each newly-touched qubit into the next.",
        solution: [
          { name: "h", targets: [0] },
          { name: "cx", controls: [0], targets: [1] },
          { name: "cx", controls: [1], targets: [2] },
        ],
        success: "Three qubits, one shared coin. Add more CX links and the pattern scales to any size.",
      },
      {
        kind: "quiz",
        title: "Measure one, know all",
        md: "In your GHZ state you measure q1 alone — 50/50, of course. It lands on **1**.",
        q: "What do the other two qubits read?",
        options: ["Both 0", "Both 1", "The opposite of q1", "Each random and independent"],
        answer: 1,
        explain: "Measuring one qubit collapses the whole joint state: everyone lands together. One qubit's outcome reveals all the others instantly.",
      },
      {
        kind: "text",
        title: "Recap — and the catch",
        md: `
- Entanglement scales by chaining \`CX\` links.
- But it's fragile: interact one qubit with the environment (decoherence) and the *entire* shared state degrades.

Protecting large entangled states is the central engineering battle of quantum hardware today.
`,
      },
    ],
  },

  {
    id: "dj",
    title: "Deutsch–Jozsa: Quantum's First Win",
    level: "Advanced",
    minutes: 11,
    blurb: "One peek at a black-box function decides a question that forces classical physics to look twice.",
    steps: [
      {
        kind: "text",
        title: "The promise problem",
        md: `
A black box computes one-bit-in, one-bit-out function \`f(x)\`. You're **promised** it is either:

- **constant** — same output always (\`f(0)=f(1)\`), or
- **balanced** — different on half the inputs (\`f(0)≠f(1)\`).

Question: which is it? Classically you must query the box **twice** (\`f(0)\` and \`f(1)\`) to be sure. Quantumly, once suffices — no matter how the box works inside.
`,
      },
      {
        kind: "text",
        title: "The recipe",
        md: `
Set q0 as the *data* wire, q1 as the *answer* wire:

1. \`X\` then \`H\` on q1 → prepares the magic phase state \`|−⟩\`.
2. \`H\` on q0 → superpose the input: query *both* inputs at once.
3. Apply the oracle \`U_f\` **once** (here, built from plain gates).
4. \`H\` on q0 → interfere the paths.

Read q0: \`0\` ⇒ constant, \`1\` ⇒ balanced. The oracle's action gets stamped into q1's phase (*phase kickback*), and step 4 converts that phase into a bit — Lesson 2's interference, doing real work.
`,
      },
      {
        kind: "build",
        title: "Case 1: a constant oracle",
        md: `
Implement the recipe where the oracle is **constant** — e.g. the identity, which ignores its input.

**Goal:** q0 reads \`0\` with certainty. (At least one gate required — actually run the recipe.)`,
        qubits: 2,
        palette: ["x", "h", "cx", "cz"],
        start: [],
        minGates: 1,
        goal: "q0 = 0 with certainty",
        check: (p) => {
          const ones = Object.entries(p).reduce((a, [k, v]) => (k.endsWith("0") ? a + v : a), 0);
          return ones > 99;
        },
        hint: "Identity oracle = add nothing for U_f. Recipe prep: X·H on q1, H on q0, then close with H on q0.",
        solution: [
          { name: "x", targets: [1], note: "Prepare q1 for the |−⟩ state." },
          { name: "h", targets: [1], note: "q1 is now |−⟩ — kickback-ready." },
          { name: "h", targets: [0], note: "Superposed input: query f(0) and f(1) in one go." },
          { name: "h", targets: [0], note: "Constant oracle changed nothing → paths recombine to 0." },
        ],
        success: "The identity oracle leaves every path untouched, so the final H undoes the first: q0 snaps back to 0. Verdict after ONE query: constant.",
      },
      {
        kind: "quiz",
        title: "Why prepare |−⟩?",
        md: "Step 1 spends effort putting q1 into `|−⟩` = (|0⟩−|1⟩)/√2. Why bother?",
        q: "What does the |−⟩ ancilla buy us?",
        options: [
          "It entangles the two qubits for storage",
          "It turns the oracle's action into a PHASE the interferometer can read",
          "It initializes memory for the answer bit",
          "It cancels decoherence noise",
        ],
        answer: 1,
        explain: "For any x, U_f maps |x⟩|−⟩ → (−1)^{f(x)}|x⟩|−⟩: the output value becomes a sign on the data wire. That's phase kickback — and phases are exactly what interference can amplify.",
      },
      {
        kind: "build",
        title: "Case 2: a balanced oracle",
        md: `
Now the oracle is \`f(x) = x\` — the \`CX\` gate itself (control q0 → target q1). Full recipe required.

**Goal:** q0 reads \`1\` with certainty.`,
        qubits: 2,
        palette: ["x", "h", "cx", "cz"],
        start: [],
        requireGates: ["cx"],
        goal: "q0 = 1 with certainty",
        check: (p) => {
          const ones = Object.entries(p).reduce((a, [k, v]) => (k.endsWith("1") ? a + v : a), 0);
          return ones > 99;
        },
        hint: "Recipe top to bottom: X·H on q1, H on q0, CX(q0→q1), H on q0.",
        solution: [
          { name: "x", targets: [1] },
          { name: "h", targets: [1] },
          { name: "h", targets: [0] },
          { name: "cx", controls: [0], targets: [1], note: "The balanced oracle itself — used exactly once." },
          { name: "h", targets: [0], note: "Kickback flipped q0's phase → interference outputs 1." },
        ],
        success: "One oracle call, definitive verdict: balanced. Classically this needs two queries — the advantage is provable, not heuristic.",
      },
      {
        kind: "text",
        title: "Recap",
        md: `
- Global properties of \`f\` can be extracted with **one** coherent query.
- The engine is always the same: encode information in **phase**, then interfere.
- Deutsch–Jozsa generalizes to n-bit inputs — still one query versus up to \`2ⁿ⁻¹+1\` classical ones.

Next: interference as a search engine.
`,
      },
    ],
  },

  {
    id: "grover",
    title: "Grover's Search",
    level: "Advanced",
    minutes: 13,
    blurb: "Find a marked item in an unstructured database — with amplification instead of luck.",
    steps: [
      {
        kind: "text",
        title: "Search by amplification",
        md: `
Four items, one marked: find \`|11⟩\`. Classically you check items one by one — expect ~2.25 tries. Grover finds it in **one** oracle call.

The iteration has two moves:

1. **Oracle** — \`CZ\`: flips the *sign* of the marked item's amplitude only. (A phase! Invisible to measurement — Lesson 2.)
2. **Diffusion** — 'inversion about the average': \`H·X·CZ·X·H\` on every wire. Items above average get pushed down; the marked item, dimmed but negative, gets pushed *up*.

Repeat and the marked amplitude swells while everything else drains away.
`,
      },
      {
        kind: "explore",
        title: "The oracle hides its work",
        md: `
This circuit applies \`H⊗2\` then the oracle \`CZ\` — the marker is drawn but the bars haven't moved a pixel: still 25% everywhere.

Look closely at the colors: \`|11⟩\` points the opposite way. The win is invisible until the diffusion strikes.`,
        spec: { qubits: 2, gates: [
          { name: "h", targets: [0], note: "Uniform superposition over all items." },
          { name: "h", targets: [1] },
          { name: "cz", controls: [0], targets: [1], note: "Oracle: negate ONLY |11⟩'s amplitude — a purely phase move." },
        ]},
      },
      {
        kind: "build",
        title: "One iteration, full certainty",
        md: `
You start from the uniform superposition (the \`H⊗2\` is pre-applied).

**Goal:** complete Grover's iteration — oracle, then diffusion — and crush \`P(|11⟩)\` above 85%. All other outcomes below 5%.`,
        qubits: 2,
        palette: ["h", "x", "z", "cz", "cx"],
        start: [
          { name: "h", targets: [0] },
          { name: "h", targets: [1] },
        ],
        goal: "P(|11⟩) ≥ 85%",
        check: (p) =>
          (p["|11⟩"] || 0) > 85 &&
          Object.entries(p).filter(([k]) => k !== "|11⟩").every(([, v]) => v < 5),
        hint: "Oracle CZ, then inversion-about-the-average: H·X·CZ·X·H on both wires, in that order.",
        solution: [
          { name: "cz", controls: [0], targets: [1], note: "Oracle: mark |11⟩ with a minus sign." },
          { name: "h", targets: [0] },
          { name: "h", targets: [1] },
          { name: "x", targets: [0] },
          { name: "x", targets: [1] },
          { name: "cz", controls: [0], targets: [1], note: "Conditional phase — the mirror for inversion about the average." },
          { name: "x", targets: [0] },
          { name: "x", targets: [1] },
          { name: "h", targets: [0] },
          { name: "h", targets: [1], note: "Diffusion done: |11⟩ amplified to certainty." },
        ],
        success: "|11⟩ at 100% — one oracle call beats ~2.25 classical tries. That's a quadratic head-start, guaranteed.",
      },
      {
        kind: "quiz",
        title: "Don't overshoot",
        md: "Each iteration rotates the state toward the target by a fixed angle (π/2N-normalized). For N = 4 that rotation is exactly 90°.",
        q: "How many iterations maximize success when there are 4 items?",
        options: ["1", "2", "4", "log₂N"],
        answer: 0,
        explain: "One 90° rotation lands dead on the target. A second rotation keeps going — success *drops* back to 0 at two iterations. Grover must be cut off at √N-ish steps, not run forever.",
      },
      {
        kind: "text",
        title: "Recap — and where to go next",
        md: `
- Oracle marks by **phase**; diffusion converts phase into probability.
- \`√N\` queries vs \`N/2\` classical — and the gap compounds with register size.
- Real oracles come from reversible logic: try a 3-qubit search with \`CCX\` in the Generate tab ("Grover search"), then ask Quantify for QAOA or VQE — the interference ideas here power those too.
`,
      },
    ],
  },
];

// Palette definitions shared by build steps (id → placement behavior).
const PALETTE_DEFS = {
  h:    { label: "H",        arity: 1, tip: "Hadamard — superposition" },
  x:    { label: "X",        arity: 1, tip: "Pauli-X — bit flip" },
  z:    { label: "Z",        arity: 1, tip: "Pauli-Z — phase flip" },
  s:    { label: "S",        arity: 1, tip: "S — +90° phase on |1⟩" },
  t:    { label: "T",        arity: 1, tip: "T — +45° phase on |1⟩" },
  rz45: { label: "RZ(π/4)",  arity: 1, gateName: "rz", params: [Math.PI / 4], tip: "RZ(π/4) — eighth-turn phase" },
  cx:   { label: "CX",       arity: 2, tip: "CNOT — controlled flip" },
  cz:   { label: "CZ",       arity: 2, tip: "Controlled-Z — conditional phase" },
  ccx:  { label: "CCX",      arity: 3, tip: "Toffoli — AND-like logic" },
  swap: { label: "SWAP",     arity: 2, swapMode: true, tip: "Swap two wires" },
};
