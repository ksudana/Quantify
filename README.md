# Quantify

Describe a quantum use case in plain language; get a runnable Qiskit program.
FastAPI backend + a single-page UI. Streams the response token-by-token via SSE.

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

## Tests

Real-browser UI tests (simulator correctness, circuit diagram, hover tooltips,
Reference overlay) via Playwright, run against a live server:

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
  currently Nemotron 3 Super 120B (default), Nemotron 3 Ultra 550B, and GPT-OSS 20B.
  Offering several means a per-model rate limit doesn't block the app. Set
  `OPENROUTER_MODEL` to change the server-side default (any OpenRouter slug).
- Free models are non-deterministic: the same model occasionally emits a weaker
  circuit. When that happens the simulator flags unmodeled gates and the bars
  look off — just regenerate or switch models.
- "Depth" maps to OpenRouter's `reasoning.effort` (low / medium / high); ignored by models that don't reason.
- Generated code targets the modern Qiskit primitives API (no `execute()`, no legacy `Aer` import).
