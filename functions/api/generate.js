import { OPENROUTER_BASE_URL, SYSTEM_PROMPT, resolveModel, userPrompt } from "./_shared.js";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
};

const enc = new TextEncoder();
const sse = (obj) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const sseError = (msg) => new Response(sse({ error: msg }), { headers: SSE_HEADERS });

export async function onRequestPost({ request, env }) {
  const key = env && env.OPENROUTER_API_KEY;

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* keep {} */
  }
  const useCase = (body.use_case || "").toString().trim();
  const effort = ["low", "medium", "high"].includes(body.effort) ? body.effort : "high";
  const backend = body.backend === "hardware" ? "hardware" : "simulator";
  const model = resolveModel(body.model, env);

  if (useCase.length < 3) return sseError("Use case is too short.");
  if (!key) return sseError("No OpenRouter API key configured on the server (set the OPENROUTER_API_KEY secret).");

  let upstream;
  try {
    upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Quantify",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        stream: true,
        stream_options: { include_usage: true },
        // OpenRouter forwards reasoning effort to models that support it,
        // and ignores it for those that don't.
        reasoning: { effort },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(useCase, backend) },
        ],
      }),
    });
  } catch (e) {
    return sseError(`Could not reach OpenRouter: ${e}`);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return sseError(`API error ${upstream.status}: ${text.slice(0, 300)}`);
  }

  // Transform OpenRouter's OpenAI-style SSE into our {delta}/{done}/{error} SSE.
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let usage = null;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const data = t.slice(5).trim();
            if (data === "[DONE]") continue;
            let json;
            try {
              json = JSON.parse(data);
            } catch {
              continue;
            }
            if (json.usage) usage = json.usage;
            const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
            if (delta) controller.enqueue(sse({ delta }));
          }
        }
        const payload = { done: true, model };
        if (usage) payload.usage = { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens };
        controller.enqueue(sse(payload));
      } catch (e) {
        controller.enqueue(sse({ error: `Stream error: ${e}` }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
