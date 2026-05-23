/* Stateless presentation primitives: Topbar, SubNav, StatTile,
   ConfidenceBadge, Sparkline, FlagChip, CompRow, RuleItem, ManagerNote,
   MiniStats, EmptyState. Lifted from the design prototype; logic preserved. */

import { useState } from "react";
import Link from "next/link";
import { Icon, Rs } from "./Icon";

// ───── Topbar ──────────────────────────────────────────────────────
export function Topbar() {
  return (
    <header className="topbar">
      <Link href="/" className="topbar__brand" style={{textDecoration: "none", color: "inherit"}}>
        <div className="topbar__logo">O</div>
        <span className="topbar__wordmark">Opptra</span>
        <span className="topbar__product">Pricing&nbsp;Copilot</span>
      </Link>
      <span className="topbar__spacer"></span>
      <Link href="/audit" className="topbar__link" title="Audit trail">
        <Icon name="history" size={14}/>
        <span>Audit trail</span>
      </Link>
      <div className="topbar__avatar" title="Ranjit K · Category Ops">RK</div>
    </header>
  );
}

// ───── Tabs / sub-nav ──────────────────────────────────────────────
export function SubNav({ tabs, active, onChange, meta }) {
  return (
    <div className="subnav">
      {tabs.map(tab => (
        <button
          key={tab.key}
          className={"subnav__tab " + (active === tab.key ? "subnav__tab--active" : "")}
          onClick={() => onChange(tab.key)}
        >
          {tab.icon && <Icon name={tab.icon} size={14}/>}
          {tab.label}
          {tab.count != null && <span className="count">{tab.count}</span>}
        </button>
      ))}
      <span className="subnav__spacer"></span>
      {meta && <span className="subnav__meta">{meta}</span>}
    </div>
  );
}

// ───── Stat tile ───────────────────────────────────────────────────
export function StatTile({ label, value, sub, variant }) {
  return (
    <div className={"stat-tile " + (variant ? "stat-tile--" + variant : "")}>
      <div className="stat-tile__label">{label}</div>
      <div className="stat-tile__value">{value}</div>
      {sub && <div className="stat-tile__sub">{sub}</div>}
    </div>
  );
}

// ───── Brand avatar ────────────────────────────────────────────────
// Small "logo" tile — colored from a hash of the brand name so each
// brand is consistently identifiable. Initials inside (1–2 chars).
const BRAND_PALETTE = [
  "#2e31be", "#7c3aed", "#ec4899", "#06b6d4", "#16a34a",
  "#f59e0b", "#FF9800", "#9C27B0", "#00BCD4", "#0ea5e9", "#dc2626", "#0d9488"
];
function hashBrand(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
export function BrandAvatar({ brand, size = 36 }) {
  const bg = BRAND_PALETTE[hashBrand(brand || "?") % BRAND_PALETTE.length];
  const initials = String(brand || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="brand-avatar"
      title={brand}
      style={{ background: bg, width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </div>
  );
}

// ───── Marketplace logo ────────────────────────────────────────────
// Tiny marketplace-branded tile used in approval cards and identity
// sub-lines. We use the marketplace's brand color and a 1-letter mark.
// No external images — keeps the bundle clean and avoids licensing.
const MARKETPLACE_VISUAL = {
  "Amazon India": { bg: "#FF9900", fg: "#0F1111", letter: "a" },
  "Noon UAE":     { bg: "#FEEE00", fg: "#1A1A1A", letter: "n" },
  "Flipkart":     { bg: "#2874F0", fg: "#FFC220", letter: "f" }
};
export function MarketplaceLogo({ marketplace, size = 18, withLabel = false }) {
  const v = MARKETPLACE_VISUAL[marketplace] || { bg: "#6b7280", fg: "#fff", letter: (marketplace || "?")[0] };
  return (
    <span className="marketplace-logo-wrap" title={marketplace}>
      <span
        className="marketplace-logo"
        style={{ background: v.bg, color: v.fg, width: size, height: size, fontSize: Math.round(size * 0.62) }}
      >
        {v.letter}
      </span>
      {withLabel && <span className="marketplace-logo__label">{marketplace}</span>}
    </span>
  );
}

// ───── Confidence badge ────────────────────────────────────────────
export function ConfidenceBadge({ confidence }) {
  if (!confidence) return null;
  const cls = "confidence confidence--" + confidence.toLowerCase();
  return <span className={cls}><span className="confidence__dot"></span>{confidence}</span>;
}

// ───── Sparkline ────────────────────────────────────────────────────
// Three modes:
//   "strip"  — compact labeled chart for the top of each list row
//              (visible lines, endpoint dots, no fade mask)
//   "row-bg" — legacy faded-background look (kept for fallback callers)
//   "card"   — full chart with axis grid and area fill (detail panel)
export function Sparkline({ history, mode = "strip", height = 64 }) {
  if (!history || history.length === 0) return null;
  const min = Math.min(...history.map(h => Math.min(h.ourPrice, h.competitorMedian)));
  const max = Math.max(...history.map(h => Math.max(h.ourPrice, h.competitorMedian)));
  const pad = (max - min) * 0.08 || 1;
  const lo = min - pad, hi = max + pad;
  const W = 1000, H = 100;
  const x = (i) => (i / (history.length - 1)) * W;
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const ours = history.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.ourPrice)}`).join(" ");
  const comp = history.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.competitorMedian)}`).join(" ");
  const lastOur = history[history.length - 1].ourPrice;
  const lastComp = history[history.length - 1].competitorMedian;

  if (mode === "strip") {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {/* subtle horizontal midline */}
        <line x1="0" x2={W} y1={H/2} y2={H/2} stroke="var(--sx-border-light)" strokeWidth="0.75" strokeDasharray="3 5" opacity="0.6"/>
        {/* competitor (dashed grey) */}
        <path d={comp} fill="none" stroke="var(--sx-text-muted)" strokeWidth="2" strokeDasharray="4 3" opacity="0.75" vectorEffect="non-scaling-stroke"/>
        {/* ours (solid indigo) */}
        <path d={ours} fill="none" stroke="var(--sx-primary)" strokeWidth="2.2" opacity="0.9" vectorEffect="non-scaling-stroke"/>
        {/* endpoint dots */}
        <circle cx={x(history.length - 1)} cy={y(lastOur)} r="6" fill="var(--sx-primary)" stroke="#fff" strokeWidth="2"/>
        <circle cx={x(history.length - 1)} cy={y(lastComp)} r="4" fill="var(--sx-text-muted)" stroke="#fff" strokeWidth="1.5"/>
      </svg>
    );
  }

  if (mode === "row-bg") {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={"sg-fade-" + history.length} x1="0" x2="1">
            <stop offset="0" stopColor="white" stopOpacity="1"/>
            <stop offset="0.65" stopColor="white" stopOpacity="0.4"/>
            <stop offset="1" stopColor="white" stopOpacity="0"/>
          </linearGradient>
          <mask id={"sg-mask-" + history.length}>
            <rect width={W} height={H} fill={"url(#sg-fade-" + history.length + ")"}/>
          </mask>
        </defs>
        <g mask={`url(#sg-mask-${history.length})`}>
          <path d={comp} fill="none" stroke="var(--sx-text-subtle)" strokeWidth="2" strokeDasharray="3 3" opacity="0.45"/>
          <path d={ours} fill="none" stroke="var(--sx-primary)" strokeWidth="2.5" opacity="0.4"/>
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="our-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--sx-primary)" stopOpacity="0.18"/>
          <stop offset="1" stopColor="var(--sx-primary)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <line x1="0" x2={W} y1={H/2} y2={H/2} stroke="var(--sx-border-light)" strokeDasharray="2 4"/>
      <path d={comp} fill="none" stroke="var(--sx-text-muted)" strokeWidth="2.5" strokeDasharray="5 4"/>
      <path d={ours + ` L${W},${H} L0,${H} Z`} fill="url(#our-fill)"/>
      <path d={ours} fill="none" stroke="var(--sx-primary)" strokeWidth="2.5"/>
      <circle cx={x(history.length - 1)} cy={y(lastOur)} r="5" fill="var(--sx-primary)" stroke="#fff" strokeWidth="2"/>
    </svg>
  );
}

// ───── Pattern flag chip ───────────────────────────────────────────
export function FlagChip({ pattern }) {
  const cls = "flag flag--" + pattern.severity;
  const iconByKey = { recovery_decay: "clock", velocity: "zap", flash_sale: "flame", portfolio: "layers", stale: "info" };
  return (
    <span className={cls}>
      <Icon name={iconByKey[pattern.key] || "info"} size={9}/>
      {pattern.label}
    </span>
  );
}

// ───── Competitor row (collapsible) ────────────────────────────────
// Only renders fields we actually have. `buyBoxShare` and `lastMove*`
// come from richer feeds we don't have in the current upload schema —
// we hide them when missing rather than fabricating values.
export function CompRow({ comp, isOurs, isLeader, ourPrice, buyBoxStatus }) {
  const [open, setOpen] = useState(false);
  const hasMove = comp?.lastMoveDirection != null && comp?.lastMoveSize != null;
  const hasShare = comp?.buyBoxShare != null;

  return (
    <div className={"comp-row " + (isOurs ? "comp-row--ours " : "") + (isLeader ? "comp-row--leader " : "") + (open ? "comp-row--expanded" : "")} onClick={() => setOpen(o => !o)}>
      <div className="comp-row__top">
        <span className="comp-row__name">
          {isOurs ? "🏷 Our listing" : comp.name}
          {isLeader && !isOurs && <span className="comp-row__leader-tag">Buy Box</span>}
        </span>
        <span className="comp-row__price">{Rs(isOurs ? ourPrice : comp.price)}</span>
        {isOurs && buyBoxStatus ? (
          <span className={"comp-row__status comp-row__status--" + buyBoxStatus.toLowerCase()}>
            Buy Box {buyBoxStatus}
          </span>
        ) : hasShare ? (
          <span className="comp-row__bbox">
            <span className="comp-row__bbox-bar"><i style={{width: comp.buyBoxShare + "%"}}></i></span>
            {comp.buyBoxShare}%
          </span>
        ) : (
          <span className="comp-row__bbox comp-row__bbox--na" title="No share data in the upload">—</span>
        )}
        <span className="comp-row__chev"><Icon name="chevronDown" size={14}/></span>
      </div>
      {open && !isOurs && (
        <div className="comp-row__detail">
          {hasMove && (
            <div className="comp-row__detail-cell">
              <strong>Last move</strong>
              {comp.lastMoveDirection === "down" ? "↓" : "↑"} {Rs(comp.lastMoveSize)}{" "}
              <span className="muted">({comp.lastMoveDaysAgo === 0 ? "today" : comp.lastMoveDaysAgo + "d ago"})</span>
            </div>
          )}
          <div className="comp-row__detail-cell">
            <strong>Gap vs us</strong>
            <span className="tabular" style={{color: comp.price < ourPrice ? "var(--sx-error)" : "var(--sx-success)"}}>
              {comp.price < ourPrice ? "−" : "+"}{Rs(Math.abs(comp.price - ourPrice))}{" "}
              ({((comp.price - ourPrice) / ourPrice * 100).toFixed(1)}%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ───── Rule weight row ─────────────────────────────────────────────
export function RuleItem({ rule }) {
  const sign = rule.weight > 0 ? "pos" : rule.weight < 0 ? "neg" : "zero";
  const cls = "rule__weight rule__weight--" + sign;
  return (
    <div className="rule">
      <div className="rule__body">
        <div className="rule__label">{rule.label}</div>
        {rule.detail && <div className="rule__detail">{rule.detail}</div>}
      </div>
      <span className={cls}>{rule.weight > 0 ? "+" : ""}{rule.weight.toFixed(2)}</span>
    </div>
  );
}

// ───── Manager's note ──────────────────────────────────────────────
export function ManagerNote({ note, loading }) {
  if (!loading && !note) return null;
  return (
    <div className="mgr-note">
      <div className="mgr-note__icon"><Icon name="sparkle" size={12}/></div>
      <div className="mgr-note__body">
        <div className="mgr-note__label">Manager&apos;s Note · AI</div>
        <div className="mgr-note__text">
          {loading ? <span className="row__rec-shimmer"></span> : note}
        </div>
      </div>
    </div>
  );
}

// ───── Mini stats grid (in detail panel) ───────────────────────────
export function MiniStats({ rec }) {
  const items = [];
  items.push({
    label: "Gap to top comp.",
    value: `${rec.gapInr >= 0 ? "+" : ""}${Rs(rec.gapInr)} (${rec.gapPct.toFixed(1)}%)`,
    variant: rec.gapInr < 0 ? "danger" : "success"
  });
  items.push({
    label: "Headroom to floor",
    value: Rs(rec.headroomToFloor),
  });
  items.push({
    label: rec.bucket === "raise" ? "Margin captured" : "Margin sacrifice",
    value: rec.bucket === "raise"
      ? `+${Rs(rec.marginGainInr)} (${(rec.marginGainInr / rec.ourPrice * 100).toFixed(1)}%)`
      : `${Rs(rec.marginSacrificeInr)} (${rec.marginSacrificePct.toFixed(1)}%)`,
    variant: rec.bucket === "raise" ? "success" : (rec.marginSacrificePct > 6 ? "warn" : null)
  });
  items.push({
    label: "Resulting margin",
    value: `${rec.resultingMarginPct.toFixed(1)}%`,
  });
  // Optional category-lead inputs — only surface when the upload provided
  // them. These give the lead a fast read of "is my own data being used?"
  if (Number.isFinite(rec.ordersInPeriod) && Number.isFinite(rec.periodDays)) {
    items.push({
      label: "Orders (reported)",
      value: `${rec.ordersInPeriod} in ${rec.periodDays}d  (${(rec.ordersInPeriod / rec.periodDays).toFixed(1)}/day)`,
    });
  }
  if (Number.isFinite(rec.profitMargin)) {
    items.push({
      label: "Profit margin (reported)",
      value: `${(rec.profitMargin * 100).toFixed(1)}%`,
    });
  }
  return (
    <div className="mini-stats">
      {items.map((it, i) => (
        <div className="mini-stat" key={i}>
          <div className="mini-stat__label">{it.label}</div>
          <div className={"mini-stat__value " + (it.variant ? "mini-stat__value--" + it.variant : "")}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

// ───── Toast region ────────────────────────────────────────────────
export function ToastRegion({ toasts, dismissToast }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map(toast => (
        <div className="toast" key={toast.id}>
          <span className="toast__icon"><Icon name="check" size={11} color="#fff"/></span>
          <span>{toast.msg}</span>
          {toast.undo && <button className="toast__undo" onClick={() => { toast.undo(); dismissToast(toast.id); }}>Undo</button>}
        </div>
      ))}
    </div>
  );
}

// ───── Skip-reason modal ───────────────────────────────────────────
const SKIP_REASONS = [
  "Holding for an upcoming promo",
  "Disagree with price — too aggressive",
  "Disagree with price — not aggressive enough",
  "Need more competitor context",
  "Brand restriction — can't move",
  "Other"
];
export function SkipReasonModal({ rec, onCancel, onSubmit }) {
  const [reason, setReason] = useState(SKIP_REASONS[0]);
  const [note, setNote] = useState("");
  if (!rec) return null;
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">Skip recommendation for {rec.sku}</div>
        <div className="modal__desc">Tell us why — feeds the heuristic library so v2 catches it next time.</div>
        <div className="modal__options">
          {SKIP_REASONS.map(r => (
            <button
              key={r}
              className={"modal__option " + (reason === r ? "modal__option--active" : "")}
              onClick={() => setReason(r)}
            >
              {reason === r ? <Icon name="check" size={13}/> : <span style={{width: 13}}></span>}
              {r}
            </button>
          ))}
        </div>
        {reason === "Other" && (
          <textarea className="modal__textarea" placeholder="One sentence is enough…" value={note} onChange={e => setNote(e.target.value)} autoFocus></textarea>
        )}
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn--primary" onClick={() => onSubmit({ reason, note })}>Skip &amp; log reason</button>
        </div>
      </div>
    </div>
  );
}

// ───── Send-for-approval modal ─────────────────────────────────────
// Opens when Ranjit clicks "Send for approval" on a row or in the detail
// panel. Shows the engine's price summary + AI rec + Manager's Note as
// read-only context, then asks for a free-text note + urgency. The
// approval card on the Approvals page renders the full snapshot.
export function SendApprovalModal({ target, aiData, approver, onCancel, onSubmit }) {
  const [note, setNote] = useState("");
  const [urgency, setUrgency] = useState("normal");
  if (!target) return null;

  const { rec, price } = target;
  const delta = price - rec.ourPrice;
  const isBlocked = rec.bucket === "blocked";
  const aiRec = aiData?.rec || rec.fallbackRec;
  const aiNote = aiData?.note || rec.fallbackNote || "";

  const submit = () => onSubmit({ note: note.trim(), urgency, aiRec, aiNote });

  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal send-modal" onClick={(e) => e.stopPropagation()}>
        <div className="send-modal__head">
          <div className="modal__title">Send for approval — {rec.sku}</div>
          <div className="modal__desc">
            {rec.name} · {rec.brand} · {rec.marketplace}
          </div>
        </div>

        {/* Price summary using the same box style as the row */}
        <div className="send-modal__prices">
          <div className="price-box price-box--neutral">
            <span className="price-box__label">NOW</span>
            <span className="price-box__value">{Rs(rec.ourPrice)}</span>
          </div>
          <Icon name="arrowRight" size={14}/>
          <div className={"price-box " + (isBlocked ? "price-box--blocked" : (delta > 0 ? "price-box--up" : "price-box--down"))}>
            <span className="price-box__label">TARGET</span>
            <span className="price-box__value">{isBlocked ? "HOLD" : Rs(price)}</span>
            {!isBlocked && delta !== 0 && (
              <span className={"price-box__delta " + (delta > 0 ? "price-box__delta--up" : "price-box__delta--down")}>
                {delta > 0 ? "+" : ""}{Rs(delta)} {delta > 0 ? "↑" : "↓"}
              </span>
            )}
          </div>
          {!isBlocked && (
            <span className="margin-pill">
              {rec.resultingMarginPct.toFixed(1)}% <span className="margin-pill__sub">margin</span>
            </span>
          )}
        </div>

        {/* AI context — read-only snapshot that gets attached to the approval */}
        <div className="send-modal__ai">
          <div className="send-modal__ai-row">
            <div className="send-modal__ai-icon"><Icon name="sparkle" size={11}/></div>
            <div className="send-modal__ai-body">
              <div className="send-modal__ai-label">AI recommendation</div>
              <div className="send-modal__ai-text">{aiRec}</div>
            </div>
          </div>
          {aiNote && (
            <div className="send-modal__ai-row">
              <div className="send-modal__ai-icon send-modal__ai-icon--note"><Icon name="info" size={11}/></div>
              <div className="send-modal__ai-body">
                <div className="send-modal__ai-label">Manager&apos;s Note</div>
                <div className="send-modal__ai-text">{aiNote}</div>
              </div>
            </div>
          )}
        </div>

        {/* Approver + urgency */}
        <div className="send-modal__meta">
          <div className="send-modal__meta-row">
            <span className="send-modal__meta-label">Approver</span>
            <span className="send-modal__meta-value">{approver}</span>
          </div>
          <div className="send-modal__meta-row">
            <span className="send-modal__meta-label">Urgency</span>
            <div className="urgency-toggle">
              <button
                type="button"
                className={"urgency-toggle__btn " + (urgency === "normal" ? "urgency-toggle__btn--active" : "")}
                onClick={() => setUrgency("normal")}
              >Normal</button>
              <button
                type="button"
                className={"urgency-toggle__btn urgency-toggle__btn--urgent " + (urgency === "urgent" ? "urgency-toggle__btn--active" : "")}
                onClick={() => setUrgency("urgent")}
              >
                <Icon name="flame" size={10}/> Urgent
              </button>
            </div>
          </div>
        </div>

        {/* Free-text note from Ranjit */}
        <div className="send-modal__note">
          <label className="send-modal__note-label">
            Note for the approver <span className="send-modal__note-hint">(optional but helpful)</span>
          </label>
          <textarea
            className="modal__textarea"
            placeholder="e.g. Customer flagged this in support, please prioritize."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            autoFocus
          />
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn--primary" onClick={submit}>
            <Icon name="send" size={12}/> Send to {approver.split(" ")[0]} at {Rs(price)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───── Empty state ─────────────────────────────────────────────────
export function EmptyState({ title = "All clear", desc = "Nothing in this view right now." }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon"><Icon name="checkCircle" size={28}/></div>
      <div className="empty-state__title">{title}</div>
      <div className="empty-state__desc">{desc}</div>
    </div>
  );
}
