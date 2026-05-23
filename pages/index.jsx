/* Opptra Pricing Copilot — main page.
   Renders the full app: topbar, sub-nav (3 tabs + Approvals), stat strip,
   triage views, detail panels, skip modal, upload modal, toasts.

   AI calls are routed to /api/recommend which uses OpenAI GPT-4o when an
   OPENAI_API_KEY is set, else falls back to the deterministic sentence
   the engine already generated. Either way, every card always shows a
   recommendation. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../components/Icon";
import {
  Topbar, SubNav, StatTile, ToastRegion, SkipReasonModal, SendApprovalModal
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

// ─── Date helpers for the From/To listing filter ──────────────────
const toISODate = (d) => {
  const x = new Date(d);
  const off = x.getTimezoneOffset() * 60000;
  return new Date(x.getTime() - off).toISOString().slice(0, 10);
};
const todayISO = () => toISODate(Date.now());
const daysAgoISO = (n) => toISODate(Date.now() - n * 86400000);

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
      reasoning_steps: Array.isArray(data.reasoning_steps) && data.reasoning_steps.length
        ? data.reasoning_steps
        : (rec.fallbackReasoningSteps || []),
      forecast: data.forecast || rec.forecast || null,
      source: data.source || "fallback"
    };
  } catch (err) {
    console.warn("AI call failed for", rec.id, err);
    return {
      rec: rec.fallbackRec,
      reasoning_steps: rec.fallbackReasoningSteps || [],
      forecast: rec.forecast || null,
      source: "fallback"
    };
  }
}

export default function Home() {
  // Data source: either demo (built-in 8 SKUs × marketplaces) or uploaded.
  // We persist the uploaded list to localStorage so a refresh doesn't blow
  // it away — important when demoing an import flow. We also expose the
  // hydration flag so the page can gate rendering until localStorage has
  // loaded — otherwise SSR paints the demo data, then hydration flips it
  // to the uploaded data, producing a visible "1 listing → 10 listings"
  // flicker every reload.
  const [uploadedListings, setUploadedListings, uploadedHydrated] = usePersistedState("opptra-uploaded", null);
  const [uploadedFilename, setUploadedFilename] = usePersistedState("opptra-uploaded-name", null);

  // Sanitize uploads on read. Two cases to handle:
  //   1. Cached uploads from older builds — these had fabricated competitor
  //      names (HomeKraft / F-PrimeHome / etc.) plus invented buyBoxShare
  //      and last-move data. Only the leader's price was real, so we
  //      collapse to that single entry.
  //   2. New multi-competitor uploads — every entry carries a real price
  //      from a CSV row. Keep them all, sort by price ascending so the
  //      leader (price-to-beat) is first, and number them generically.
  const sanitizedUploaded = useMemo(() => {
    if (!Array.isArray(uploadedListings)) return null;
    return uploadedListings.map(l => {
      const cs = l.competitors || [];
      const hasFakeFields = cs.some(c => c.buyBoxShare != null || c.lastMoveDirection != null);
      let kept;
      if (hasFakeFields) {
        const leader = cs.find(c => c.isLeader) || cs[0];
        kept = leader ? [{ name: "Competitor", price: leader.price, isLeader: true }] : [];
      } else {
        const sorted = [...cs]
          .filter(c => Number.isFinite(c?.price))
          .sort((a, b) => a.price - b.price);
        kept = sorted.map((c, i) => ({
          // Preserve the real competitor_name from the upload when present;
          // fall back to a generic "Competitor N" label only when missing.
          name: c.name || (sorted.length > 1 ? `Competitor ${i + 1}` : "Competitor"),
          price: c.price,
          isLeader: i === 0
        }));
      }
      return {
        ...l,
        competitors: kept,
        topCompetitor: kept[0],
        history30d: []
      };
    });
  }, [uploadedListings]);
  const allListings = sanitizedUploaded && sanitizedUploaded.length > 0 ? sanitizedUploaded : DEMO_LISTINGS;
  const isUploaded = !!(sanitizedUploaded && sanitizedUploaded.length > 0);

  // Listing-creation date filter — absolute From / To, ISO yyyy-mm-dd.
  // Default = no bound (show everything). The case-study demo data spreads
  // listings over the past ~2 years; a narrow default would hide most of
  // it on first load. Users can narrow the window manually for ops work,
  // and the "Last 7d" button is a one-tap shortcut to the fresh-only view.
  const [dateFrom, setDateFrom] = usePersistedState("opptra-date-from", null);
  const [dateTo, setDateTo] = usePersistedState("opptra-date-to", null);

  // Apply date filter to the source listings before computing recs.
  // Listings without a listedAt timestamp are excluded from a date-bounded
  // view (we can't place them on the timeline).
  const listings = useMemo(() => {
    const fromMs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : -Infinity;
    const toMs = dateTo ? new Date(dateTo + "T23:59:59.999").getTime() : Infinity;
    if (!dateFrom && !dateTo) return allListings;
    return allListings.filter(l => {
      if (l.listedAt == null) return false;
      return l.listedAt >= fromMs && l.listedAt <= toMs;
    });
  }, [allListings, dateFrom, dateTo]);

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

  // AI state per listing id — persisted to localStorage so a page reload
  // does NOT re-fire every /api/recommend call. Entries are invalidated
  // only when a new upload replaces the dataset (see onUploadLoaded) or
  // the user explicitly hits "Re-run AI".
  const [aiBySku, setAiBySku, aiCacheHydrated] = usePersistedState("opptra-ai-cache", {});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSource, setAiSource] = useState("loading");

  // Persisted action state
  const [approvalsBySku, setApprovalsBySku] = usePersistedState("opptra-approvals", {});
  const [appliedBySku, setAppliedBySku] = usePersistedState("opptra-applied", {});
  const [skippedBySku, setSkippedBySku] = usePersistedState("opptra-skipped", {});

  // Append-only audit trail. Every user-initiated mutation appends an
  // entry; the /audit page reads this directly. Filter-independent —
  // entries persist regardless of the active date window above.
  // We only need the setter here; the list itself is consumed on /audit.
  const [, setAuditLog] = usePersistedState("opptra-audit-log", []);
  const appendAudit = useCallback((entry) => {
    setAuditLog(prev => [{ at: Date.now(), ...entry }, ...prev]);
  }, [setAuditLog]);

  const [skipTarget, setSkipTarget] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState(null); // { rec, price } | null

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
  // Two paths:
  //   fetchMissing — called automatically; only hits the API for listings
  //                  that aren't already in the persisted cache.
  //   fetchAll     — called by the "Re-run AI" button; wipes the cache
  //                  for the current rec set and re-fetches everything.
  const fetchFor = useCallback(async (toFetch) => {
    if (toFetch.length === 0) return;
    setAiLoading(true);
    let anyAi = false;
    await Promise.all(toFetch.map(async (r) => {
      const out = await fetchAi(r, TONE_DEFAULT);
      if (out.source === "ai") anyAi = true;
      setAiBySku(prev => ({ ...prev, [r.id]: out }));
    }));
    setAiLoading(false);
    setAiSource(anyAi ? "ai" : "fallback");
  }, [setAiBySku]);

  const fetchAll = useCallback(async () => {
    // Wipe just the entries for the current rec set, then refetch.
    setAiBySku(prev => {
      const next = { ...prev };
      recs.forEach(r => { delete next[r.id]; });
      return next;
    });
    await fetchFor(recs);
  }, [recs, fetchFor, setAiBySku]);

  // Fire only for listings that aren't cached yet — and only after the
  // persisted cache has hydrated from localStorage (otherwise the first
  // render would see an empty {} and refetch everything).
  useEffect(() => {
    if (!aiCacheHydrated) return;
    const missing = recs.filter(r => !aiBySku[r.id]);
    if (missing.length === 0) {
      // Already-cached — mark source from any existing entry for the badge.
      const sample = recs.map(r => aiBySku[r.id]).find(Boolean);
      if (sample) setAiSource(sample.source === "ai" ? "ai" : "fallback");
      return;
    }
    fetchFor(missing);
    // intentionally not depending on aiBySku — we read it once per recs change
    // and let fetchFor write incrementally. Re-running this effect on every
    // cache write would cause cascading refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, aiCacheHydrated, fetchFor]);

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
  // Clicking "Send for approval" on a row opens the modal first so Ranjit
  // can add a note + urgency; the actual mutation happens in onConfirmSend.
  const onSendForApproval = useCallback((rec, price) => {
    setSendTarget({ rec, price });
  }, []);

  const onConfirmSend = useCallback(({ note, urgency, aiRec }) => {
    if (!sendTarget) return;
    const { rec, price } = sendTarget;
    setApprovalsBySku(prev => ({
      ...prev,
      [rec.id]: {
        proposedPrice: price,
        approver: APPROVER_DEFAULT,
        sentAt: Date.now(),
        reminders: 0,
        // Snapshotted context — frozen at the moment of sending so
        // the approval card always shows what Ranjit actually saw.
        note,
        urgency,
        aiRec,
        bucket: rec.bucket,
        ourPriceAtSend: rec.ourPrice,
        marginSacrificeInr: rec.marginSacrificeInr,
        marginGainInr: rec.marginGainInr,
        resultingMarginPct: rec.resultingMarginPct
      }
    }));
    appendAudit({
      type: "approval_sent",
      id: rec.id, sku: rec.sku, brand: rec.brand, marketplace: rec.marketplace,
      ourPrice: rec.ourPrice, proposedPrice: price,
      approver: APPROVER_DEFAULT, urgency, note
    });
    setSendTarget(null);
    pushToast(
      `Sent ${rec.sku} to ${APPROVER_DEFAULT}${urgency === "urgent" ? " (URGENT)" : ""} at Rs.${Number(price).toLocaleString("en-IN")}.`
    );
  }, [sendTarget, pushToast, setApprovalsBySku, appendAudit]);

  const onRemind = useCallback((id, channel) => {
    setApprovalsBySku(prev => {
      const ap = prev[id];
      if (!ap) return prev;
      return { ...prev, [id]: { ...ap, reminders: (ap.reminders || 0) + 1, lastReminderChannel: channel } };
    });
    const rec = recsById[id];
    appendAudit({
      type: "reminder_sent",
      id, sku: rec?.sku, marketplace: rec?.marketplace,
      channel, approver: APPROVER_DEFAULT
    });
    pushToast(`Reminder sent via ${channel === "whatsapp" ? "WhatsApp" : "email"} to ${APPROVER_DEFAULT} for ${rec?.sku}.`);
  }, [recsById, pushToast, setApprovalsBySku, appendAudit]);

  const onCancelApproval = useCallback((id) => {
    const rec = recsById[id];
    setApprovalsBySku(prev => {
      const next = { ...prev }; delete next[id]; return next;
    });
    appendAudit({
      type: "approval_recalled",
      id, sku: rec?.sku, marketplace: rec?.marketplace
    });
    pushToast(`Recalled ${rec?.sku} approval request.`);
  }, [recsById, pushToast, setApprovalsBySku, appendAudit]);

  const onMarkApproved = useCallback((id) => {
    const rec = recsById[id];
    const ap = approvalsBySku[id];
    if (!ap) return;
    setAppliedBySku(prev => ({ ...prev, [id]: { newPrice: ap.proposedPrice, prevPrice: rec.ourPrice, at: Date.now() } }));
    setApprovalsBySku(prev => { const n = { ...prev }; delete n[id]; return n; });
    appendAudit({
      type: "repriced",
      id, sku: rec?.sku, brand: rec?.brand, marketplace: rec?.marketplace,
      prevPrice: rec?.ourPrice, newPrice: ap.proposedPrice
    });
    pushToast(`${rec?.sku} approved & repriced to Rs.${Number(ap.proposedPrice).toLocaleString("en-IN")} on ${rec?.marketplace}.`);
  }, [approvalsBySku, recsById, pushToast, setApprovalsBySku, setAppliedBySku, appendAudit]);

  const onUndoApply = useCallback((id) => {
    const rec = recsById[id];
    const ap = appliedBySku[id];
    setAppliedBySku(prev => { const n = { ...prev }; delete n[id]; return n; });
    appendAudit({
      type: "reprice_reverted",
      id, sku: rec?.sku, marketplace: rec?.marketplace,
      prevPrice: ap?.newPrice, newPrice: ap?.prevPrice
    });
    pushToast(`${rec?.sku} change reverted.`);
  }, [recsById, pushToast, setAppliedBySku, appendAudit, appliedBySku]);

  const onOpenSkip = useCallback((id) => setSkipTarget(id), []);
  const onSubmitSkip = useCallback(({ reason, note }) => {
    if (!skipTarget) return;
    const rec = recsById[skipTarget];
    setSkippedBySku(prev => ({ ...prev, [skipTarget]: { reason, note, at: Date.now() } }));
    appendAudit({
      type: "skipped",
      id: skipTarget, sku: rec?.sku, marketplace: rec?.marketplace,
      reason, note
    });
    setSkipTarget(null);
    console.info("[opptra] skip reason logged", { id: skipTarget, reason, note });
    pushToast(`${rec?.sku} skipped — logged "${reason}" for heuristic library.`);
  }, [skipTarget, recsById, pushToast, setSkippedBySku, appendAudit]);

  // ─── Upload handling ───────────────────────────────────────────────
  const onUploadLoaded = useCallback((newListings, filename) => {
    setUploadedListings(newListings);
    setUploadedFilename(filename);
    setUploadOpen(false);
    // Clear stale action + AI cache state so applied/skipped/AI-text from
    // a previous dataset doesn't leak into the new one.
    setApprovalsBySku({});
    setAppliedBySku({});
    setSkippedBySku({});
    setAiBySku({});
    pushToast(`Imported ${newListings.length} listings from ${filename}.`);
  }, [pushToast, setApprovalsBySku, setAppliedBySku, setSkippedBySku, setAiBySku, setUploadedFilename, setUploadedListings]);

  const onResetDemo = useCallback(() => {
    setUploadedListings(null);
    setUploadedFilename(null);
    setApprovalsBySku({});
    setAppliedBySku({});
    setSkippedBySku({});
    setAiBySku({});
    setUploadOpen(false);
    pushToast("Reverted to demo data (8 SKUs from the case study).");
  }, [pushToast, setApprovalsBySku, setAppliedBySku, setSkippedBySku, setAiBySku, setUploadedFilename, setUploadedListings]);

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

  // Until localStorage has loaded, paint a neutral shell. Without this,
  // the server renders the demo dataset, the client hydrates to the
  // uploaded dataset, and the user sees the row count flip ("Oak Cutting
  // Board" → 10 listings) on every visit.
  if (!uploadedHydrated) {
    return (
      <div className="app">
        <Topbar/>
        <main className="page">
          <div className="page__head">
            <div>
              <h1 className="page__title">Today&apos;s Pricing Triage</h1>
              <div className="page__sub">
                <span>Loading your data…</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Topbar/>
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
                <div className="date-range-filter" title="Filter listings by creation date">
                  <span className="date-range-filter__label">Listed</span>
                  <input
                    type="date"
                    aria-label="From date"
                    value={dateFrom || ""}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value || null)}
                  />
                  <span className="date-range-filter__sep">→</span>
                  <input
                    type="date"
                    aria-label="To date"
                    value={dateTo || ""}
                    min={dateFrom || undefined}
                    max={todayISO()}
                    onChange={(e) => setDateTo(e.target.value || null)}
                  />
                  <button
                    type="button"
                    className="date-range-filter__reset"
                    onClick={() => { setDateFrom(daysAgoISO(7)); setDateTo(todayISO()); }}
                    title="Reset to last 7 days"
                  >
                    Last 7d
                  </button>
                </div>
                <Link href="/import" className="btn btn--primary btn--lg">
                  <Icon name="download" size={15}/> Import data
                </Link>
              </div>
            </div>


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
      <SendApprovalModal
        target={sendTarget}
        aiData={sendTarget ? aiBySku[sendTarget.rec.id] : null}
        approver={APPROVER_DEFAULT}
        onCancel={() => setSendTarget(null)}
        onSubmit={onConfirmSend}
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
