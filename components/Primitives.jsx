/* Stateless presentation primitives: Topbar, SubNav, StatTile,
   ConfidenceBadge, Sparkline, FlagChip, CompRow, RuleItem, ManagerNote,
   MiniStats, EmptyState. Lifted from the design prototype; logic preserved. */

import { useState } from "react";
import { Icon, Rs } from "./Icon";

// ───── Topbar ──────────────────────────────────────────────────────
export function Topbar({ pendingCount }) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <div className="topbar__logo">O</div>
        <span className="topbar__wordmark">Opptra</span>
        <span className="topbar__product">Pricing&nbsp;Copilot</span>
      </div>
      <span className="topbar__spacer"></span>
      <span className="topbar__chip">
        <span className="dot"></span>
        Live feeds healthy · 28 brands
      </span>
      <button className="topbar__icon-btn" aria-label="History"><Icon name="history" size={18} /></button>
      <button className="topbar__icon-btn" aria-label="Notifications">
        <Icon name="bell" size={18} />
        {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
      </button>
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

// ───── Confidence badge ────────────────────────────────────────────
export function ConfidenceBadge({ confidence }) {
  if (!confidence) return null;
  const cls = "confidence confidence--" + confidence.toLowerCase();
  return <span className={cls}><span className="confidence__dot"></span>{confidence}</span>;
}

// ───── Sparkline (row-bg vs card) ──────────────────────────────────
export function Sparkline({ history, mode = "row-bg", height = 64 }) {
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
      <circle cx={x(history.length - 1)} cy={y(history[history.length-1].ourPrice)} r="5" fill="var(--sx-primary)" stroke="#fff" strokeWidth="2"/>
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
export function CompRow({ comp, isOurs, isLeader, ourPrice }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"comp-row " + (isOurs ? "comp-row--ours " : "") + (isLeader ? "comp-row--leader " : "") + (open ? "comp-row--expanded" : "")} onClick={() => setOpen(o => !o)}>
      <div className="comp-row__top">
        <span className="comp-row__name">
          {isOurs ? "🏷 Our listing" : comp.name}
          {isLeader && !isOurs && <span className="comp-row__leader-tag">Buy Box</span>}
        </span>
        <span className="comp-row__price">{Rs(isOurs ? ourPrice : comp.price)}</span>
        <span className="comp-row__bbox">
          <span className="comp-row__bbox-bar"><i style={{width: (comp.buyBoxShare || 0) + "%"}}></i></span>
          {(comp.buyBoxShare ?? 0)}%
        </span>
        <span className="comp-row__chev"><Icon name="chevronDown" size={14}/></span>
      </div>
      {open && !isOurs && (
        <div className="comp-row__detail">
          <div className="comp-row__detail-cell">
            <strong>Last move</strong>
            {comp.lastMoveDirection === "down" ? "↓" : "↑"} {Rs(comp.lastMoveSize)}{" "}
            <span className="muted">({comp.lastMoveDaysAgo === 0 ? "today" : comp.lastMoveDaysAgo + "d ago"})</span>
          </div>
          <div className="comp-row__detail-cell">
            <strong>Gap vs us</strong>
            <span className="tabular" style={{color: comp.price < ourPrice ? "var(--sx-error)" : "var(--sx-success)"}}>
              {comp.price < ourPrice ? "−" : "+"}{Rs(Math.abs(comp.price - ourPrice))}{" "}
              ({((comp.price - ourPrice) / ourPrice * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="comp-row__detail-cell">
            <strong>Buy Box share</strong>
            <span className="tabular">{comp.buyBoxShare}% (last 7d)</span>
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
