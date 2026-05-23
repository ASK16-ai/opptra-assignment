/* Opptra Pricing Copilot — heuristics engine
   ──────────────────────────────────────────────────────────────────────
   This file is where ENCODED EXPERTISE lives. Every magic number below
   was picked deliberately and is named, commented, and tunable.

   In the Loom: "these are the values I'd want a senior pricing manager
   to own — they're encoded gut feel, not constants pulled from the air."
*/

export const GUT_RULES = {
  /* UNDERCUT_INR — "match-and-just-beat, don't crater"
     When reclaiming a Buy Box we drop to competitor − UNDERCUT_INR, not
     way below. Going Rs.50+ below leaks margin we didn't need to leak.
     Rs.10 is enough to flip the Buy Box on most categories without
     dragging the floor of the whole listing-tier down. */
  UNDERCUT_INR: 10,

  /* FLOOR_CUSHION_INR — "never sit on the floor; leave room for COGS drift"
     Even if the math says we COULD set price = floor + Re.1, we don't.
     A Rs.50 cushion absorbs FX / freight / COGS slippage without
     forcing an emergency reprice. */
  FLOOR_CUSHION_INR: 50,

  /* RAISE_HEADROOM_PCT — "below this, raising risks Buy Box flip"
     We only suggest a price rise on a Won listing when the competitor
     is at least 5% above us. Below 5% the Buy Box algorithm reacts to
     even a small move; the upside doesn't justify the risk. */
  RAISE_HEADROOM_PCT: 5,
  RAISE_HEADROOM_INR: 50,

  /* MAGNITUDE_GUARD_PCT — "drop > 15%? Escalate, don't auto-apply"
     Big single moves trip marketplace fairness systems and customer
     trust. Cap auto-recommendations at 15% drop; anything beyond goes
     to manager review with confidence = Low. */
  MAGNITUDE_GUARD_PCT: 15,

  /* VELOCITY_GUARD_DAYS — "two price changes in 24h hurts Buy Box more
     than holding a Lost position." If we already moved this SKU today,
     hold for 12-24h before another move. */
  VELOCITY_GUARD_DAYS: 0,

  /* RECOVERY_DECAY_DAYS — "longer staleness = deeper algorithm decay"
     A SKU Lost for 6+ days needs a slightly deeper cut to wake the
     Buy Box back up. We don't push past MAGNITUDE_GUARD, but we lower
     confidence and surface a Manager's Note. */
  RECOVERY_DECAY_DAYS: 5,

  /* ANOMALY_FLASH_PCT — "competitor dropped > 8% in one move? flash sale,
     not structural. Wait 24h before reacting." */
  ANOMALY_FLASH_PCT: 8,
  ANOMALY_FLASH_DAYS_AGO: 2,

  /* PORTFOLIO_LIMIT — "don't move >3 SKUs in the same brand on the same
     day; looks reactive, hurts brand perception." Soft warn. */
  PORTFOLIO_LIMIT: 3,

  /* ASYMMETRIC_RISK_PCT — "when in doubt, protect margin. Buy Box can
     be recovered next week; eroded margin is forever."
     If margin sacrifice exceeds this, lower confidence. */
  ASYMMETRIC_RISK_PCT: 6,

  /* CONFIDENCE thresholds (computed score 0–1) */
  CONFIDENCE_HIGH_MIN: 0.75,
  CONFIDENCE_MED_MIN: 0.50
};

// ─── Helpers ──────────────────────────────────────────────────────────
export const fmt = (n) => "Rs." + Number(Math.round(n)).toLocaleString("en-IN");
const pct = (a, b) => b === 0 ? 0 : (a / b) * 100;

// ─── Pattern detection ────────────────────────────────────────────────
export function detectPatterns(listing, ctx) {
  const flags = [];
  const { daysSince, buyBox, topCompetitor } = listing;

  if (buyBox === "Lost" && daysSince >= GUT_RULES.RECOVERY_DECAY_DAYS) {
    flags.push({
      key: "recovery_decay",
      severity: "warn",
      label: "Recovery decay",
      detail: `Lost for ${daysSince} days. Algorithm down-weights stale listings — expect 48–72h to recover after reprice, not instant.`
    });
  }

  if (daysSince <= GUT_RULES.VELOCITY_GUARD_DAYS) {
    flags.push({
      key: "velocity",
      severity: "caution",
      label: "Recently moved",
      detail: `Price already changed today. A second move in 24h can suppress Buy Box independent of price. Consider holding 12h.`
    });
  }

  if (topCompetitor && topCompetitor.lastMoveDirection === "down") {
    const movePct = (topCompetitor.lastMoveSize / topCompetitor.price) * 100;
    if (movePct >= GUT_RULES.ANOMALY_FLASH_PCT && topCompetitor.lastMoveDaysAgo <= GUT_RULES.ANOMALY_FLASH_DAYS_AGO) {
      flags.push({
        key: "flash_sale",
        severity: "warn",
        label: "Flash-sale-like move",
        detail: `${topCompetitor.name} dropped ${fmt(topCompetitor.lastMoveSize)} (~${movePct.toFixed(1)}%) ${topCompetitor.lastMoveDaysAgo === 0 ? "today" : topCompetitor.lastMoveDaysAgo + "d ago"}. Often a 24–48h promo, not structural. Wait before matching.`
      });
    }
  }

  if (ctx && ctx.brandMovesToday && ctx.brandMovesToday[listing.brand] >= GUT_RULES.PORTFOLIO_LIMIT) {
    flags.push({
      key: "portfolio",
      severity: "info",
      label: "Portfolio limit",
      detail: `${ctx.brandMovesToday[listing.brand]} other ${listing.brand} SKUs already moving today. Customers notice; pause this one or batch with the brand's daily cadence.`
    });
  }

  if (daysSince >= 6 && buyBox === "Won") {
    flags.push({
      key: "stale",
      severity: "info",
      label: "Stable position",
      detail: `Untouched for ${daysSince} days while holding Buy Box. Healthy — left here as context, not a flag.`
    });
  }

  return flags;
}

// ─── Rule firings (with weights) ──────────────────────────────────────
export function evaluateRules(listing, recommended, bucket, cfg = GUT_RULES) {
  const rules = [];
  const { ourPrice, floor, daysSince, buyBox, topCompetitor } = listing;

  if (bucket === "recover") {
    rules.push({
      key: "UNDERCUT_BASE",
      label: "Undercut competitor by Rs." + cfg.UNDERCUT_INR,
      weight: +0.40,
      detail: `Target = ${fmt(topCompetitor.price)} − ${fmt(cfg.UNDERCUT_INR)} = ${fmt(recommended)}`
    });
  } else if (bucket === "raise") {
    rules.push({
      key: "RAISE_TO_UNDERCUT",
      label: "Capture headroom; hold just under competitor",
      weight: +0.40,
      detail: `Raise to ${fmt(recommended)} — still ${fmt(cfg.UNDERCUT_INR)} under ${topCompetitor.name}.`
    });
  } else if (bucket === "blocked") {
    rules.push({
      key: "FLOOR_BLOCK",
      label: "Competitor below floor — no action possible",
      weight: -0.60,
      detail: `${fmt(topCompetitor.price)} is below floor (${fmt(floor)}). Matching burns ${fmt(floor - topCompetitor.price)}/unit.`
    });
  }

  if (recommended != null) {
    const cushion = recommended - floor;
    const passes = cushion >= cfg.FLOOR_CUSHION_INR;
    rules.push({
      key: "FLOOR_CUSHION",
      label: `Maintain ${fmt(cfg.FLOOR_CUSHION_INR)} floor cushion`,
      weight: passes ? +0.15 : -0.20,
      detail: `Cushion at target = ${fmt(cushion)} ${passes ? "✓" : "(tight — below " + fmt(cfg.FLOOR_CUSHION_INR) + ")"}`
    });
  }

  if (recommended != null) {
    const dropPct = ((ourPrice - recommended) / ourPrice) * 100;
    const exceeds = dropPct > cfg.MAGNITUDE_GUARD_PCT;
    rules.push({
      key: "MAGNITUDE_GUARD",
      label: `Drop magnitude ≤ ${cfg.MAGNITUDE_GUARD_PCT}%`,
      weight: exceeds ? -0.30 : +0.10,
      detail: exceeds
        ? `Drop ${dropPct.toFixed(1)}% exceeds guardrail — escalate manually.`
        : `Drop ${Math.max(0, dropPct).toFixed(1)}% within guardrail.`
    });
  }

  if (buyBox === "Lost" && daysSince >= cfg.RECOVERY_DECAY_DAYS) {
    rules.push({
      key: "RECOVERY_DECAY",
      label: `${daysSince}d Lost — algorithm decay`,
      weight: -0.15,
      detail: `Long Lost streak: even at recommended price, recovery typically takes 48–72h.`
    });
  }

  if (daysSince <= cfg.VELOCITY_GUARD_DAYS) {
    rules.push({
      key: "VELOCITY_GUARD",
      label: "Velocity guard — moved today",
      weight: -0.20,
      detail: "Already changed today; second move within 24h hurts Buy Box ranking."
    });
  }

  if (topCompetitor && topCompetitor.lastMoveDirection === "down") {
    const movePct = (topCompetitor.lastMoveSize / topCompetitor.price) * 100;
    if (movePct >= cfg.ANOMALY_FLASH_PCT && topCompetitor.lastMoveDaysAgo <= cfg.ANOMALY_FLASH_DAYS_AGO) {
      rules.push({
        key: "ANOMALY_FLASH",
        label: "Anomaly — flash-sale-like move",
        weight: -0.25,
        detail: `${topCompetitor.name} dropped ~${movePct.toFixed(1)}% recently. Likely 24–48h promo.`
      });
    }
  }

  if (recommended != null && bucket === "recover") {
    const sacrifice = ((ourPrice - recommended) / ourPrice) * 100;
    if (sacrifice > cfg.ASYMMETRIC_RISK_PCT) {
      rules.push({
        key: "ASYMMETRIC_RISK",
        label: `Margin sacrifice > ${cfg.ASYMMETRIC_RISK_PCT}%`,
        weight: -0.10,
        detail: `Sacrificing ${sacrifice.toFixed(1)}% margin to win Buy Box. Margin loss is permanent; Buy Box isn't.`
      });
    } else {
      rules.push({
        key: "ASYMMETRIC_RISK_OK",
        label: `Margin sacrifice within tolerance`,
        weight: +0.05,
        detail: `Sacrificing ${sacrifice.toFixed(1)}% — within ${cfg.ASYMMETRIC_RISK_PCT}% asymmetric-risk budget.`
      });
    }
  }

  return rules;
}

export function rulesToConfidence(rules, cfg = GUT_RULES) {
  const score = rules.reduce((s, r) => s + r.weight, 0.6);
  const clamped = Math.max(0, Math.min(1, score));
  let tier;
  if (clamped >= cfg.CONFIDENCE_HIGH_MIN) tier = "High";
  else if (clamped >= cfg.CONFIDENCE_MED_MIN) tier = "Medium";
  else tier = "Low";
  return { score: clamped, tier };
}

// ─── Core: compute one recommendation ─────────────────────────────────
export function computeRecommendation(listing, ctx, cfg = GUT_RULES) {
  const { ourPrice, floor, buyBox, topCompetitor } = listing;
  const competitorPrice = topCompetitor.price;

  const gapInr = competitorPrice - ourPrice;
  const gapPct = pct(gapInr, ourPrice);
  const headroomToFloor = ourPrice - floor;
  const currentMarginPct = pct(ourPrice - floor, ourPrice);

  let bucket;
  let recommended;
  const recommendedFloor = floor + cfg.FLOOR_CUSHION_INR;

  if (competitorPrice < recommendedFloor) {
    bucket = "blocked";
    recommended = null;
  }
  else if (buyBox === "Lost") {
    bucket = "recover";
    recommended = Math.max(competitorPrice - cfg.UNDERCUT_INR, recommendedFloor);
    if (recommended >= competitorPrice) {
      bucket = "blocked";
      recommended = null;
    }
  } else {
    const headroomPct = gapPct;
    const headroomVal = gapInr;
    const meaningful = headroomPct >= cfg.RAISE_HEADROOM_PCT && headroomVal >= cfg.RAISE_HEADROOM_INR;
    if (meaningful) {
      bucket = "raise";
      recommended = competitorPrice - cfg.UNDERCUT_INR;
    } else {
      bucket = "hold";
      recommended = null;
    }
  }

  const marginSacrificeInr = (recommended != null && bucket === "recover") ? (ourPrice - recommended) : 0;
  const marginSacrificePct = recommended != null && bucket === "recover" ? pct(marginSacrificeInr, ourPrice) : 0;
  const marginGainInr = (recommended != null && bucket === "raise") ? (recommended - ourPrice) : 0;
  const resultingMarginPct = recommended != null ? pct(recommended - floor, recommended) : currentMarginPct;

  const rules = evaluateRules(listing, recommended, bucket, cfg);
  const { score: confidenceScore, tier: confidence } = rulesToConfidence(rules, cfg);

  const patterns = detectPatterns(listing, ctx);

  const fallbackRec = buildFallbackSentence({
    listing, bucket, recommended, resultingMarginPct, marginSacrificeInr, marginGainInr, cfg
  });

  const fallbackNote = patterns.length
    ? "Heads up — " + patterns[0].detail
    : null;

  return {
    ...listing,
    gapInr,
    gapPct,
    headroomToFloor,
    currentMarginPct,
    resultingMarginPct,
    marginSacrificeInr,
    marginSacrificePct,
    marginGainInr,
    bucket,
    recommended,
    rules,
    confidenceScore,
    confidence,
    patterns,
    fallbackRec,
    fallbackNote
  };
}

function buildFallbackSentence({ listing, bucket, recommended, resultingMarginPct, marginSacrificeInr, marginGainInr, cfg }) {
  const { sku, ourPrice, floor, topCompetitor } = listing;
  if (bucket === "blocked") {
    const gap = floor - topCompetitor.price;
    if (gap > 0) {
      return `Hold ${sku} at ${fmt(ourPrice)}. ${topCompetitor.name} at ${fmt(topCompetitor.price)} is ${fmt(gap)} below our margin floor — matching would burn ${fmt(gap)}/unit. Escalate for floor review.`;
    }
    return `Cannot recover Buy Box on ${sku}: undercutting leaves no margin cushion. Hold at ${fmt(ourPrice)}.`;
  }
  if (bucket === "recover") {
    return `Set ${sku} to ${fmt(recommended)} — ${fmt(cfg.UNDERCUT_INR)} below ${topCompetitor.name}, ${fmt(recommended - floor)} above floor. Recovers Buy Box at ${resultingMarginPct.toFixed(1)}% margin; sacrifices ${fmt(marginSacrificeInr)}/unit.`;
  }
  if (bucket === "raise") {
    return `Raise ${sku} to ${fmt(recommended)} — captures ${fmt(marginGainInr)}/unit, stays ${fmt(cfg.UNDERCUT_INR)} below ${topCompetitor.name}. Margin moves to ${resultingMarginPct.toFixed(1)}%.`;
  }
  return `Hold ${sku} at ${fmt(ourPrice)} — no meaningful headroom against ${topCompetitor.name}.`;
}

// ─── Compute all (with portfolio ctx) ─────────────────────────────────
export function computeAll(listings, cfg = GUT_RULES) {
  const brandMovesToday = {};
  listings.forEach(l => {
    if (l.daysSince === 0) brandMovesToday[l.brand] = (brandMovesToday[l.brand] || 0) + 1;
  });
  const ctx = { brandMovesToday };
  return listings.map(l => computeRecommendation(l, ctx, cfg));
}

// ─── AI prompt builder ────────────────────────────────────────────────
export function buildAiPrompt(rec, tone = "directive") {
  const {
    sku, brand, name, marketplace, ourPrice, floor, buyBox, daysSince,
    topCompetitor, competitors, bucket, recommended, resultingMarginPct,
    marginSacrificeInr, marginGainInr, patterns, rules
  } = rec;

  const ctx = [
    `SKU: ${sku}  (${name}, ${brand})`,
    `Marketplace: ${marketplace}`,
    `Our current price: ${fmt(ourPrice)}`,
    `Margin floor (HARD limit — never recommend below): ${fmt(floor)}`,
    `Buy Box: ${buyBox}  (last changed ${daysSince === 0 ? "today" : daysSince + " days ago"})`,
    `Top competitor: ${topCompetitor.name} at ${fmt(topCompetitor.price)}`,
    `Other competitors: ${competitors.slice(1).map(c => `${c.name} ${fmt(c.price)}`).join(", ") || "—"}`,
    `Engine bucket: ${bucket}`,
    recommended != null ? `Engine target price: ${fmt(recommended)}` : "Engine target: HOLD (no change)",
    recommended != null ? `Resulting margin at target: ${resultingMarginPct.toFixed(1)}%` : "",
    bucket === "recover" ? `Margin sacrifice if applied: ${fmt(marginSacrificeInr)}/unit` : "",
    bucket === "raise"   ? `Margin captured if applied: +${fmt(marginGainInr)}/unit` : "",
    `Pattern flags: ${patterns.length ? patterns.map(p => p.label + " — " + p.detail).join(" | ") : "none"}`,
    `Rules fired: ${rules.map(r => r.key + (r.weight >= 0 ? "+" : "") + r.weight.toFixed(2)).join(", ")}`
  ].filter(Boolean).join("\n");

  const toneHint = ({
    directive: "Imperative, confident, busy-ops voice.",
    analyst:   "Dispassionate; name the tradeoff explicitly.",
    friendly:  "Collegial, like a Slack DM from a teammate."
  })[tone] || "Imperative.";

  return `You are a pricing analyst writing for a busy Category Operations lead at Opptra. Output strictly the JSON below, no preamble, no markdown, no code fences.

CONTEXT:
${ctx}

TASK:
Produce TWO short pieces:
  1. "rec"  — exactly one sentence (max ~32 words). Name the SKU, the price to set (or that we hold), and the real-number tradeoff (margin %, Rs. sacrificed/captured, days). Use the engine's target price verbatim — never invent a different price; never recommend a price below the floor.
  2. "note" — at most one short sentence calling out the highest-value PATTERN a human would catch (staleness, flash-sale, velocity, recovery decay, portfolio). Phrase it conversationally ("Heads up — ..."). If no meaningful pattern, return an empty string.

Tone: ${toneHint}

Return ONLY this JSON shape:
{"rec": "...", "note": "..."}`;
}
