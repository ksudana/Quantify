import { MODELS, defaultModel } from "./_shared.js";

export function onRequestGet({ env }) {
  return Response.json({ models: MODELS, default: defaultModel(env) });
}
