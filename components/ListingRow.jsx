/* The compact ListingRow + DetailPanel (expand-in-place).
   Mirrors design/random/project/views.jsx with the layout intact. */

import { useEffect, useState } from "react";
import { Icon, Rs } from "./Icon";
import {
  Sparkline, FlagChip, ConfidenceBadge, BrandAvatar,
  CompRow, RuleItem, ManagerNote, MiniStats, MarketplaceLogo
} from "./Primitives";
import { GUT_RULES } from "../lib/heuristics";

// Format "listed X days ago" as a short human string
function formatListedAge(days) {
  if (days == null) return "—";
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

// Single-line boxed price chip. Variant drives the color:
//   neutral — current price (no semantic; just baseline)
//   up      — target > current (green; raise)
//   down    — target < current (red; recover / margin sacrifice)
//   blocked — competitor below floor (amber)
//   hold    — no meaningful action (grey)
function PriceBox({ label, value, variant = "neutral", delta, displayOverride }) {
  return (
    <div className={"price-box price-box--" + variant} title={label}>
      <span className="price-box__label">{label}</span>
      <span className="price-box__value">{displayOverride ?? Rs(value)}</span>
      {delta != null && delta !== 0 && (
        <span className={"price-box__delta " + (delta > 0 ? "price-box__delta--up" : "price-box__delta--down")}>
          {delta > 0 ? "+" : ""}{Rs(delta)} {delta > 0 ? "↑" : "↓"}
        </span>
      )}
    </div>
  );
}

// ── Decision Walkthrough ──────────────────────────────────────────
// Renders the AI's (or fallback's) ordered reasoning steps. Each step
// shows the factor name, concrete value, a weight pill, and the
// one-line takeaway. Step weighted "final" gets primary emphasis —
// it's the bottom-line number that drove the decision.
function DecisionWalkthrough({ steps, loading, source }) {
  return (
    <div className="detail__panel walk-panel">
      <div className="detail__title walk-panel__title">
        <Icon name="sparkle" size={11} color="var(--sx-primary)"/>
        Decision walkthrough
        {source === "ai" && <span className="walk-panel__live">AI</span>}
        {source && source !== "ai" && <span className="walk-panel__fallback">Rules</span>}
      </div>
      {loading && (!steps || steps.length === 0) ? (
        <div className="walk-panel__loading">
          <span className="row__rec-shimmer"></span>
        </div>
      ) : (steps && steps.length > 0) ? (
        <ol className="walk-list">
          {steps.map((s, i) => (
            <li key={i} className={"walk-step walk-step--" + (s.weight || "medium")}>
              <span className="walk-step__num">{i + 1}</span>
              <div className="walk-step__body">
                <div className="walk-step__head">
                  <span className="walk-step__factor">{s.factor}</span>
                  <span className={"walk-step__weight walk-step__weight--" + (s.weight || "medium")}>
                    {s.weight || "medium"}
                  </span>
                </div>
                {s.value && <div className="walk-step__value">{s.value}</div>}
                {s.takeaway && <div className="walk-step__takeaway">{s.takeaway}</div>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="walk-panel__empty">No reasoning steps available.</div>
      )}
    </div>
  );
}

// ── Expected Impact (forecast at a glance) ────────────────────────
// Before/after columns: orders/day, unit margin, daily profit. The
// big number is the daily-profit delta — the bottom line that decides
// whether the move is worth it.
function ExpectedImpact({ forecast }) {
  if (!forecast) return null;
  const profitUp = forecast.profitDeltaPerDay > 0;
  const profitDown = forecast.profitDeltaPerDay < 0;
  const ordersUp = forecast.ordersDelta > 0;
  const ordersDown = forecast.ordersDelta < 0;

  return (
    <div className="detail__panel impact-panel">
      <div className="detail__title impact-panel__title">
        Expected impact <span className="impact-panel__hint">(modeled — not measured)</span>
      </div>

      <div className="impact-grid">
        <div className="impact-col">
          <div className="impact-col__label">NOW</div>
          <div className="impact-col__metric">
            <span className="impact-col__num">{forecast.currentOrdersPerDay}</span>
            <span className="impact-col__unit">orders/day</span>
          </div>
          <div className="impact-col__metric impact-col__metric--sm">
            <span className="impact-col__num">{Rs(forecast.currentUnitMargin)}</span>
            <span className="impact-col__unit">margin/unit</span>
          </div>
          <div className="impact-col__metric impact-col__metric--sm">
            <span className="impact-col__num">{Rs(forecast.currentDailyProfit)}</span>
            <span className="impact-col__unit">profit/day</span>
          </div>
        </div>

        <div className="impact-arrow"><Icon name="arrowRight" size={16}/></div>

        <div className="impact-col">
          <div className="impact-col__label">AFTER MOVE</div>
          <div className={"impact-col__metric " + (ordersUp ? "impact-col__metric--up" : ordersDown ? "impact-col__metric--down" : "")}>
            <span className="impact-col__num">{forecast.targetOrdersPerDay}</span>
            <span className="impact-col__unit">orders/day</span>
            {forecast.ordersDelta !== 0 && (
              <span className={"impact-delta " + (ordersUp ? "impact-delta--up" : "impact-delta--down")}>
                {ordersUp ? "+" : ""}{forecast.ordersDelta} ({forecast.ordersLiftPct > 0 ? "+" : ""}{forecast.ordersLiftPct.toFixed(0)}%)
              </span>
            )}
          </div>
          <div className="impact-col__metric impact-col__metric--sm">
            <span className="impact-col__num">{Rs(forecast.targetUnitMargin)}</span>
            <span className="impact-col__unit">margin/unit</span>
          </div>
          <div className="impact-col__metric impact-col__metric--sm">
            <span className="impact-col__num">{Rs(forecast.targetDailyProfit)}</span>
            <span className="impact-col__unit">profit/day</span>
          </div>
        </div>
      </div>

      <div className={"impact-bottom " + (profitUp ? "impact-bottom--up" : profitDown ? "impact-bottom--down" : "impact-bottom--flat")}>
        <span className="impact-bottom__label">Net daily profit</span>
        <span className="impact-bottom__delta">
          {profitUp ? "+" : ""}{Rs(forecast.profitDeltaPerDay)}/day
        </span>
        <span className="impact-bottom__horizon">
          ≈ {profitUp ? "+" : ""}{Rs(forecast.profitDelta30d)} over 30 days
        </span>
      </div>
    </div>
  );
}

export function ListingRow({
  rec, aiData, aiLoading, approval, applied,
  onExpand, expanded, onSendForApproval, onSkip, onUndoApply
}) {
  const isBlocked = rec.bucket === "blocked";
  const isHold = rec.bucket === "hold";
  const [editPrice, setEditPrice] = useState(rec.recommended);
  useEffect(() => { setEditPrice(rec.recommended); }, [rec.recommended]);

  const violatesFloor = editPrice != null && editPrice < rec.floor + GUT_RULES.FLOOR_CUSHION_INR;
  const aiText = aiData?.rec || rec.fallbackRec;

  const handleSendClick = (e) => {
    e.stopPropagation();
    onSendForApproval(editPrice);
  };

  const recVariant = rec.bucket === "raise" ? "raise" : (isBlocked ? "blocked" : null);

  return (
    <div className={
      "row " +
      (expanded ? "row--expanded " : "") +
      (approval ? "row--pending " : "") +
      (applied ? "row--applied " : "") +
      (isBlocked ? "row--blocked " : "")
    }>
      <div className="row__head" onClick={onExpand}>
        {/* Identity — brand avatar + name (top) + prominent marketplace + SKU id + listed date */}
        <div className="row__ident">
          <BrandAvatar brand={rec.brand} size={36}/>
          <div className="row__ident-text">
            <div className="row__name-line">
              <span className="row__name" title={rec.name + " · " + rec.brand}>{rec.name}</span>
              <MarketplaceLogo marketplace={rec.marketplace} size={18} withLabel/>
            </div>
            <div className="row__ident-sub">
              <span className="row__sku-small">{rec.sku}</span>
              <span className="row__ident-dot">·</span>
              <span>{rec.brand}</span>
              {rec.listedAt && (
                <>
                  <span className="row__ident-dot">·</span>
                  <span
                    className="row__listed-date"
                    title={`Listing created: ${new Date(rec.listedAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}`}
                  >
                    <Icon name="clock" size={9}/>
                    Listed {formatListedAge(rec.listedDaysAgo)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Status chips (Buy Box · stale · pattern flags) */}
        <div className="row__chips">
          {rec.buyBox === "Lost"
            ? <span className="row__status-chip status-lost"><span className="dot"></span>Lost</span>
            : <span className="row__status-chip status-won"><span className="dot"></span>Won</span>}
          <span className={"chip-stale " + (rec.daysSince >= 5 ? "chip-stale--warn" : "")}>
            <Icon name="clock" size={9}/> {rec.daysSince === 0 ? "today" : `${rec.daysSince}d`}
          </span>
          {rec.patterns.slice(0, 2).map(p => <FlagChip pattern={p} key={p.key}/>)}
        </div>

        {/* Pricing flow — boxed prices on a single line */}
        <div className="row__price-flow">
          <PriceBox label="NOW" value={rec.ourPrice} variant="neutral"/>
          <span className="row__price-arrow"><Icon name="arrowRight" size={14}/></span>
          {isBlocked ? (
            <PriceBox label="TARGET" value={null} variant="blocked" displayOverride="HOLD"/>
          ) : isHold ? (
            <PriceBox label="TARGET" value={null} variant="hold" displayOverride="HOLD"/>
          ) : (
            <PriceBox
              label="TARGET"
              value={rec.recommended}
              variant={rec.bucket === "raise" ? "up" : "down"}
              delta={rec.recommended - rec.ourPrice}
            />
          )}
          {!isBlocked && !isHold && (
            <span className="margin-pill" title="Resulting margin if applied">
              {rec.resultingMarginPct.toFixed(1)}% <span className="margin-pill__sub">margin</span>
            </span>
          )}
          <span className="floor-pill" title="Minimum allowed price — the engine will never go below this">
            <span className="floor-pill__label">FLOOR</span>
            <span className="floor-pill__value">{Rs(rec.floor)}</span>
          </span>
        </div>

        {/* Right side actions */}
        <div className="row__actions" onClick={(e) => e.stopPropagation()}>
          <ConfidenceBadge confidence={rec.confidence}/>
          {!applied && !approval && !isBlocked && !isHold && (
            <button className="btn btn--primary btn--sm" disabled={violatesFloor} onClick={handleSendClick} title={violatesFloor ? "Below floor + cushion" : ""}>
              <Icon name="send" size={11}/> Send for approval
            </button>
          )}
          <button className="row__expand-btn" aria-label="Expand" onClick={(e) => { e.stopPropagation(); onExpand(); }}>
            <Icon name="chevronDown" size={14}/>
          </button>
        </div>
      </div>

      {/* AI recommendation sentence — own band at the bottom of the card */}
      <div className="row__ai-band">
        <div className="row__ai-icon"><Icon name="sparkle" size={11}/></div>
        <div className={"row__ai-text " + (aiLoading ? "row__ai-text--loading" : "")}>
          {aiLoading
            ? <span className="row__rec-shimmer"></span>
            : aiText}
        </div>
      </div>

      {approval && !applied && (
        <div className="row__pending-banner">
          <Icon name="clock" size={13}/>
          <strong>Pending approval</strong> from <strong>{approval.approver}</strong> ·
          sent {approval.sentMinAgo}m ago at <strong>{Rs(approval.proposedPrice)}</strong>
          <span className="spacer"></span>
          <button onClick={() => onExpand()}>View</button>
        </div>
      )}
      {applied && (
        <div className="row__applied-banner">
          <Icon name="check" size={13}/>
          Approved &amp; repriced to <strong>{Rs(applied.newPrice)}</strong> · pushed to {rec.marketplace}
          <button className="undo" onClick={() => onUndoApply()}>Undo</button>
        </div>
      )}

      {expanded && (
        <DetailPanel
          rec={rec}
          aiData={aiData}
          aiLoading={aiLoading}
          editPrice={editPrice}
          setEditPrice={setEditPrice}
          violatesFloor={violatesFloor}
          approval={approval}
          applied={applied}
          onSendForApproval={onSendForApproval}
          onSkip={onSkip}
        />
      )}
    </div>
  );
}

export function DetailPanel({
  rec, aiData, aiLoading,
  editPrice, setEditPrice, violatesFloor,
  approval, applied,
  onSendForApproval, onSkip
}) {
  const aiNote = aiData?.note || rec.fallbackNote;

  return (
    <div className="detail">
      <div className="detail__col">
        <div className="detail__panel">
          <div className="detail__title">Competitor stack — click to expand</div>
          <div className="comp-stack">
            <CompRow isOurs comp={{}} buyBoxStatus={rec.buyBox} ourPrice={rec.ourPrice}/>
            {rec.competitors.map((c) => (
              <CompRow key={c.name} comp={c} isLeader={c.isLeader} ourPrice={rec.ourPrice}/>
            ))}
          </div>
        </div>

        <MiniStats rec={rec}/>
      </div>

      <div className="detail__col">
        <ManagerNote note={aiNote} loading={aiLoading}/>

        {/* AI decision walkthrough — step-by-step reasoning with weights.
            Comes from the AI when on; otherwise from the engine fallback. */}
        <DecisionWalkthrough
          steps={aiData?.reasoning_steps || rec.fallbackReasoningSteps || []}
          loading={aiLoading}
          source={aiData?.source}
        />

        {/* Forecast — orders/day, profit/day current vs target. */}
        <ExpectedImpact forecast={aiData?.forecast || rec.forecast}/>

        {rec.patterns.length > 0 && (
          <div className="detail__panel">
            <div className="detail__title">Patterns detected</div>
            <div className="patterns">
              {rec.patterns.map(p => (
                <div className={"pattern pattern--" + p.severity} key={p.key}>
                  <div>
                    <div className="pattern__label">{p.label}</div>
                    <div className="pattern__text">{p.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="detail__panel">
          <div className="detail__title">Recommendation engine · rules fired</div>
          <div className="rules-list">
            {rec.rules.map(r => <RuleItem rule={r} key={r.key}/>)}
          </div>
        </div>

        {!applied && (
          <div className="detail__actions">
            {rec.bucket !== "blocked" && rec.bucket !== "hold" && (
              <>
                <div className="detail__price-edit">
                  <label>SET PRICE</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editPrice == null ? "" : editPrice}
                    disabled={!!approval}
                    onChange={(e) => {
                      const n = Number(String(e.target.value).replace(/[^\d]/g, ""));
                      if (Number.isFinite(n)) setEditPrice(n);
                    }}
                  />
                  {violatesFloor && (
                    <span className="floor-violation">
                      <Icon name="lock" size={9}/>
                      below floor + cushion
                    </span>
                  )}
                </div>
                <span className="spacer"></span>
                <button className="btn btn--ghost btn--sm" onClick={onSkip}>
                  <Icon name="skip" size={12}/> Skip with reason
                </button>
                <button
                  className="btn btn--primary"
                  disabled={violatesFloor || !!approval}
                  onClick={() => onSendForApproval(editPrice)}
                >
                  <Icon name="send" size={12}/>
                  {approval ? "Pending approval" : `Send for approval at ${Rs(editPrice)}`}
                </button>
              </>
            )}
            {rec.bucket === "blocked" && (
              <>
                <span className="spacer"></span>
                <button className="btn btn--outlined" onClick={onSkip}>
                  Acknowledge &amp; monitor
                </button>
                <button className="btn btn--primary">Request floor review</button>
              </>
            )}
            {rec.bucket === "hold" && (
              <>
                <span className="spacer"></span>
                <button className="btn btn--outlined" onClick={onSkip}>Mark reviewed</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
