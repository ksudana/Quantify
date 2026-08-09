"""Quantify — generate Qiskit code for a quantum use case, via OpenRouter."""

from __future__ import annotations

import json
import os
from pathlib import Path

import openai
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel, Field

load_dotenv()

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
# Any OpenRouter model slug works — override with OPENROUTER_MODEL in .env.
# "openrouter/free" auto-routes to an available free model.
MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
# Fallback key location, used when OPENROUTER_API_KEY is unset.
DEFAULT_KEY_FILE = os.path.expanduser(
    os.getenv("OPENROUTER_KEY_FILE", "~/.openrouter/keys/quantify_ai")
)
STATIC_DIR = Path(__file__).parent / "static"


def _api_key() -> str | None:
    """Resolve the OpenRouter key: env var first, then the key file."""
    key = os.getenv("OPENROUTER_API_KEY")
    if key:
        return key.strip()
    try:
        return Path(DEFAULT_KEY_FILE).read_text().strip() or None
    except OSError:
        return None

SYSTEM_PROMPT = """You are a quantum computing engineer who writes production-quality Qiskit code.

Given a use case, produce a single self-contained Python program using Qiskit (1.x / 2.x API).

Rules:
- Target the modern Qiskit API: `qiskit.QuantumCircuit`, `qiskit.transpile`, and primitives
  from `qiskit.primitives` (`StatevectorSampler`, `StatevectorEstimator`) or
  `qiskit_aer` when shot-based simulation is needed. Never use the removed
  `execute()` function or `qiskit.Aer` legacy imports.
- Include the imports, circuit construction, execution, and a `main()` that prints
  interpretable results. Make it runnable as-is.
- Comment the quantum-specific reasoning: why these gates, what the measured
  distribution should look like, what the algorithm is doing.
- Prefer a small, illustrative problem size that runs fast on a laptop simulator.

Respond in exactly this structure, with no preamble:

## Approach
Two to four sentences on the algorithm and circuit design. Plain prose.

## Circuit
A JSON description of a small, concrete instance of the circuit, for rendering a
diagram. Bind any parameters to actual numbers and keep it to <= 6 qubits.

```json
{
  "qubits": 3,
  "clbits": 3,
  "gates": [
    {"name": "h", "targets": [0], "note": "Puts the control qubit into superposition so the GHZ state can form."},
    {"name": "cx", "controls": [0], "targets": [1], "note": "Entangles qubit 1 with qubit 0."},
    {"name": "rz", "targets": [2], "params": [1.5708], "note": "Applies the phase this algorithm needs."},
    {"name": "measure", "targets": [0], "clbits": [0], "note": "Reads out qubit 0 into a classical bit."}
  ]
}
```

JSON rules:
- Ordered list of gates. Use lowercase Qiskit names: h, x, y, z, s, sdg, t, tdg,
  sx, rx, ry, rz, p, cx, cy, cz, ch, crx, cry, crz, cp, ccx, swap, cswap,
  measure, barrier.
- Put control qubit(s) in `controls` and the acted-on qubit(s) in `targets`.
  Omit `controls` when there are none.
- `clbits` only on `measure`. `params` only for gates that take angles (numbers).
- `barrier` needs no targets (it spans all qubits).
- Add a short `note` (one sentence) to every gate explaining its specific role
  in THIS circuit — contextual to the use case, not a generic definition.
- If the use case is variational/parameterized, show one representative layer with
  example angles. If no meaningful static circuit exists, use "gates": [].

## Code
```python
<the complete program>
```

## Notes
Three to five bullets: expected output, complexity/qubit count, and what to change
to run it on real hardware.
"""

app = FastAPI(title="Quantify")


@app.middleware("http")
async def no_store_assets(request, call_next):
    """Keep the browser from serving a stale index/JS/CSS during iteration."""
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static"):
        response.headers["Cache-Control"] = "no-store"
    return response


class GenerateRequest(BaseModel):
    use_case: str = Field(min_length=3, max_length=4000)
    backend: str = "simulator"
    effort: str = "high"


def _client() -> OpenAI:
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=_api_key(),
        # Optional OpenRouter ranking headers.
        default_headers={"X-Title": "Quantify"},
    )


def _user_prompt(req: GenerateRequest) -> str:
    target = {
        "simulator": "Target a local simulator (Aer or the reference primitives).",
        "hardware": "Target IBM Quantum hardware via qiskit-ibm-runtime; include the "
        "transpilation and session/primitive setup, but keep the simulator path "
        "as a commented fallback.",
    }.get(req.backend, "Target a local simulator.")
    return f"Use case:\n{req.use_case.strip()}\n\n{target}"


@app.post("/api/generate")
async def generate(req: GenerateRequest) -> StreamingResponse:
    effort = req.effort if req.effort in {"low", "medium", "high"} else "high"

    def events():
        if not _api_key():
            msg = (
                "No OpenRouter API key. Set OPENROUTER_API_KEY, or place a key at "
                f"{DEFAULT_KEY_FILE}"
            )
            yield f"data: {json.dumps({'error': msg})}\n\n"
            return
        try:
            client = _client()
            stream = client.chat.completions.create(
                model=MODEL,
                max_tokens=16000,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": _user_prompt(req)},
                ],
                stream=True,
                stream_options={"include_usage": True},
                # OpenRouter forwards reasoning effort to models that support it
                # and ignores it for those that don't.
                extra_body={"reasoning": {"effort": effort}},
            )
            usage = None
            for chunk in stream:
                if chunk.usage is not None:
                    usage = chunk.usage
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta.content
                if delta:
                    yield f"data: {json.dumps({'delta': delta})}\n\n"
            payload = {"done": True}
            if usage is not None:
                payload["usage"] = {
                    "input_tokens": usage.prompt_tokens,
                    "output_tokens": usage.completion_tokens,
                }
            yield f"data: {json.dumps(payload)}\n\n"
        except openai.AuthenticationError:
            msg = "Invalid OpenRouter API key. Check OPENROUTER_API_KEY in .env"
            yield f"data: {json.dumps({'error': msg})}\n\n"
        except openai.APIError as exc:
            yield f"data: {json.dumps({'error': f'API error: {exc}'})}\n\n"
        except Exception as exc:  # noqa: BLE001 - surface anything else to the UI
            yield f"data: {json.dumps({'error': f'Unexpected error: {exc}'})}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/health")
async def health() -> dict:
    return {
        "ok": True,
        "model": MODEL,
        "key_configured": bool(_api_key()),
    }


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
