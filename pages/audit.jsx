/* Audit trail — chronological log of every user-initiated action
   (approvals sent, repricings, recalls, reverts, skips, reminders).
   Read directly from the persisted append-only log; not affected by
   the date filter on the triage page. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Topbar, MarketplaceLogo, EmptyState } from "../components/Primitives";
import { Icon, Rs } from "../components/Icon";
import { usePersistedState } from "../lib/usePersistedState";

const TYPE_META = {
  approval_sent:     { label: "Sent for approval",   variant: "info"    },
  approval_recalled: { label: "Recalled approval",   variant: "warn"    },
  reminder_sent:     { label: "Reminder sent",       variant: "info"    },
  repriced:          { label: "Repriced",            variant: "success" },
  reprice_reverted:  { label: "Reprice reverted",    variant: "warn"    },
  skipped:           { label: "Skipped",             variant: "muted"   },
};

const TYPE_OPTIONS = [
  { key: "all", label: "All actions" },
  ...Object.entries(TYPE_META).map(([k, v]) => ({ key: k, label: v.label })),
];

function formatTime(ms) {
  const d = new Date(ms);
  const dateStr = d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  const timeStr = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return { dateStr, timeStr, abs: `${dateStr}, ${timeStr}` };
}

function detailFor(entry) {
  switch (entry.type) {
    case "approval_sent":
      return (
        <>
          <strong>{Rs(entry.ourPrice)}</strong>
          <span className="audit-row__arrow">→</span>
          <strong>{Rs(entry.proposedPrice)}</strong>
          {entry.urgency === "urgent" && <span className="audit-row__chip audit-row__chip--urgent">Urgent</span>}
          <span className="audit-row__muted">to {entry.approver}</span>
        </>
      );
    case "repriced":
      return (
        <>
          <strong>{Rs(entry.prevPrice)}</strong>
          <span className="audit-row__arrow">→</span>
          <strong>{Rs(entry.newPrice)}</strong>
          <span className="audit-row__muted">applied</span>
        </>
      );
    case "reprice_reverted":
      return (
        <>
          <strong>{Rs(entry.prevPrice)}</strong>
          <span className="audit-row__arrow">→</span>
          <strong>{Rs(entry.newPrice)}</strong>
          <span className="audit-row__muted">reverted</span>
        </>
      );
    case "approval_recalled":
      return <span className="audit-row__muted">Request withdrawn</span>;
    case "reminder_sent":
      return <span className="audit-row__muted">via {entry.channel === "whatsapp" ? "WhatsApp" : "email"}</span>;
    case "skipped":
      return (
        <>
          <span className="audit-row__chip">{entry.reason}</span>
          {entry.note && <span className="audit-row__muted">— {entry.note}</span>}
        </>
      );
    default:
      return null;
  }
}

export default function AuditPage() {
  const [auditLog] = usePersistedState("opptra-audit-log", []);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLog.filter(e => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (!q) return true;
      return (
        (e.sku || "").toLowerCase().includes(q) ||
        (e.brand || "").toLowerCase().includes(q) ||
        (e.marketplace || "").toLowerCase().includes(q) ||
        (e.note || "").toLowerCase().includes(q) ||
        (e.reason || "").toLowerCase().includes(q)
      );
    });
  }, [auditLog, typeFilter, search]);

  // Group by date heading for readability
  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      const { dateStr } = formatTime(e.at);
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr).push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(auditLog, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opptra-audit-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <Topbar/>
      <main className="page">
        <div className="page__head">
          <div>
            <h1 className="page__title">Audit trail</h1>
            <div className="page__sub">
              <Link href="/" style={{color: "var(--sx-primary)"}}>← Back to triage</Link>
              <span className="dot-sep"></span>
              <span>{auditLog.length} total actions · {filtered.length} shown</span>
            </div>
          </div>
          <div className="page__head-actions">
            <button className="btn btn--outlined btn--sm" onClick={exportJson} disabled={auditLog.length === 0}>
              <Icon name="download" size={13}/> Export JSON
            </button>
          </div>
        </div>

        <div className="audit-toolbar">
          <input
            type="search"
            placeholder="Search SKU, brand, marketplace, note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="audit-toolbar__search"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="audit-toolbar__select"
          >
            {TYPE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={auditLog.length === 0 ? "No actions logged yet" : "No matches"}
            desc={auditLog.length === 0
              ? "Send an approval, apply a repricing, or skip a listing on the triage page — entries will appear here."
              : "Try a different filter or clear the search."}
          />
        ) : (
          <div className="audit-log">
            {grouped.map(([day, entries]) => (
              <section key={day} className="audit-group">
                <div className="audit-group__head">{day}</div>
                <ul className="audit-group__list">
                  {entries.map((e, i) => {
                    const meta = TYPE_META[e.type] || { label: e.type, variant: "muted" };
                    const { timeStr, abs } = formatTime(e.at);
                    return (
                      <li className="audit-row" key={`${e.at}-${i}`} title={abs}>
                        <span className="audit-row__time">{timeStr}</span>
                        <span className={"audit-row__type audit-row__type--" + meta.variant}>{meta.label}</span>
                        <span className="audit-row__sku">{e.sku || "—"}</span>
                        {e.marketplace && <MarketplaceLogo marketplace={e.marketplace} size={16}/>}
                        <span className="audit-row__detail">{detailFor(e)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
