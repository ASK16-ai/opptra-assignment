/* The compact ListingRow + DetailPanel (expand-in-place).
   Mirrors design/random/project/views.jsx with the layout intact. */

import { useEffect, useState } from "react";
import { Icon, Rs } from "./Icon";
import {
  Sparkline, FlagChip, ConfidenceBadge, BrandAvatar,
  CompRow, RuleItem, MiniStats, MarketplaceLogo
} from "./Primitives";
import { GUT_RULES } from "../lib/heuristics";
import { usePersistedState } from "../lib/usePersistedState";

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

// ── useRepriceEvents ─────────────────────────────────────────────
// Pulls our own repricing actions for a given listing id from the
// persisted audit log, oldest first. Used by the history chart and
// the "Recent changes" list inside it.
export function useRepriceEvents(id) {
  const [auditLog] = usePersistedState("opptra-audit-log", []);
  return (auditLog || [])
    .filter(e => e.id === id && (e.type === "repriced" || e.type === "reprice_reverted"))
    .sort((a, b) => a.at - b.at);
}

function fmtAgo(ms) {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

// ── Price-history chart with reference lines + our reprice events ──
// Renders a 30-day chart that overlays:
//   • our price line (solid indigo) with area fill
//   • top competitor median (dashed grey)
//   • floor reference (dashed amber, near the bottom)
//   • recommended target (dashed indigo) when a recommendation exists
//   • markers for our reprice events from the audit log
// Falls back to a sparse just-current-price chart if no history exists
// (e.g. uploaded data with no synthesized history).
function PriceHistoryChart({ rec, events }) {
  const hasHistory = Array.isArray(rec.history30d) && rec.history30d.length > 1;
  const days = 30;

  // Build the series. If history is missing we synthesize a flat line
  // at the current price so the axes and reference lines still render
  // — anything is more useful than an empty box.
  const hist = hasHistory
    ? rec.history30d
    : Array.from({ length: days + 1 }, (_, i) => ({
        daysAgo: days - i,
        ourPrice: rec.ourPrice,
        competitorMedian: rec.topCompetitor?.price ?? rec.ourPrice
      }));

  const W = 1000, H = 220;
  const PAD = { top: 18, right: 70, bottom: 28, left: 16 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // Y range — include floor + recommended so reference lines never go off-canvas.
  const ys = [
    ...hist.map(h => h.ourPrice),
    ...hist.map(h => h.competitorMedian),
    rec.floor,
    rec.recommended
  ].filter(Number.isFinite);
  const lo0 = Math.min(...ys);
  const hi0 = Math.max(...ys);
  const padY = (hi0 - lo0) * 0.10 || Math.max(lo0 * 0.04, 1);
  const lo = lo0 - padY;
  const hi = hi0 + padY;

  const xAt = (i) => PAD.left + (i / (hist.length - 1)) * innerW;
  const yAt = (v) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  const ourPath = hist.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(d.ourPrice)}`).join(" ");
  const compPath = hist.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(d.competitorMedian)}`).join(" ");

  // Convert an event timestamp to a chart x. We align to the closest
  // history point so markers always sit on the line.
  const eventMarkers = (events || []).map((e) => {
    const eDaysAgo = Math.max(0, Math.min(days, (Date.now() - e.at) / 86400000));
    // hist is ordered oldest → newest; index 0 = 30d ago, last = today
    const idx = Math.round((days - eDaysAgo) * (hist.length - 1) / days);
    const safeIdx = Math.max(0, Math.min(hist.length - 1, idx));
    return {
      x: xAt(safeIdx),
      y: yAt(e.newPrice),
      newPrice: e.newPrice,
      prevPrice: e.prevPrice,
      type: e.type
    };
  });

  const todayPoint = hist[hist.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="hist-chart">
      <defs>
        <linearGradient id="hist-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--sx-primary)" stopOpacity="0.18"/>
          <stop offset="1" stopColor="var(--sx-primary)" stopOpacity="0"/>
        </linearGradient>
      </defs>

      {/* Grid: top/bottom axis lines */}
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top} y2={PAD.top}
            stroke="var(--sx-border-light)" strokeDasharray="2 4"/>
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom}
            stroke="var(--sx-border-light)"/>

      {/* Floor reference (dashed amber) */}
      <line
        x1={PAD.left} x2={W - PAD.right}
        y1={yAt(rec.floor)} y2={yAt(rec.floor)}
        stroke="var(--sx-warning)" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7"
      />
      <text x={W - PAD.right + 6} y={yAt(rec.floor) + 4}
            fontSize="11" fontWeight="600" fill="var(--sx-warning-fg)">
        Floor {Rs(rec.floor)}
      </text>

      {/* Recommended target (when present, not blocked/hold) */}
      {Number.isFinite(rec.recommended) && (
        <>
          <line
            x1={PAD.left} x2={W - PAD.right}
            y1={yAt(rec.recommended)} y2={yAt(rec.recommended)}
            stroke="var(--sx-primary)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.55"
          />
          <text x={W - PAD.right + 6} y={yAt(rec.recommended) + 4}
                fontSize="11" fontWeight="600" fill="var(--sx-primary)">
            Target {Rs(rec.recommended)}
          </text>
        </>
      )}

      {/* Competitor median */}
      <path d={compPath} fill="none"
            stroke="var(--sx-text-muted)" strokeWidth="2" strokeDasharray="5 4" opacity="0.85"
            vectorEffect="non-scaling-stroke"/>

      {/* Our price area + line */}
      <path d={ourPath + ` L${xAt(hist.length - 1)},${H - PAD.bottom} L${xAt(0)},${H - PAD.bottom} Z`}
            fill="url(#hist-fill)"/>
      <path d={ourPath} fill="none"
            stroke="var(--sx-primary)" strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"/>

      {/* Today endpoint dots */}
      <circle cx={xAt(hist.length - 1)} cy={yAt(todayPoint.ourPrice)}
              r="5" fill="var(--sx-primary)" stroke="#fff" strokeWidth="2"/>
      <circle cx={xAt(hist.length - 1)} cy={yAt(todayPoint.competitorMedian)}
              r="4" fill="var(--sx-text-muted)" stroke="#fff" strokeWidth="1.5"/>

      {/* Our reprice event markers */}
      {eventMarkers.map((m, i) => (
        <g key={i}>
          <circle cx={m.x} cy={m.y} r="6"
                  fill={m.type === "repriced" ? "var(--sx-success)" : "var(--sx-warning)"}
                  stroke="#fff" strokeWidth="2"/>
          {/* Tiny vertical tick down to the axis so the marker reads as an event */}
          <line x1={m.x} x2={m.x} y1={m.y + 7} y2={H - PAD.bottom - 1}
                stroke={m.type === "repriced" ? "var(--sx-success)" : "var(--sx-warning)"}
                strokeWidth="1" strokeDasharray="2 2" opacity="0.5"/>
        </g>
      ))}

      {/* X-axis dates */}
      <text x={PAD.left} y={H - PAD.bottom + 16}
            fontSize="10.5" fill="var(--sx-text-muted)">30d ago</text>
      <text x={PAD.left + innerW * 0.5} y={H - PAD.bottom + 16}
            fontSize="10.5" fill="var(--sx-text-muted)" textAnchor="middle">15d ago</text>
      <text x={W - PAD.right} y={H - PAD.bottom + 16}
            fontSize="10.5" fill="var(--sx-text-muted)" textAnchor="end">Today</text>
    </svg>
  );
}

export function PriceHistoryPanel({ rec, compact = false }) {
  const events = useRepriceEvents(rec.id);
  const hasHistory = Array.isArray(rec.history30d) && rec.history30d.length > 1;

  return (
    <div className={"detail__panel hist-panel " + (compact ? "hist-panel--compact" : "")}>
      <div className="hist-panel__head">
        <span className="detail__title hist-panel__title">Price history · last 30 days</span>
        <div className="hist-panel__legend">
          <span className="hist-legend-item">
            <span className="hist-swatch hist-swatch--ours"></span>Our price
          </span>
          <span className="hist-legend-item">
            <span className="hist-swatch hist-swatch--comp"></span>Top competitor
          </span>
          {Number.isFinite(rec.recommended) && (
            <span className="hist-legend-item">
              <span className="hist-swatch hist-swatch--target"></span>Target
            </span>
          )}
          <span className="hist-legend-item">
            <span className="hist-swatch hist-swatch--floor"></span>Floor
          </span>
        </div>
      </div>

      {!hasHistory && events.length === 0 && (
        <div className="hist-panel__empty-hint">
          No price history captured yet. The chart will populate as you make repricing decisions.
        </div>
      )}

      <div className="hist-panel__chart">
        <PriceHistoryChart rec={rec} events={events}/>
      </div>

      {!compact && (
        <div className="hist-panel__changes">
          <div className="hist-panel__changes-title">Our changes on this listing</div>
          {events.length === 0 ? (
            <div className="hist-panel__changes-empty">No repricing actions yet.</div>
          ) : (
            <ul className="hist-changes-list">
              {[...events].reverse().slice(0, 5).map((e, i) => {
                const delta = (e.newPrice ?? 0) - (e.prevPrice ?? 0);
                const up = delta > 0;
                const reverted = e.type === "reprice_reverted";
                return (
                  <li key={i} className="hist-change">
                    <span className={"hist-change__badge " + (reverted ? "hist-change__badge--reverted" : "hist-change__badge--applied")}>
                      {reverted ? "Reverted" : "Applied"}
                    </span>
                    <span className="hist-change__when">{fmtAgo(e.at)}</span>
                    <span className="hist-change__price">
                      {Rs(e.prevPrice)} <span className="hist-change__arrow">→</span> {Rs(e.newPrice)}
                    </span>
                    <span className={"hist-change__delta " + (up ? "hist-change__delta--up" : "hist-change__delta--down")}>
                      {up ? "+" : ""}{Rs(delta)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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

        {/* Price history chart — fills the previously empty left-column
            space with the 30-day trend + reference lines (floor / target)
            and markers for every reprice action we've taken on this SKU. */}
        <PriceHistoryPanel rec={rec}/>
      </div>

      <div className="detail__col">
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
