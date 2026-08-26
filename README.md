# Quantify

Describe a quantum use case in plain language; get a runnable Qiskit program,
an interactive circuit diagram, and an in-browser simulator. Streams the
response token-by-token via SSE.

There's also a **Learn** tab: six interactive lessons (first qubit → phases →
Bell/GHZ entanglement → Deutsch–Jozsa → Grover) where you build circuits on
clickable wires, step the statevector, answer quizzes, and have each challenge
checked by the in-browser simulator. Progress persists in `localStorage`
(`lessons.js` = content, `learn.js` = player).

Two ways to run it:
- **Local dev** — FastAPI (`app.py`), used for development and the test suite.
- **Production** — Cloudflare Pages: static site in `public/` + serverless API in
  `functions/api/` (Workers runtime). See *Deploy to Cloudflare Pages* below.

Both serve the same static site and the same `/api/*` endpoints, so the front end
is identical either way.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then paste your key into .env
```

## Run

```bash
uvicorn app:app --reload --port 8000
```

Open http://localhost:8000

## Deploy to Cloudflare Pages

The API is ported to Cloudflare Pages Functions (`functions/api/generate.js`,
`models.js`, `health.js`); `public/` is the static build output. `wrangler.toml`
sets `pages_build_output_dir = "public"`.

1. Provide the OpenRouter key as a **secret** (never committed):

   ```bash
   npx wrangler pages secret put OPENROUTER_API_KEY
   # optional: change the default model
   npx wrangler pages secret put OPENROUTER_MODEL
   ```

   Or set them under Pages → your project → Settings → Environment variables.

2. Deploy:

   ```bash
   npm install
   npm run deploy          # wrangler pages deploy public
   ```

   Or connect the GitHub repo in the Cloudflare dashboard with **build command:**
   *(none)* and **build output directory:** `public` — functions are picked up
   from `functions/` automatically.

**Local preview on the real Workers runtime:**

```bash
echo "OPENROUTER_API_KEY=sk-or-..." > .dev.vars   # gitignored
npm run dev             # wrangler pages dev public  → http://localhost:8788
```

Run the browser tests against it with `PW_BASE=http://localhost:8788 npm test`.

## Tests

Real-browser UI tests (simulator correctness, circuit diagram, hover tooltips,
Reference overlay, Learn tab: builder/quiz/progress) via Playwright, run
against a live server:

```bash
npm install
npx playwright install chromium
# with the app running on :8000
npm test
```

## Notes

- Powered by [OpenRouter](https://openrouter.ai). The API key stays server-side; the browser never sees it.
- Model: pick from the in-app dropdown. It lists free OpenRouter models vetted to
  emit correct circuits for the test cases (Bell, GHZ, 2-/3-qubit Grover) —
  Nemotron 3 Super 120B (default) and Nemotron 3 Ultra 550B. These were the only
  free models that reliably passed 3-qubit Grover across repeated runs; others
  (Gemma 4, Poolside, GPT-OSS 20B, Nemotron Nano, Cohere) failed it. Offering two
  means a per-model rate limit doesn't block the app. Set `OPENROUTER_MODEL` to
  change the server-side default (any OpenRouter slug).
- Free models are non-deterministic: the same model occasionally emits a weaker
  circuit. When that happens the simulator flags unmodeled gates and the bars
  look off — just regenerate or switch models.
- "Depth" maps to OpenRouter's `reasoning.effort` (low / medium / high); ignored by models that don't reason.
- Generated code targets the modern Qiskit primitives API (no `execute()`, no legacy `Aer` import).
