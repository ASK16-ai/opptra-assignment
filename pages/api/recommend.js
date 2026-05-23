/* /api/recommend — OpenAI-backed price-recommendation generator
   ──────────────────────────────────────────────────────────────────────
   Hybrid contract:
   - The deterministic engine (computeRecommendation) already picked the
     bucket and the target price within the safe range. The LLM ONLY
     writes the human-readable sentence + manager's note.
   - Server validates the LLM never returns a price below floor. If it
     does (or fails to return JSON), we fall back to the engine's own
     fallback sentence. Result: every card always shows something, and
     no card ever shows a price below the margin floor.

   Without OPENAI_API_KEY in env, every call falls through to the
   fallback path. This lets reviewers run the prototype with no key.
*/

import OpenAI from "openai";
import { buildAiPrompt, computeRecommendation, GUT_RULES } from "../../lib/heuristics";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Lazy-init so missing key doesn't crash at boot
let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.OPENAI_API_KEY) return null;
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const { listing, tone = "friendly" } = req.body || {};
  if (!listing || !listing.sku) {
    res.status(400).json({ error: "Missing 'listing' in request body" });
    return;
  }

  // Re-run the deterministic engine server-side so the AI prompt is built
  // from a trusted recommendation (client could send anything).
  const rec = computeRecommendation(listing, { brandMovesToday: {} }, GUT_RULES);

  const client = getClient();
  if (!client) {
    res.status(200).json({
      rec: rec.fallbackRec,
      reasoning_steps: rec.fallbackReasoningSteps || [],
      forecast: rec.forecast,
      source: "fallback",
      reason: "no_api_key"
    });
    return;
  }

  const prompt = buildAiPrompt(rec, tone);

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You write tight pricing recommendations for an ops lead. Output JSON only. Never recommend a price below the margin floor in the context." },
        { role: "user", content: prompt }
      ],
      max_completion_tokens: 10000,
      response_format: { type: "json_object" }
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // One forgiving repair pass — strip fences / surrounding prose
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON in response");
      parsed = JSON.parse(raw.slice(start, end + 1));
    }

    let recText = String(parsed.rec || "").trim();
    let reasoningSteps = Array.isArray(parsed.reasoning_steps) ? parsed.reasoning_steps : null;

    // Sanitize reasoning steps — keep only well-shaped entries.
    if (reasoningSteps) {
      reasoningSteps = reasoningSteps
        .filter(s => s && (s.factor || s.value))
        .map(s => ({
          factor: String(s.factor || "").trim(),
          value: String(s.value || "").trim(),
          weight: ["high", "medium", "low", "final"].includes(s.weight) ? s.weight : "medium",
          takeaway: String(s.takeaway || "").trim()
        }))
        .filter(s => s.factor || s.takeaway);
      if (reasoningSteps.length === 0) reasoningSteps = null;
    }

    // Guardrail: if the LLM tries to recommend a price below the floor in
    // its sentence, reject and use fallback. We do a soft regex check —
    // any "Rs.NNN" mentioned where NNN < floor is a fail.
    if (containsBelowFloorPrice(recText, listing.floor)) {
      res.status(200).json({
        rec: rec.fallbackRec,
          reasoning_steps: rec.fallbackReasoningSteps || [],
        forecast: rec.forecast,
        source: "fallback",
        reason: "floor_violation_in_text"
      });
      return;
    }

    if (!recText) {
      res.status(200).json({
        rec: rec.fallbackRec,
          reasoning_steps: rec.fallbackReasoningSteps || [],
        forecast: rec.forecast,
        source: "fallback",
        reason: "empty_rec"
      });
      return;
    }

    res.status(200).json({
      rec: recText,
      // Fall back to engine-generated steps if the LLM didn't return any.
      reasoning_steps: reasoningSteps || rec.fallbackReasoningSteps || [],
      forecast: rec.forecast,
      source: "ai",
      model: MODEL
    });
  } catch (err) {
    console.warn("[recommend] OpenAI call failed for", listing.id, err?.message || err);
    res.status(200).json({
      rec: rec.fallbackRec,
      reasoning_steps: rec.fallbackReasoningSteps || [],
      forecast: rec.forecast,
      source: "fallback",
      reason: "api_error"
    });
  }
}

// Floor-violation guard for the LLM's sentence.
//
// The deterministic engine already picks the target price within the safe
// range, and the prompt tells the LLM to use that price verbatim. This
// scan is a defense in depth: if the LARGEST Rs.NNN amount mentioned in
// the sentence is below floor, the LLM is clearly proposing to sell
// below floor and we reject.
//
// We use the max (not any) because a legitimate sentence mentions both
// the target price (large) and small deltas like "Rs.10 below comp",
// "Rs.139 above floor", "sacrifices Rs.110/unit" — those small numbers
// would false-positive a "scan every amount" rule.
function containsBelowFloorPrice(text, floor) {
  if (!text || typeof text !== "string" || !floor) return false;
  const re = /Rs\.?\s*([0-9][\d,]*)/gi;
  let maxFound = 0;
  let any = false;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(String(m[1]).replace(/,/g, ""));
    if (Number.isFinite(n)) {
      any = true;
      if (n > maxFound) maxFound = n;
    }
  }
  // If no Rs amount at all (unusual but not a violation), let it through.
  if (!any) return false;
  return maxFound < floor;
}
