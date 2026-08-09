import { defaultModel } from "./_shared.js";

export function onRequestGet({ env }) {
  return Response.json({
    ok: true,
    model: defaultModel(env),
    key_configured: !!(env && env.OPENROUTER_API_KEY),
  });
}
