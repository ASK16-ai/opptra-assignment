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
      note: rec.fallbackNote || "",
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
      temperature: 0.3,
      max_tokens: 220,
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
    let noteText = String(parsed.note || "").trim();

    // Guardrail: if the LLM tries to recommend a price below the floor in
    // its sentence, reject and use fallback. We do a soft regex check —
    // any "Rs.NNN" mentioned where NNN < floor is a fail.
    if (containsBelowFloorPrice(recText, listing.floor)) {
      res.status(200).json({
        rec: rec.fallbackRec,
        note: rec.fallbackNote || "",
        source: "fallback",
        reason: "floor_violation_in_text"
      });
      return;
    }

    if (!recText) {
      res.status(200).json({
        rec: rec.fallbackRec,
        note: rec.fallbackNote || "",
        source: "fallback",
        reason: "empty_rec"
      });
      return;
    }

    res.status(200).json({
      rec: recText,
      note: noteText,
      source: "ai",
      model: MODEL
    });
  } catch (err) {
    console.warn("[recommend] OpenAI call failed for", listing.id, err?.message || err);
    res.status(200).json({
      rec: rec.fallbackRec,
      note: rec.fallbackNote || "",
      source: "fallback",
      reason: "api_error"
    });
  }
}

// Scan the recommendation sentence for any Rs.NNN mention that's below the
// margin floor. This is a defensive guard; the prompt explicitly forbids
// the LLM from inventing a different price, but we don't trust the model
// to follow that rule 100% of the time.
function containsBelowFloorPrice(text, floor) {
  if (!text || typeof text !== "string" || !floor) return false;
  const re = /Rs\.?\s*([0-9][\d,]*)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(String(m[1]).replace(/,/g, ""));
    if (Number.isFinite(n) && n < floor) return true;
  }
  return false;
}
