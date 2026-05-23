/* The compact ListingRow + DetailPanel (expand-in-place).
   Mirrors design/random/project/views.jsx with the layout intact. */

import { useEffect, useState } from "react";
import { Icon, Rs } from "./Icon";
import {
  Sparkline, FlagChip, ConfidenceBadge,
  CompRow, RuleItem, ManagerNote, MiniStats
} from "./Primitives";
import { GUT_RULES } from "../lib/heuristics";

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
      <div className="row__spark">
        <Sparkline history={rec.history30d} mode="row-bg"/>
      </div>

      <div className="row__head" onClick={onExpand}>
        <div className="row__ident">
          <div className="row__ident-text">
            <div className="row__sku-line">
              <span className="row__sku">{rec.sku}</span>
              <span className="row__name" title={rec.name}>{rec.name}</span>
            </div>
            <div className="row__brand-line">
              <span>{rec.brand}</span>
              <span>·</span>
              <span className="marketplace-pill">{rec.marketplace}</span>
            </div>
          </div>
        </div>

        <div className="row__status">
          {rec.buyBox === "Lost"
            ? <span className="row__status-chip status-lost"><span className="dot"></span>Buy Box Lost</span>
            : <span className="row__status-chip status-won"><span className="dot"></span>Buy Box Won</span>}
          <span className={"row__stale " + (rec.daysSince >= 5 ? "row__stale--warn" : "")}>
            <Icon name="clock" size={10}/> {rec.daysSince === 0 ? "moved today" : `${rec.daysSince}d since change`}
          </span>
          {rec.patterns.length > 0 && (
            <div className="row__flags">
              {rec.patterns.slice(0, 2).map(p => <FlagChip pattern={p} key={p.key}/>)}
            </div>
          )}
        </div>

        <div className="row__pricing">
          <div>
            <div className="row__pricing-current">{Rs(rec.ourPrice)}</div>
            <div className="row__pricing-delta">
              {rec.gapInr < 0
                ? <span className="down">↓ {Rs(Math.abs(rec.gapInr))} vs {rec.topCompetitor.name.split(" ")[0]}</span>
                : <span className="up">↑ {Rs(rec.gapInr)} vs {rec.topCompetitor.name.split(" ")[0]}</span>}
            </div>
          </div>
          <span className="row__pricing-arrow"><Icon name="arrowRight" size={16}/></span>
          {isBlocked ? (
            <span className="row__pricing-rec row__pricing-rec--blocked">HOLD · floor block</span>
          ) : isHold ? (
            <span className="row__pricing-rec row__pricing-rec--blocked" style={{background: "var(--sx-neutral-bg)", color: "var(--sx-neutral-fg)", borderColor: "var(--sx-border-light)"}}>HOLD</span>
          ) : (
            <div>
              <div className={"row__pricing-rec " + (recVariant === "raise" ? "row__pricing-rec--raise" : "")}>{Rs(rec.recommended)}</div>
              <div className="row__pricing-delta">
                {rec.bucket === "recover"
                  ? <><span className="down">−{Rs(rec.ourPrice - rec.recommended)}</span> · {rec.resultingMarginPct.toFixed(1)}% margin</>
                  : <><span className="up">+{Rs(rec.recommended - rec.ourPrice)}</span> · {rec.resultingMarginPct.toFixed(1)}% margin</>}
              </div>
            </div>
          )}
        </div>

        <div className={"row__rec " + (aiLoading ? "row__rec--loading" : "")}>
          {aiLoading
            ? <span className="row__rec-shimmer"></span>
            : aiText}
        </div>

        <div className="row__right" onClick={(e) => e.stopPropagation()}>
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
        <div className="chart-card">
          <div className="chart-card__head">
            <span className="chart-card__title">Last 30 days · {rec.sku} @ {rec.marketplace}</span>
            <div className="chart-card__legend">
              <span className="chart-card__legend-item">
                <span className="swatch" style={{background: "var(--sx-primary)"}}></span>Our price
              </span>
              <span className="chart-card__legend-item">
                <span className="swatch" style={{background: "var(--sx-text-muted)", height: 0, borderTop: "2px dashed var(--sx-text-muted)"}}></span>Competitor median
              </span>
            </div>
          </div>
          <Sparkline history={rec.history30d} mode="card"/>
        </div>

        <div className="detail__panel">
          <div className="detail__title">Competitor stack — click to expand</div>
          <div className="comp-stack">
            <CompRow isOurs comp={{ buyBoxShare: rec.buyBox === "Won" ? 60 : 8 }} ourPrice={rec.ourPrice}/>
            {rec.competitors.map((c) => (
              <CompRow key={c.name} comp={c} isLeader={c.isLeader} ourPrice={rec.ourPrice}/>
            ))}
          </div>
        </div>

        <MiniStats rec={rec}/>
      </div>

      <div className="detail__col">
        <ManagerNote note={aiNote} loading={aiLoading}/>

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
          <div style={{marginTop: 10, fontSize: 11, color: "var(--sx-text-muted)"}}>
            Sum of weights → confidence <strong>{rec.confidence}</strong> ({(rec.confidenceScore * 100).toFixed(0)}/100)
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
