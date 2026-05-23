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
  CONFIDENCE_MED_MIN: 0.50,

  /* ── Forecast model — translates a price move into expected business impact.
     These are deliberately rough industry rules of thumb; a real Opptra
     system would replace them with regression coefficients learned from
     historical order data. The point is to SHOW that the recommendation
     has a quantitative consequence, not just a price. */

  /* BASELINE_DAILY_ORDERS_NO_BB — typical orders/day when we DON'T have
     the Buy Box on a mid-tier home-goods SKU. Anchor for relative math. */
  BASELINE_DAILY_ORDERS_NO_BB: 5,

  /* BUY_BOX_LIFT_MULT — orders ratio when winning the Buy Box.
     Brief says Buy Box drives 80%+ of sales → ~6x lift is the
     conventional estimate. */
  BUY_BOX_LIFT_MULT: 6,

  /* PRICE_ELASTICITY — incremental volume sensitivity to price changes
     among customers who are already converting. A -10% price move
     yields ~+8% orders on top of any Buy Box effect (elasticity = -0.8).
     We only apply this for moves WITHIN the Buy Box winner state — it
     dominates flips. */
  PRICE_ELASTICITY: -0.8,

  /* RECOVERY_RAMPUP_FACTOR — when reclaiming a Lost Buy Box, the algo
     takes 48-72h to fully restore exposure. We discount the projected
     order lift by this factor for the first window — so daily-profit
     numbers don't oversell instant recovery. */
  RECOVERY_RAMPUP_FACTOR: 0.6
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

// ─── Forecast model ─────────────────────────────────────────────────
// Given the current listing and a proposed target price, project the
// downstream business impact: orders/day, unit margin, daily profit, and
// the net delta vs. holding the current price. Returns the math so the UI
// can render every step (this is the "show your work" layer).
export function computeForecast(listing, recommended, bucket, cfg = GUT_RULES) {
  const { ourPrice, floor, buyBox } = listing;

  const currentlyWinning = buyBox === "Won";
  // After the move: Lost+recover → win; Won+raise → still win; Won+hold → still win;
  // blocked → still lose (we can't match).
  let targetWinning;
  if (bucket === "recover") targetWinning = true;
  else if (bucket === "blocked") targetWinning = false;
  else targetWinning = currentlyWinning; // raise or hold

  // Orders/day estimates.
  // Prefer the category lead's own reported orders/day (from the CSV
  // input fields orders_in_period + period_days) over the synthesized
  // baseline. Synthesis only kicks in when the upload doesn't carry
  // those metrics. Buy Box lift, elasticity, and the recovery ramp-up
  // discount stay the same — they shape the TARGET-side projection.
  const baseNoBB = cfg.BASELINE_DAILY_ORDERS_NO_BB;
  const liftMult = cfg.BUY_BOX_LIFT_MULT;

  const reportedOrdersPerDay = Number.isFinite(listing.ordersPerDayInput)
    ? listing.ordersPerDayInput
    : null;
  const currentOrdersPerDay = reportedOrdersPerDay != null
    ? reportedOrdersPerDay
    : (currentlyWinning ? baseNoBB * liftMult : baseNoBB);

  let targetOrdersPerDay;
  if (recommended == null) {
    targetOrdersPerDay = currentOrdersPerDay; // no move, no change
  } else if (bucket === "recover") {
    // Reclaim Buy Box, but apply ramp-up discount.
    targetOrdersPerDay = baseNoBB * liftMult * cfg.RECOVERY_RAMPUP_FACTOR;
  } else if (bucket === "raise") {
    // Already winning; small elasticity penalty for raising.
    const pricePctChange = (recommended - ourPrice) / ourPrice;
    const orderPctChange = pricePctChange * cfg.PRICE_ELASTICITY;
    targetOrdersPerDay = currentOrdersPerDay * (1 + orderPctChange);
  } else {
    targetOrdersPerDay = currentOrdersPerDay;
  }

  // Unit margin (Rs/unit), naively defined as price − floor.
  // Floor is a margin baseline here, not a strict COGS — but it's the
  // best proxy we have in the brief.
  const currentUnitMargin = ourPrice - floor;
  const targetUnitMargin = recommended != null ? recommended - floor : currentUnitMargin;

  // Daily profit = orders × margin/unit.
  const currentDailyProfit = currentOrdersPerDay * currentUnitMargin;
  const targetDailyProfit = targetOrdersPerDay * targetUnitMargin;
  const profitDeltaPerDay = targetDailyProfit - currentDailyProfit;
  const profitDelta30d = profitDeltaPerDay * 30;

  const ordersDelta = targetOrdersPerDay - currentOrdersPerDay;
  const ordersLiftPct = currentOrdersPerDay === 0
    ? 0
    : (ordersDelta / currentOrdersPerDay) * 100;

  return {
    currentOrdersPerDay: Math.round(currentOrdersPerDay),
    targetOrdersPerDay: Math.round(targetOrdersPerDay),
    ordersDelta: Math.round(ordersDelta),
    ordersLiftPct,
    currentUnitMargin,
    targetUnitMargin,
    currentDailyProfit: Math.round(currentDailyProfit),
    targetDailyProfit: Math.round(targetDailyProfit),
    profitDeltaPerDay: Math.round(profitDeltaPerDay),
    profitDelta30d: Math.round(profitDelta30d),
    currentlyWinning,
    targetWinning
  };
}

// ─── Reasoning steps (fallback when AI is off) ─────────────────────
// Walks through every factor the engine considered, in order, with a
// signed weight, the underlying number, and a one-line takeaway. The
// AI is prompted to return the same shape; if it fails, this is what
// the UI renders.
export function buildFallbackReasoningSteps(listing, recommended, bucket, forecast, cfg = GUT_RULES) {
  const { ourPrice, floor, daysSince, topCompetitor } = listing;
  const steps = [];

  // 1. Price gap to top competitor
  const gapInr = topCompetitor.price - ourPrice;
  const gapPct = (gapInr / ourPrice) * 100;
  steps.push({
    factor: "Price gap vs top competitor",
    value: `${gapInr >= 0 ? "+" : "−"}Rs.${Math.abs(gapInr).toLocaleString("en-IN")} (${gapPct.toFixed(1)}%) vs ${topCompetitor.name}`,
    weight: bucket === "recover" ? "high" : bucket === "raise" ? "medium" : "low",
    takeaway: gapInr < 0
      ? "We're priced above the leader — Buy Box is at risk until we close the gap."
      : "We sit below the leader — headroom exists to capture margin without losing position."
  });

  // 2. Headroom to floor
  const headroom = ourPrice - floor;
  steps.push({
    factor: "Headroom to floor",
    value: `Rs.${headroom.toLocaleString("en-IN")} cushion above floor of Rs.${floor.toLocaleString("en-IN")}`,
    weight: headroom > 200 ? "medium" : "high",
    takeaway: headroom > 200
      ? "Comfortable cushion — recommended move stays well above floor."
      : "Tight cushion — small moves only; escalate anything aggressive."
  });

  // 3. Recovery decay (only relevant if Lost long)
  if (listing.buyBox === "Lost" && daysSince >= cfg.RECOVERY_DECAY_DAYS) {
    steps.push({
      factor: "Recovery decay risk",
      value: `Buy Box Lost for ${daysSince} days`,
      weight: "high",
      takeaway: "Algorithm has down-weighted listing — expect 48–72h after reprice before full ranking recovery."
    });
  }

  // 4. Magnitude check
  if (recommended != null) {
    const dropPct = ((ourPrice - recommended) / ourPrice) * 100;
    steps.push({
      factor: "Move magnitude",
      value: `${dropPct > 0 ? "−" : "+"}${Math.abs(dropPct).toFixed(1)}% (Rs.${Math.abs(ourPrice - recommended).toLocaleString("en-IN")})`,
      weight: Math.abs(dropPct) > cfg.MAGNITUDE_GUARD_PCT ? "high" : "low",
      takeaway: Math.abs(dropPct) > cfg.MAGNITUDE_GUARD_PCT
        ? `Exceeds ${cfg.MAGNITUDE_GUARD_PCT}% guardrail — needs manual review, not auto-apply.`
        : `Within the ${cfg.MAGNITUDE_GUARD_PCT}% safety guardrail.`
    });
  }

  // 5. Expected order lift (from forecast)
  if (forecast) {
    steps.push({
      factor: "Expected order volume",
      value: `${forecast.currentOrdersPerDay} → ${forecast.targetOrdersPerDay} orders/day (${forecast.ordersLiftPct > 0 ? "+" : ""}${forecast.ordersLiftPct.toFixed(0)}%)`,
      weight: Math.abs(forecast.ordersLiftPct) >= 50 ? "high" : "medium",
      takeaway: forecast.ordersDelta > 0
        ? "Volume gain from Buy Box recovery / price-elasticity outweighs the unit-margin sacrifice."
        : forecast.ordersDelta < 0
          ? "Some volume loss expected — but unit margin captured offsets it."
          : "Volume stays flat — move is margin-only."
    });

    // 6. Expected daily profit (the final number that matters)
    steps.push({
      factor: "Expected daily profit",
      value: `Rs.${forecast.currentDailyProfit.toLocaleString("en-IN")}/day → Rs.${forecast.targetDailyProfit.toLocaleString("en-IN")}/day (${forecast.profitDeltaPerDay >= 0 ? "+" : ""}Rs.${forecast.profitDeltaPerDay.toLocaleString("en-IN")}/day)`,
      weight: "final",
      takeaway: forecast.profitDeltaPerDay > 0
        ? `Net positive: ~Rs.${forecast.profitDelta30d.toLocaleString("en-IN")} additional profit over 30 days if Buy Box behavior follows the model.`
        : forecast.profitDeltaPerDay < 0
          ? `Net negative: ~Rs.${Math.abs(forecast.profitDelta30d).toLocaleString("en-IN")} profit cost over 30 days — only justified by strategic reasons.`
          : "Net flat — recommendation is positioning, not income."
    });
  }

  return steps;
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
  // Prefer the category lead's reported profit margin (CSV input) when
  // provided. Otherwise derive it from (price - floor) / price, which is
  // the structural proxy the engine has always used.
  const reportedMarginPct = Number.isFinite(listing.profitMargin)
    ? listing.profitMargin * 100
    : null;
  const currentMarginPct = reportedMarginPct != null
    ? reportedMarginPct
    : pct(ourPrice - floor, ourPrice);

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

  // Forecast model: project orders/day, daily profit, and the deltas.
  const forecast = computeForecast(listing, recommended, bucket, cfg);

  // Reasoning steps: step-by-step walkthrough of factors and their weights.
  // The AI is also prompted to produce these; this is the fallback shown
  // when AI is off or when AI fails.
  const fallbackReasoningSteps = buildFallbackReasoningSteps(listing, recommended, bucket, forecast, cfg);

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
    forecast,
    fallbackReasoningSteps,
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
    marginSacrificeInr, marginGainInr, patterns, rules, forecast,
    ordersInPeriod, periodDays, ordersPerDayInput, profitMargin
  } = rec;

  const reportedMetrics = [];
  if (Number.isFinite(ordersInPeriod) && Number.isFinite(periodDays)) {
    reportedMetrics.push(
      `Reported orders: ${ordersInPeriod} units over the last ${periodDays} days (${(ordersPerDayInput || ordersInPeriod / periodDays).toFixed(2)}/day) — from the category lead's own data.`
    );
  }
  if (Number.isFinite(profitMargin)) {
    reportedMetrics.push(
      `Reported profit margin: ${(profitMargin * 100).toFixed(1)}% — declared by the category lead, prefer this over the floor-derived proxy.`
    );
  }

  const ctx = [
    `SKU: ${sku}  (${name}, ${brand})`,
    `Marketplace: ${marketplace}`,
    `Our current price: ${fmt(ourPrice)}`,
    `Margin floor (HARD limit — never recommend below): ${fmt(floor)}`,
    `Buy Box: ${buyBox}  (last changed ${daysSince === 0 ? "today" : daysSince + " days ago"})`,
    `Top competitor: ${topCompetitor.name} at ${fmt(topCompetitor.price)}`,
    `Other competitors: ${competitors.slice(1).map(c => `${c.name} ${fmt(c.price)}`).join(", ") || "—"}`,
    ...reportedMetrics,
    `Engine bucket: ${bucket}`,
    recommended != null ? `Engine target price: ${fmt(recommended)}` : "Engine target: HOLD (no change)",
    recommended != null ? `Resulting margin at target: ${resultingMarginPct.toFixed(1)}%` : "",
    bucket === "recover" ? `Margin sacrifice if applied: ${fmt(marginSacrificeInr)}/unit` : "",
    bucket === "raise"   ? `Margin captured if applied: +${fmt(marginGainInr)}/unit` : "",
    `Pattern flags: ${patterns.length ? patterns.map(p => p.label + " — " + p.detail).join(" | ") : "none"}`,
    `Rules fired: ${rules.map(r => r.key + (r.weight >= 0 ? "+" : "") + r.weight.toFixed(2)).join(", ")}`,
    "",
    "FORECAST (from heuristic model — use these numbers, don't invent your own):",
    `  Estimated orders/day NOW: ${forecast.currentOrdersPerDay}`,
    `  Estimated orders/day at TARGET: ${forecast.targetOrdersPerDay} (${forecast.ordersLiftPct > 0 ? "+" : ""}${forecast.ordersLiftPct.toFixed(0)}%)`,
    `  Unit margin NOW: ${fmt(forecast.currentUnitMargin)}/unit`,
    `  Unit margin at TARGET: ${fmt(forecast.targetUnitMargin)}/unit`,
    `  Daily profit NOW: ${fmt(forecast.currentDailyProfit)}/day`,
    `  Daily profit at TARGET: ${fmt(forecast.targetDailyProfit)}/day  (${forecast.profitDeltaPerDay >= 0 ? "+" : ""}${fmt(forecast.profitDeltaPerDay)}/day, ~${forecast.profitDelta30d >= 0 ? "+" : ""}${fmt(forecast.profitDelta30d)} over 30d)`
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
Produce three pieces:

1. "rec" — one sentence (max ~32 words). Name the SKU, the price to set (or HOLD), and ONE tradeoff number that matters most (margin %, Rs. sacrificed/captured, expected daily profit delta). Use the engine's target price verbatim. Never recommend below floor.

2. "note" — at most one short sentence ("Heads up — ...") calling out the highest-value PATTERN a human would catch (staleness, flash-sale, velocity, recovery decay, portfolio). Empty string if nothing notable.

3. "reasoning_steps" — an ordered array of 5–6 objects walking through HOW you arrived at the recommendation. Each object:
   { "factor": "<short name>", "value": "<concrete number/observation>", "weight": "high"|"medium"|"low"|"final", "takeaway": "<one short sentence>" }

   Required factors to cover, in this order:
   • Price gap vs top competitor (use the concrete Rs and %)
   • Headroom to floor (Rs cushion, what it lets us do)
   • Recovery decay risk (only if buy_box is Lost; cite days)
   • Move magnitude (% change, whether it trips the 15% guardrail)
   • Expected order lift (cite both current and target orders/day numbers from the forecast above; do NOT invent new ones)
   • Expected daily profit (cite both current and target daily profit, and the Rs/day delta; mark this step weight="final")

   For "blocked" or "hold" buckets, return only 2–3 steps explaining why no move is justified.

Tone: ${toneHint}

Return ONLY this JSON shape:
{
  "rec": "...",
  "note": "...",
  "reasoning_steps": [
    { "factor": "...", "value": "...", "weight": "...", "takeaway": "..." }
  ]
}`;
}
