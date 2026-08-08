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
MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.5")
STATIC_DIR = Path(__file__).parent / "static"

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

## Code
```python
<the complete program>
```

## Notes
Three to five bullets: expected output, complexity/qubit count, and what to change
to run it on real hardware.
"""

app = FastAPI(title="Quantify")


class GenerateRequest(BaseModel):
    use_case: str = Field(min_length=3, max_length=4000)
    backend: str = "simulator"
    effort: str = "high"


def _client() -> OpenAI:
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=os.getenv("OPENROUTER_API_KEY"),
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
        if not os.getenv("OPENROUTER_API_KEY"):
            msg = "No OpenRouter API key. Set OPENROUTER_API_KEY in .env"
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
        "key_configured": bool(os.getenv("OPENROUTER_API_KEY")),
    }


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
