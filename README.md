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

## Notes

- Powered by [OpenRouter](https://openrouter.ai). The API key stays server-side; the browser never sees it.
- Model: set `OPENROUTER_MODEL` to any OpenRouter slug (default `openrouter/free`, which auto-routes to an available free model).
- "Depth" maps to OpenRouter's `reasoning.effort` (low / medium / high); ignored by models that don't reason.
- Generated code targets the modern Qiskit primitives API (no `execute()`, no legacy `Aer` import).
