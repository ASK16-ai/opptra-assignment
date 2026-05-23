/* The four top-level views: Marketplace×SKU, SKU rolled up, Brand
   grouped, Approvals. */

import { useMemo, useState } from "react";
import { Icon, Rs } from "./Icon";
import { ListingRow } from "./ListingRow";
import { EmptyState } from "./Primitives";
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

// ─── View 3: Brand grouped ────────────────────────────────────────────
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

  return (
    <div>
      {brands.map(([brand, listings]) => {
        const recoverCount = listings.filter(r => r.bucket === "recover").length;
        const moveTodayCount = listings.filter(r => r.daysSince === 0).length;
        const portfolioWarn = moveTodayCount >= GUT_RULES.PORTFOLIO_LIMIT;
        return (
          <div className="brand-block" key={brand}>
            <div className="brand-block__head">
              <span className="brand-block__name">{brand}</span>
              <span className="brand-block__count">{listings.length} listings · {recoverCount} need recovery</span>
              {portfolioWarn && (
                <span className="brand-block__warn">
                  <Icon name="alert" size={10}/>
                  {moveTodayCount} moves today — at portfolio limit
                </span>
              )}
            </div>
            <div className="brand-block__body">
              {listings.filter(r => !skippedBySku[r.id]).map(rec => (
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
          </div>
        );
      })}
    </div>
  );
}

// ─── View 4: Approvals (Ranjit's pending sends) ───────────────────────
export function ApprovalsView({ approvals, onRemind, onCancel, onMarkApproved, recsById }) {
  if (approvals.length === 0) {
    return <EmptyState title="Nothing pending" desc="No approvals out for review right now. Send a recommendation from any tab to start one."/>;
  }
  return (
    <div>
      {approvals.map(ap => {
        const rec = recsById[ap.id];
        if (!rec) return null;
        return (
          <div className="approval-card" key={ap.id}>
            <div className="approval-card__id">
              <div className="approval-card__sku-row">
                <span className="row__sku">{rec.sku}</span>
                <span className="row__name" style={{maxWidth: "none"}}>{rec.name}</span>
              </div>
              <div className="row__brand-line">
                {rec.brand} · <span className="marketplace-pill">{rec.marketplace}</span>
              </div>
            </div>
            <div className="approval-card__pricing">
              <span className="muted">From</span>
              <span>{Rs(rec.ourPrice)}</span>
              <span className="arrow"><Icon name="arrowRight" size={14}/></span>
              <span className="muted">To</span>
              <span className="target">{Rs(ap.proposedPrice)}</span>
            </div>
            <div className="approval-card__approver">
              <div><strong>{ap.approver}</strong></div>
              <div className="meta">
                Sent {ap.sentMinAgo}m ago
                {ap.reminders > 0 && <> · {ap.reminders} reminder{ap.reminders > 1 ? "s" : ""}</>}
              </div>
              <div style={{marginTop: 4}}>
                {ap.reminders > 0
                  ? <span className="approval-status approval-status--reminded"><span className="dot"></span>Reminded</span>
                  : <span className="approval-status approval-status--pending"><span className="dot"></span>Pending</span>}
              </div>
            </div>
            <div className="approval-card__actions">
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
              <button className="btn btn--ghost btn--sm" onClick={() => onCancel(ap.id)}>
                <Icon name="x" size={12}/>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
