/* The four top-level views: Marketplace×SKU, SKU rolled up, Brand
   grouped, Approvals. */

import { useMemo, useState } from "react";
import { Icon, Rs } from "./Icon";
import { ListingRow } from "./ListingRow";
import { EmptyState, BrandAvatar, MarketplaceLogo } from "./Primitives";
import { GUT_RULES } from "../lib/heuristics";

// ─── View 1: M × SKU listings, sorted by criticality ──────────────────
export function MarketplaceSkuView({
  recs, aiBySku, aiLoading, approvalsBySku, appliedBySku, skippedBySku,
  expandedId, setExpandedId, filter,
  onSendForApproval, onSkip, onUndoApply
}) {
  const visible = recs.filter(r => {
    if (skippedBySku[r.id]) return false;
    if (filter === "all") return true;
    if (filter === "needs") return r.bucket === "recover" || r.bucket === "raise";
    if (filter === "pending") return !!approvalsBySku[r.id];
    return r.bucket === filter;
  });

  const bucketOrder = { recover: 0, raise: 1, blocked: 2, hold: 3 };
  const sorted = [...visible].sort((a, b) => {
    if (appliedBySku[a.id] && !appliedBySku[b.id]) return 1;
    if (!appliedBySku[a.id] && appliedBySku[b.id]) return -1;
    if (bucketOrder[a.bucket] !== bucketOrder[b.bucket]) return bucketOrder[a.bucket] - bucketOrder[b.bucket];
    const sa = a.daysSince - b.daysSince;
    if (sa !== 0) return -sa;
    const ma = Math.abs(a.marginSacrificeInr || a.marginGainInr || 0);
    const mb = Math.abs(b.marginSacrificeInr || b.marginGainInr || 0);
    return mb - ma;
  });

  if (sorted.length === 0) {
    return <EmptyState title="Nothing to triage" desc="No listings match this filter."/>;
  }

  return (
    <div className="row-list">
      {sorted.map(rec => (
        <ListingRow
          key={rec.id}
          rec={rec}
          aiData={aiBySku[rec.id]}
          aiLoading={aiLoading && !aiBySku[rec.id]}
          approval={approvalsBySku[rec.id]}
          applied={appliedBySku[rec.id]}
          expanded={expandedId === rec.id}
          onExpand={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
          onSendForApproval={(price) => onSendForApproval(rec, price)}
          onSkip={() => onSkip(rec.id)}
          onUndoApply={() => onUndoApply(rec.id)}
        />
      ))}
    </div>
  );
}

// ─── View 2: SKU view (rolled up across marketplaces) ─────────────────
export function SkuView({ recs, aiBySku, aiLoading, approvalsBySku, appliedBySku, skippedBySku,
                   expandedId, setExpandedId, onSendForApproval, onSkip, onUndoApply }) {
  const groups = useMemo(() => {
    const map = {};
    recs.forEach(r => {
      if (!map[r.sku]) map[r.sku] = { sku: r.sku, brand: r.brand, name: r.name, category: r.category, listings: [] };
      map[r.sku].listings.push(r);
    });
    return Object.values(map);
  }, [recs]);

  const enriched = groups.map(g => {
    const lost = g.listings.filter(l => l.buyBox === "Lost").length;
    const won = g.listings.filter(l => l.buyBox === "Won").length;
    const recover = g.listings.filter(l => l.bucket === "recover").length;
    const raise = g.listings.filter(l => l.bucket === "raise").length;
    const blocked = g.listings.filter(l => l.bucket === "blocked").length;
    const opportunityValue = g.listings.reduce((s, l) => s + Math.abs(l.marginSacrificeInr || l.marginGainInr || 0), 0);
    const criticality =
      recover * 10 + blocked * 6 + raise * 3 +
      Math.max(...g.listings.map(l => l.daysSince), 0) * 0.5;
    return { ...g, lost, won, recover, raise, blocked, opportunityValue, criticality };
  }).sort((a, b) => b.criticality - a.criticality);

  const [openSku, setOpenSku] = useState(null);

  return (
    <div>
      {enriched.map(g => (
        <div className="sku-card" key={g.sku}>
          <div className="sku-card__head" onClick={() => setOpenSku(openSku === g.sku ? null : g.sku)}>
            <div className="sku-card__title">
              <span className="row__sku">{g.sku}</span>
              <div className="sku-card__title-text">
                <div className="name">{g.name}</div>
                <div className="brand">{g.brand} · {g.category}</div>
              </div>
            </div>
            <div className="sku-card__bbox">
              <span className="ratio"><strong>{g.won}/{g.listings.length}</strong></span>{" "}
              <span className="muted">Buy Boxes held</span>
            </div>
            <div className="sku-card__rollup">
              {g.recover > 0 && <span><Icon name="trendDown" size={11} color="var(--sx-error)"/> <strong>{g.recover}</strong> to recover</span>}
              {g.raise > 0 && <span><Icon name="trendUp" size={11} color="var(--sx-success)"/> <strong>{g.raise}</strong> to raise</span>}
              {g.blocked > 0 && <span><Icon name="lock" size={11} color="var(--sx-warning)"/> <strong>{g.blocked}</strong> blocked</span>}
              {g.recover + g.raise + g.blocked === 0 && <span className="muted">No action</span>}
            </div>
            <div className="sku-card__rollup">
              <span><strong>{Rs(g.opportunityValue)}</strong> <span className="muted">opportunity / unit (sum)</span></span>
            </div>
            <button className="row__expand-btn sku-card__expand" style={{transform: openSku === g.sku ? "rotate(180deg)" : ""}}>
              <Icon name="chevronDown" size={14}/>
            </button>
          </div>
          {openSku === g.sku && (
            <div className="sku-card__children">
              {g.listings.map(rec => (
                <ListingRow
                  key={rec.id}
                  rec={rec}
                  aiData={aiBySku[rec.id]}
                  aiLoading={aiLoading && !aiBySku[rec.id]}
                  approval={approvalsBySku[rec.id]}
                  applied={appliedBySku[rec.id]}
                  expanded={expandedId === rec.id}
                  onExpand={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                  onSendForApproval={(price) => onSendForApproval(rec, price)}
                  onSkip={() => onSkip(rec.id)}
                  onUndoApply={() => onUndoApply(rec.id)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── View 3: Brand grouped — nested collapsible dropdowns ──────────────
// Each brand is a top-level collapsible. Inside, listings are split into
// two sub-groups: "Action needed" (recover/raise/blocked) and "Healthy"
// (hold). Healthy is collapsed by default so the eye lands on action.
const ACTION_BUCKETS = new Set(["recover", "raise", "blocked"]);

function BrandGroup({ label, variant, listings, defaultOpen = true, rowProps }) {
  const [open, setOpen] = useState(defaultOpen);
  if (listings.length === 0) return null;
  const variantPrefix = variant ? "brand-group--" + variant : "";
  return (
    <div className={"brand-group " + variantPrefix}>
      <button className="brand-group__head" onClick={() => setOpen(o => !o)}>
        <span className={"brand-group__chev " + (open ? "brand-group__chev--open" : "")}>
          <Icon name="chevronDown" size={11}/>
        </span>
        <span className="brand-group__label">{label}</span>
        <span className="brand-group__count">{listings.length}</span>
      </button>
      {open && (
        <div className="brand-group__body">
          {listings.map(rec => (
            <ListingRow
              key={rec.id}
              rec={rec}
              {...rowProps(rec)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BrandView({ recs, aiBySku, aiLoading, approvalsBySku, appliedBySku, skippedBySku,
                     expandedId, setExpandedId, onSendForApproval, onSkip, onUndoApply }) {
  const brands = useMemo(() => {
    const map = {};
    recs.forEach(r => {
      if (!map[r.brand]) map[r.brand] = [];
      map[r.brand].push(r);
    });
    const bucketOrder = { recover: 0, raise: 1, blocked: 2, hold: 3 };
    Object.values(map).forEach(list => list.sort((a, b) => {
      if (bucketOrder[a.bucket] !== bucketOrder[b.bucket]) return bucketOrder[a.bucket] - bucketOrder[b.bucket];
      return b.daysSince - a.daysSince;
    }));
    return Object.entries(map).sort(([, a], [, b]) => {
      const aCrit = a.filter(r => r.bucket === "recover").length;
      const bCrit = b.filter(r => r.bucket === "recover").length;
      return bCrit - aCrit;
    });
  }, [recs]);

  // Top-level brand open/closed state. By default the most-critical brand
  // (first in the sort) is open; others are closed.
  const [openBrand, setOpenBrand] = useState(() => brands[0]?.[0] || null);

  const rowProps = (rec) => ({
    aiData: aiBySku[rec.id],
    aiLoading: aiLoading && !aiBySku[rec.id],
    approval: approvalsBySku[rec.id],
    applied: appliedBySku[rec.id],
    expanded: expandedId === rec.id,
    onExpand: () => setExpandedId(expandedId === rec.id ? null : rec.id),
    onSendForApproval: (price) => onSendForApproval(rec, price),
    onSkip: () => onSkip(rec.id),
    onUndoApply: () => onUndoApply(rec.id)
  });

  return (
    <div>
      {brands.map(([brand, listings]) => {
        const visible = listings.filter(r => !skippedBySku[r.id]);
        const actionNeeded = visible.filter(r => ACTION_BUCKETS.has(r.bucket));
        const healthy = visible.filter(r => r.bucket === "hold");
        const recoverCount = visible.filter(r => r.bucket === "recover").length;
        const moveTodayCount = visible.filter(r => r.daysSince === 0).length;
        const portfolioWarn = moveTodayCount >= GUT_RULES.PORTFOLIO_LIMIT;
        const isOpen = openBrand === brand;

        return (
          <div className={"brand-block " + (isOpen ? "brand-block--open" : "")} key={brand}>
            <button
              className="brand-block__head"
              onClick={() => setOpenBrand(isOpen ? null : brand)}
            >
              <BrandAvatar brand={brand} size={32}/>
              <div className="brand-block__title">
                <span className="brand-block__name">{brand}</span>
                <span className="brand-block__count">
                  {visible.length} listings ·{" "}
                  <strong>{actionNeeded.length}</strong> need attention ·{" "}
                  {healthy.length} healthy
                </span>
              </div>
              {recoverCount > 0 && (
                <span className="brand-block__pill brand-block__pill--alert">
                  {recoverCount} recover
                </span>
              )}
              {portfolioWarn && (
                <span className="brand-block__warn">
                  <Icon name="alert" size={10}/>
                  {moveTodayCount} moves today — at portfolio limit
                </span>
              )}
              <span className="brand-block__spacer"></span>
              <span className={"brand-block__chev " + (isOpen ? "brand-block__chev--open" : "")}>
                <Icon name="chevronDown" size={14}/>
              </span>
            </button>

            {isOpen && (
              <div className="brand-block__body">
                <BrandGroup
                  label="Action needed"
                  variant="alert"
                  listings={actionNeeded}
                  defaultOpen={true}
                  rowProps={rowProps}
                />
                <BrandGroup
                  label="Healthy — no action"
                  variant="ok"
                  listings={healthy}
                  defaultOpen={false}
                  rowProps={rowProps}
                />
                {visible.length === 0 && (
                  <EmptyState title="Nothing here" desc={`All ${brand} listings have been actioned or skipped.`}/>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── View 4: Approvals (Ranjit's pending sends) ───────────────────────
// Each card has three sections:
//   1. Head    — identity + price flow + urgency badge
//   2. Context — AI rec snapshot + Manager's Note snapshot + Ranjit's note
//   3. Footer  — sent meta + reminder/approve/cancel actions
export function ApprovalsView({ approvals, onRemind, onCancel, onMarkApproved, recsById }) {
  if (approvals.length === 0) {
    return <EmptyState title="Nothing pending" desc="No approvals out for review right now. Send a recommendation from any tab to start one."/>;
  }
  return (
    <div>
      {approvals.map(ap => {
        const rec = recsById[ap.id];
        if (!rec) return null;
        const ourPriceAtSend = ap.ourPriceAtSend ?? rec.ourPrice;
        const delta = ap.proposedPrice - ourPriceAtSend;
        const isUrgent = ap.urgency === "urgent";

        return (
          <div className={"approval-card-v2 " + (isUrgent ? "approval-card-v2--urgent" : "")} key={ap.id}>
            {/* ─── Head: identity + price flow + urgency ─── */}
            <div className="approval-card-v2__head">
              <div className="approval-card-v2__ident">
                <BrandAvatar brand={rec.brand} size={32}/>
                <div className="approval-card-v2__ident-text">
                  <div className="approval-card-v2__ident-name">
                    <span>{rec.name}</span>
                    {isUrgent && (
                      <span className="urgency-badge urgency-badge--urgent">
                        <Icon name="flame" size={9}/> Urgent
                      </span>
                    )}
                  </div>
                  <div className="approval-card-v2__ident-sub">
                    <span className="row__sku-small">{rec.sku}</span>
                    <span>·</span>
                    <span>{rec.brand}</span>
                    <span>·</span>
                    <MarketplaceLogo marketplace={rec.marketplace} size={14} withLabel/>
                  </div>
                </div>
              </div>

              <div className="approval-card-v2__price-flow">
                <div className="price-box price-box--neutral">
                  <span className="price-box__label">NOW</span>
                  <span className="price-box__value">{Rs(ourPriceAtSend)}</span>
                </div>
                <Icon name="arrowRight" size={14} color="var(--sx-text-subtle)"/>
                <div className={"price-box " + (delta > 0 ? "price-box--up" : "price-box--down")}>
                  <span className="price-box__label">TARGET</span>
                  <span className="price-box__value">{Rs(ap.proposedPrice)}</span>
                  {delta !== 0 && (
                    <span className={"price-box__delta " + (delta > 0 ? "price-box__delta--up" : "price-box__delta--down")}>
                      {delta > 0 ? "+" : ""}{Rs(delta)} {delta > 0 ? "↑" : "↓"}
                    </span>
                  )}
                </div>
                {ap.resultingMarginPct != null && (
                  <span className="margin-pill">
                    {ap.resultingMarginPct.toFixed(1)}% <span className="margin-pill__sub">margin</span>
                  </span>
                )}
                {rec.floor != null && (
                  <span className="floor-pill" title="Minimum allowed price — the engine will never go below this">
                    <span className="floor-pill__label">FLOOR</span>
                    <span className="floor-pill__value">{Rs(rec.floor)}</span>
                  </span>
                )}
              </div>
            </div>

            {/* ─── Context block: AI rec, manager's note, Ranjit's note ─── */}
            <div className="approval-card-v2__context">
              <div className="ctx-row">
                <div className="ctx-row__icon ctx-row__icon--ai"><Icon name="sparkle" size={11}/></div>
                <div className="ctx-row__body">
                  <div className="ctx-row__label">AI recommendation · snapshot at send time</div>
                  <div className="ctx-row__text">{ap.aiRec || rec.fallbackRec}</div>
                </div>
              </div>
              {(ap.aiNote || rec.fallbackNote) && (
                <div className="ctx-row">
                  <div className="ctx-row__icon ctx-row__icon--note"><Icon name="info" size={11}/></div>
                  <div className="ctx-row__body">
                    <div className="ctx-row__label">Manager&apos;s Note · AI pattern callout</div>
                    <div className="ctx-row__text">{ap.aiNote || rec.fallbackNote}</div>
                  </div>
                </div>
              )}
              <div className="ctx-row">
                <div className="ctx-row__icon ctx-row__icon--user">RK</div>
                <div className="ctx-row__body">
                  <div className="ctx-row__label">Ranjit&apos;s note to approver</div>
                  <div className={"ctx-row__text " + (ap.note ? "ctx-row__text--user" : "ctx-row__text--empty")}>
                    {ap.note ? `"${ap.note}"` : "No note added"}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Footer: sent meta + actions ─── */}
            <div className="approval-card-v2__footer">
              <div className="approval-card-v2__meta">
                <span>Sent to <strong>{ap.approver}</strong></span>
                <span>·</span>
                <span>{ap.sentMinAgo}m ago</span>
                {ap.reminders > 0 && (
                  <>
                    <span>·</span>
                    <span>{ap.reminders} reminder{ap.reminders > 1 ? "s" : ""} {ap.lastReminderChannel ? `(${ap.lastReminderChannel})` : ""}</span>
                  </>
                )}
                {ap.reminders > 0
                  ? <span className="approval-status approval-status--reminded"><span className="dot"></span>Reminded</span>
                  : <span className="approval-status approval-status--pending"><span className="dot"></span>Pending</span>}
              </div>
              <div className="approval-card-v2__actions">
                <button className="btn btn--outlined btn--sm" onClick={() => onRemind(ap.id, "whatsapp")} title="Send WhatsApp reminder">
                  <Icon name="whatsapp" size={12} color="#25D366"/>
                  WhatsApp
                </button>
                <button className="btn btn--outlined btn--sm" onClick={() => onRemind(ap.id, "email")} title="Send email reminder">
                  <Icon name="mail" size={12}/>
                  Email
                </button>
                <button className="btn btn--success btn--sm" onClick={() => onMarkApproved(ap.id)} title="Demo: mark as approved by manager">
                  <Icon name="check" size={12}/>
                  Mark approved
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => onCancel(ap.id)} title="Recall">
                  <Icon name="x" size={12}/>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
