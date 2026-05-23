/* Opptra Pricing Copilot — main page.
   Renders the full app: topbar, sub-nav (3 tabs + Approvals), stat strip,
   triage views, detail panels, skip modal, upload modal, toasts.

   AI calls are routed to /api/recommend which uses OpenAI GPT-4o when an
   OPENAI_API_KEY is set, else falls back to the deterministic sentence
   the engine already generated. Either way, every card always shows a
   recommendation. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import {
  Topbar, SubNav, StatTile, ToastRegion, SkipReasonModal
} from "../components/Primitives";
import {
  MarketplaceSkuView, SkuView, BrandView, ApprovalsView
} from "../components/Views";
import { UploadModal } from "../components/UploadModal";
import { computeAll, GUT_RULES } from "../lib/heuristics";
import { LISTINGS as DEMO_LISTINGS } from "../lib/data";
import { usePersistedState } from "../lib/usePersistedState";

const TONE_DEFAULT = "friendly";
const APPROVER_DEFAULT = "Priya Iyer (Pricing Mgr)";

// ─── Fetch one recommendation from the API route ─────────────────────
async function fetchAi(rec, tone) {
  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing: rec, tone })
    });
    const data = await res.json();
    return {
      rec: data.rec || rec.fallbackRec,
      note: data.note || rec.fallbackNote || "",
      source: data.source || "fallback"
    };
  } catch (err) {
    console.warn("AI call failed for", rec.id, err);
    return { rec: rec.fallbackRec, note: rec.fallbackNote || "", source: "fallback" };
  }
}

export default function Home() {
  // Data source: either demo (built-in 8 SKUs × marketplaces) or uploaded.
  // We persist the uploaded list to localStorage so a refresh doesn't blow
  // it away — important when demoing an import flow.
  const [uploadedListings, setUploadedListings] = usePersistedState("opptra-uploaded", null);
  const [uploadedFilename, setUploadedFilename] = usePersistedState("opptra-uploaded-name", null);

  const listings = uploadedListings && uploadedListings.length > 0 ? uploadedListings : DEMO_LISTINGS;
  const isUploaded = !!(uploadedListings && uploadedListings.length > 0);

  // Recompute engine outputs whenever data changes
  const recs = useMemo(() => computeAll(listings, GUT_RULES), [listings]);
  const recsById = useMemo(
    () => Object.fromEntries(recs.map(r => [r.id, r])),
    [recs]
  );

  // Active tab — persisted
  const [tab, setTab] = usePersistedState("opptra-tab", "mxsku");

  // Filter (mxsku view only)
  const [filter, setFilter] = useState("all");

  // Which row is expanded — only one at a time across all views
  const [expandedId, setExpandedId] = useState(null);

  // AI state per listing id
  const [aiBySku, setAiBySku] = useState({});
  const [aiLoading, setAiLoading] = useState(true);
  const [aiSource, setAiSource] = useState("loading");

  // Persisted action state
  const [approvalsBySku, setApprovalsBySku] = usePersistedState("opptra-approvals", {});
  const [appliedBySku, setAppliedBySku] = usePersistedState("opptra-applied", {});
  const [skippedBySku, setSkippedBySku] = usePersistedState("opptra-skipped", {});

  const [skipTarget, setSkipTarget] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback((msg, opts = {}) => {
    const id = ++toastIdRef.current;
    setToasts(ts => [...ts, { id, msg, ...opts }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), opts.duration || 5000);
    return id;
  }, []);
  const dismissToast = useCallback((id) => setToasts(ts => ts.filter(t => t.id !== id)), []);

  // ─── AI fetch orchestrator ─────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setAiLoading(true);
    setAiBySku({});
    let anyAi = false;
    await Promise.all(recs.map(async (r) => {
      const out = await fetchAi(r, TONE_DEFAULT);
      if (out.source === "ai") anyAi = true;
      setAiBySku(prev => ({ ...prev, [r.id]: out }));
    }));
    setAiLoading(false);
    setAiSource(anyAi ? "ai" : "fallback");
  }, [recs]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Tick approval clocks ──────────────────────────────────────────
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setNowTick(n => n + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const approvalsList = useMemo(() => {
    return Object.entries(approvalsBySku).map(([id, ap]) => ({
      id,
      ...ap,
      sentMinAgo: Math.max(1, Math.floor((Date.now() - ap.sentAt) / 60000))
    }));
    // nowTick included to refresh every 30s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalsBySku, nowTick]);

  // ─── Handlers ───────────────────────────────────────────────────────
  const onSendForApproval = useCallback((rec, price) => {
    setApprovalsBySku(prev => ({
      ...prev,
      [rec.id]: {
        proposedPrice: price,
        approver: APPROVER_DEFAULT,
        sentAt: Date.now(),
        reminders: 0
      }
    }));
    pushToast(`Sent ${rec.sku} (${rec.marketplace}) to ${APPROVER_DEFAULT} for approval at Rs.${Number(price).toLocaleString("en-IN")}.`);
  }, [pushToast, setApprovalsBySku]);

  const onRemind = useCallback((id, channel) => {
    setApprovalsBySku(prev => {
      const ap = prev[id];
      if (!ap) return prev;
      return { ...prev, [id]: { ...ap, reminders: (ap.reminders || 0) + 1, lastReminderChannel: channel } };
    });
    const rec = recsById[id];
    pushToast(`Reminder sent via ${channel === "whatsapp" ? "WhatsApp" : "email"} to ${APPROVER_DEFAULT} for ${rec?.sku}.`);
  }, [recsById, pushToast, setApprovalsBySku]);

  const onCancelApproval = useCallback((id) => {
    const rec = recsById[id];
    setApprovalsBySku(prev => {
      const next = { ...prev }; delete next[id]; return next;
    });
    pushToast(`Recalled ${rec?.sku} approval request.`);
  }, [recsById, pushToast, setApprovalsBySku]);

  const onMarkApproved = useCallback((id) => {
    const rec = recsById[id];
    const ap = approvalsBySku[id];
    if (!ap) return;
    setAppliedBySku(prev => ({ ...prev, [id]: { newPrice: ap.proposedPrice, prevPrice: rec.ourPrice, at: Date.now() } }));
    setApprovalsBySku(prev => { const n = { ...prev }; delete n[id]; return n; });
    pushToast(`${rec?.sku} approved & repriced to Rs.${Number(ap.proposedPrice).toLocaleString("en-IN")} on ${rec?.marketplace}.`);
  }, [approvalsBySku, recsById, pushToast, setApprovalsBySku, setAppliedBySku]);

  const onUndoApply = useCallback((id) => {
    const rec = recsById[id];
    setAppliedBySku(prev => { const n = { ...prev }; delete n[id]; return n; });
    pushToast(`${rec?.sku} change reverted.`);
  }, [recsById, pushToast, setAppliedBySku]);

  const onOpenSkip = useCallback((id) => setSkipTarget(id), []);
  const onSubmitSkip = useCallback(({ reason, note }) => {
    if (!skipTarget) return;
    const rec = recsById[skipTarget];
    setSkippedBySku(prev => ({ ...prev, [skipTarget]: { reason, note, at: Date.now() } }));
    setSkipTarget(null);
    console.info("[opptra] skip reason logged", { id: skipTarget, reason, note });
    pushToast(`${rec?.sku} skipped — logged "${reason}" for heuristic library.`);
  }, [skipTarget, recsById, pushToast, setSkippedBySku]);

  // ─── Upload handling ───────────────────────────────────────────────
  const onUploadLoaded = useCallback((newListings, filename) => {
    setUploadedListings(newListings);
    setUploadedFilename(filename);
    setUploadOpen(false);
    // Clear stale action state so applied/skipped from a previous dataset
    // doesn't leak into the new one.
    setApprovalsBySku({});
    setAppliedBySku({});
    setSkippedBySku({});
    pushToast(`Imported ${newListings.length} listings from ${filename}.`);
  }, [pushToast, setApprovalsBySku, setAppliedBySku, setSkippedBySku, setUploadedFilename, setUploadedListings]);

  const onResetDemo = useCallback(() => {
    setUploadedListings(null);
    setUploadedFilename(null);
    setApprovalsBySku({});
    setAppliedBySku({});
    setSkippedBySku({});
    setUploadOpen(false);
    pushToast("Reverted to demo data (8 SKUs from the case study).");
  }, [pushToast, setApprovalsBySku, setAppliedBySku, setSkippedBySku, setUploadedFilename, setUploadedListings]);

  // ─── Counts for tab badges + stat strip ────────────────────────────
  const counts = useMemo(() => {
    const recover = recs.filter(r => r.bucket === "recover" && !appliedBySku[r.id] && !skippedBySku[r.id] && !approvalsBySku[r.id]).length;
    const raise = recs.filter(r => r.bucket === "raise" && !appliedBySku[r.id] && !skippedBySku[r.id] && !approvalsBySku[r.id]).length;
    const blocked = recs.filter(r => r.bucket === "blocked").length;
    const pending = Object.keys(approvalsBySku).length;
    const applied = Object.keys(appliedBySku).length;
    return { recover, raise, blocked, pending, applied, total: recs.length };
  }, [recs, approvalsBySku, appliedBySku, skippedBySku]);

  // ─── Tabs spec ──────────────────────────────────────────────────────
  const tabs = [
    { key: "mxsku", label: "Marketplace × SKU", icon: "grid", count: counts.recover + counts.raise + counts.blocked },
    { key: "sku",   label: "SKU view", icon: "package", count: new Set(recs.map(r => r.sku)).size },
    { key: "brand", label: "Brand view", icon: "layers", count: new Set(recs.map(r => r.brand)).size },
    { key: "approvals", label: "Approvals", icon: "inbox", count: counts.pending }
  ];

  const tabMeta = (() => {
    if (tab === "approvals") return <>Pending sends → <strong>{APPROVER_DEFAULT}</strong></>;
    return (
      <>
        Snapshot 9:04 AM IST · <button style={{color: "var(--sx-primary)", background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 500, cursor: "pointer"}} onClick={fetchAll}>Re-run AI</button>
      </>
    );
  })();

  return (
    <div className="app">
      <Topbar pendingCount={counts.pending}/>
      <SubNav tabs={tabs} active={tab} onChange={setTab} meta={tabMeta}/>

      <main className="page">
        {tab !== "approvals" && (
          <>
            <div className="page__head">
              <div>
                <h1 className="page__title">Today&apos;s Pricing Triage</h1>
                <div className="page__sub">
                  <span>{recs.length} listings across {new Set(recs.map(r => r.marketplace)).size} marketplaces</span>
                  <span className="dot-sep"></span>
                  <span>{counts.recover} need recovery · {counts.raise} can raise · {counts.blocked} blocked</span>
                  <span className="dot-sep"></span>
                  <span className={"data-source-chip " + (isUploaded ? "data-source-chip--uploaded" : "")}>
                    <Icon name="download" size={11}/>
                    {isUploaded ? <>From <strong>{uploadedFilename || "uploaded file"}</strong></> : <>Demo dataset</>}
                  </span>
                </div>
              </div>
              <div className="page__head-actions">
                <button className="btn btn--outlined btn--sm" onClick={() => setUploadOpen(true)}>
                  <Icon name="download" size={13}/> Import data
                </button>
                <button className="btn btn--outlined btn--sm" onClick={fetchAll}>
                  <Icon name="refresh" size={13}/> Refresh
                </button>
              </div>
            </div>

            <AiStrip status={aiLoading ? "loading" : aiSource} totalRecs={counts.recover + counts.raise + counts.blocked}/>

            <div className="stat-strip">
              <StatTile label="Buy Box Lost" value={counts.recover} sub="Need recovery" variant="alert"/>
              <StatTile label="Headroom" value={counts.raise} sub="Can raise price" variant="good"/>
              <StatTile label="Floor-Blocked" value={counts.blocked} sub="Floor review needed" variant="blocked"/>
              <StatTile label="Pending Approval" value={counts.pending} sub={counts.pending ? "Awaiting pricing mgr" : "None sent yet"} variant="pending"/>
              <StatTile label="Repriced Today" value={counts.applied} sub={counts.applied ? "Pushed to marketplaces" : "—"} variant="good"/>
            </div>

            {tab === "mxsku" && (
              <FilterBar filter={filter} setFilter={setFilter} counts={counts} recs={recs}/>
            )}
          </>
        )}

        {tab === "approvals" && (
          <div className="page__head">
            <div>
              <h1 className="page__title">Pending approvals</h1>
              <div className="page__sub">
                <span>Sent to <strong style={{color: "var(--sx-text-primary)"}}>{APPROVER_DEFAULT}</strong></span>
                <span className="dot-sep"></span>
                <span>{approvalsList.length} awaiting · {approvalsList.filter(a => a.reminders > 0).length} reminded</span>
              </div>
            </div>
          </div>
        )}

        {tab === "mxsku" && (
          <MarketplaceSkuView
            recs={recs}
            aiBySku={aiBySku} aiLoading={aiLoading}
            approvalsBySku={approvalsBySku}
            appliedBySku={appliedBySku}
            skippedBySku={skippedBySku}
            expandedId={expandedId} setExpandedId={setExpandedId}
            filter={filter}
            onSendForApproval={onSendForApproval}
            onSkip={onOpenSkip}
            onUndoApply={onUndoApply}
          />
        )}
        {tab === "sku" && (
          <SkuView
            recs={recs}
            aiBySku={aiBySku} aiLoading={aiLoading}
            approvalsBySku={approvalsBySku}
            appliedBySku={appliedBySku}
            skippedBySku={skippedBySku}
            expandedId={expandedId} setExpandedId={setExpandedId}
            onSendForApproval={onSendForApproval}
            onSkip={onOpenSkip}
            onUndoApply={onUndoApply}
          />
        )}
        {tab === "brand" && (
          <BrandView
            recs={recs}
            aiBySku={aiBySku} aiLoading={aiLoading}
            approvalsBySku={approvalsBySku}
            appliedBySku={appliedBySku}
            skippedBySku={skippedBySku}
            expandedId={expandedId} setExpandedId={setExpandedId}
            onSendForApproval={onSendForApproval}
            onSkip={onOpenSkip}
            onUndoApply={onUndoApply}
          />
        )}
        {tab === "approvals" && (
          <ApprovalsView
            approvals={approvalsList}
            recsById={recsById}
            onRemind={onRemind}
            onCancel={onCancelApproval}
            onMarkApproved={onMarkApproved}
          />
        )}
      </main>

      <ToastRegion toasts={toasts} dismissToast={dismissToast}/>
      <SkipReasonModal
        rec={skipTarget ? recsById[skipTarget] : null}
        onCancel={() => setSkipTarget(null)}
        onSubmit={onSubmitSkip}
      />
      <UploadModal
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        onLoaded={onUploadLoaded}
        onResetDemo={onResetDemo}
      />
    </div>
  );
}

// ─── AI strip ────────────────────────────────────────────────────────
function AiStrip({ status, totalRecs }) {
  let msg;
  if (status === "loading") msg = `Reasoning over ${totalRecs} listings…`;
  else if (status === "fallback") msg = `Recommendations generated from deterministic rules (add OPENAI_API_KEY to .env.local for GPT-4o-backed Manager's Notes).`;
  else msg = `Recommendations generated by GPT-4o — each constrained by margin floor + cushion. Manager's Notes catch the pattern stuff rules can't.`;

  return (
    <div className="ai-strip">
      <div className="ai-strip__icon"><Icon name="sparkle" size={14}/></div>
      <div className="ai-strip__body">
        <div className="ai-strip__title">Opptra AI · Pricing Copilot</div>
        <div className="ai-strip__text">{msg}</div>
      </div>
      {status === "loading"
        ? <span className="ai-strip__live"><span className="dot"></span>Thinking</span>
        : <span className="ai-strip__live"><span className="dot"></span>{status === "ai" ? "Live" : "Fallback"}</span>}
    </div>
  );
}

// ─── Filter bar ──────────────────────────────────────────────────────
function FilterBar({ filter, setFilter, counts, recs }) {
  const total = recs.length;
  return (
    <div className="filter-bar">
      <FilterChip active={filter === "all"} onClick={() => setFilter("all")} count={total}>All</FilterChip>
      <FilterChip active={filter === "needs"} onClick={() => setFilter("needs")} count={counts.recover + counts.raise}>Needs decision</FilterChip>
      <FilterChip active={filter === "recover"} onClick={() => setFilter("recover")} count={counts.recover}>Recover</FilterChip>
      <FilterChip active={filter === "raise"} onClick={() => setFilter("raise")} count={counts.raise}>Raise</FilterChip>
      <FilterChip active={filter === "blocked"} onClick={() => setFilter("blocked")} count={counts.blocked}>Blocked</FilterChip>
      <FilterChip active={filter === "pending"} onClick={() => setFilter("pending")} count={counts.pending}>Pending</FilterChip>
      <span className="filter-bar__sort">
        <Icon name="filter" size={11}/> Sorted by bucket · stale · margin impact
      </span>
    </div>
  );
}
function FilterChip({ active, onClick, count, children }) {
  return (
    <button className={"filter-chip " + (active ? "filter-chip--active" : "")} onClick={onClick}>
      {children}
      <span className="filter-chip__count">{count}</span>
    </button>
  );
}
