# Opptra Pricing Copilot

AI-powered triage tool for the Opptra Category Operations team. Surfaces which SKUs need a price move *right now*, generates a margin-floor-constrained recommendation with a manager's note, and routes everything through a one-click approval workflow.

Built for the **Opptra Central Tech — AI Product Engineer Case Study**.

---

## Run it locally

```bash
cd opptra
npm install
cp .env.local.example .env.local         # paste your OPENAI_API_KEY
npm run dev
# open http://localhost:3000
```

That's it. Without an API key the app still runs — every card falls back to a deterministic recommendation sentence written by the rules engine. With a key, recommendations and the **Manager's Note** come from `gpt-4o-mini`.

---

## Key files

```
opptra/
├── lib/
│   ├── data.js              # 8 SKUs × marketplaces + synthesized competitor stacks & 30-day price history
│   ├── heuristics.js        # GUT_RULES, pattern detection, rule weights, confidence scoring, AI prompt builder
│   ├── csv.js               # CSV/XLSX template generation + upload ingest
│   └── usePersistedState.js # localStorage-backed useState
├── pages/
│   ├── api/recommend.js     # OpenAI route — hybrid contract, JSON mode, floor guardrail, fallback
│   ├── _app.jsx             # Global CSS imports
│   └── index.jsx            # Main app: 3 triage tabs + Approvals page + upload modal + state machine
├── components/
│   ├── Icon.jsx             # Inline SVG icon set + Rs() formatter
│   ├── Primitives.jsx       # Topbar, SubNav, StatTile, Sparkline, FlagChip, CompRow, ManagerNote, etc.
│   ├── ListingRow.jsx       # Compact row + DetailPanel (expand-in-place)
│   ├── Views.jsx            # MarketplaceSkuView, SkuView, BrandView, ApprovalsView
│   └── UploadModal.jsx      # CSV/XLSX file picker + template download
└── styles/
    ├── colors_and_type.css  # Design tokens from SourceX / Fynd ERP design system
    ├── app.css              # Main stylesheet
    └── upload.css           # Upload modal styles
```

---

## What this is (and what it isn't)

**Ranjit asked for a decision, not a dashboard.** So:

- **Triage view, not a table.** Three tabs (`Marketplace × SKU`, `SKU view`, `Brand view`) plus a dedicated `Approvals` page. Listings sort by criticality — recover bucket first, with staleness as the tiebreaker (a SKU Lost for 6 days outranks one Lost for 1 day, because that's how much sales we've already bled).
- **Compact rows with a 30-day sparkline behind each row.** Hover-visible; chart-quality version inside the detail panel.
- **Multi-competitor data per listing.** 3–5 sellers with prices, Buy Box share, last-move direction/size/age. Click any competitor row in the detail panel to expand its full history.
- **Two-line AI output per row:** the **recommendation sentence** (engine target price + numeric tradeoff) and the **Manager's Note** (the human-readable pattern — staleness, flash-sale-suspect, velocity, recovery decay).
- **Confidence pill** (High/Medium/Low) on every row, computed from the sum of rule weights — not invented by the LLM.
- **Edit price before sending** with a live floor guard that disables the send button if you type below `floor + cushion`.
- **Skip with reason** opens a modal capturing one of five reason buckets + freeform. Logged to console; the wiring for "feeds v2 heuristic library" is the point, not the storage backend.
- **Approvals page** shows pending sends (Ranjit recommends → Priya approves), each with **WhatsApp** / **Email** reminder buttons that bump a reminder count and toast confirmation.
- **CSV / XLSX import.** Download a pre-filled template (XLSX or CSV), edit, re-upload. Synthesizer fills in competitor stacks and price history so imported rows render with the same detail as the demo set.

**What's deliberately not built** (and why):

- No backend database. State persists to `localStorage` instead — the case study scope didn't justify Supabase, and the Apply/approve actions are demo simulations anyway.
- No real marketplace API. The brief explicitly says simulate it; the UX is what's being graded.
- No auth. Single demo user (Ranjit K, Category Ops) hardcoded in the topbar.

---

## How the AI is constrained

The case study warned about "filler text dressed as intelligence." So the LLM here is **deliberately not** allowed to invent a price. Architecture:

```
1. Deterministic engine (lib/heuristics.js) computes the recommendation:
   - bucket  : recover | raise | blocked | hold
   - target  : within [floor + cushion, competitor - 1]
   - rules   : array of {key, label, weight, detail}
   - patterns: detected flags (recovery_decay, velocity, flash_sale, ...)

2. /api/recommend re-runs the engine server-side (untrusted client input)
   and builds a prompt that includes the engine's target as a fixed fact.

3. OpenAI returns JSON: { rec: "...", note: "..." }
   - response_format: json_object (strict JSON mode)
   - system prompt: "Never recommend a price below the margin floor"

4. Server-side guardrail scans the response for any "Rs.NNN" mention below
   floor. If found → fall back to the deterministic sentence. If JSON parse
   fails → fall back. If OPENAI_API_KEY missing → fall back.

5. Every card always shows a sentence. No card ever shows a price below floor.
```

The deterministic engine alone would write `"Set SKU-001 to Rs.1,189 — Rs.10 below competitor, Rs.139 above floor. Recovers Buy Box at 8.4% margin."` That's already good. The LLM's value-add is the **Manager's Note** — `"Heads up — this has been bleeding for 6 days. Algo decay means recovery isn't instant — expect 2–3 days."` — which names a pattern a rule engine can't.

---

## The encoded heuristics

Every magic number sits in `GUT_RULES` at the top of `lib/heuristics.js`, each with a comment explaining the WHY. These are deliberately exposed so a senior pricing manager could tune them:

| Rule | Default | Why |
|---|---|---|
| `UNDERCUT_INR` | 10 | Match-and-just-beat. Rs.50+ below leaks margin we didn't need to. |
| `FLOOR_CUSHION_INR` | 50 | Never sit on floor. Absorbs FX / freight / COGS drift. |
| `RAISE_HEADROOM_PCT` | 5% | Below 5%, raising risks Buy Box flip — upside doesn't justify. |
| `MAGNITUDE_GUARD_PCT` | 15% | >15% drop trips marketplace fairness systems. Escalate, don't auto-apply. |
| `VELOCITY_GUARD_DAYS` | 0 | Two changes in 24h hurts Buy Box more than holding a Lost position. |
| `RECOVERY_DECAY_DAYS` | 5 | A SKU Lost 6+ days needs deeper cut — algorithm has down-weighted it. |
| `ANOMALY_FLASH_PCT` | 8% | Competitor dropped >8% recently? Likely a 24–48h promo. Wait. |
| `PORTFOLIO_LIMIT` | 3 | Don't move >3 SKUs in same brand same day. Looks reactive. |
| `ASYMMETRIC_RISK_PCT` | 6% | Margin sacrifice > 6% lowers confidence. Margin loss is permanent; Buy Box isn't. |

Each rule fires for/against a recommendation with a signed weight. The detail panel shows every rule that fired and what it contributed — Ranjit can see the engine's logic, not just trust it.

---

## SKU-007 handling (the explicit edge case)

The brief calls out that SKU-007's competitor (Rs.399) is below our floor (Rs.420). The engine flags it `blocked`, no `Apply` button, no AI call, dedicated UI treatment: yellow `HOLD · floor block` badge, dedicated detail panel copy, and `Acknowledge & monitor` / `Request floor review` actions instead of `Send for approval`. The full math is in the rules breakdown.

---

## Demo guide (60 seconds)

1. **Land on the page.** Stat strip shows 4 recover, 1 raise, 1 blocked (SKU-007), 0 pending, 0 applied.
2. **Top card is SKU-003 LivSpace Pro on Amazon India** — Lost 6 days (warning chip), recovery-decay pattern, 17% resulting margin if applied. Expand it.
3. In the detail panel, see the **30-day sparkline**, the **competitor stack** (click HomeKraft to expand its full history), and the **rules breakdown** (UNDERCUT_BASE +0.40, RECOVERY_DECAY −0.15, etc.).
4. **Edit the price** in the action panel. Try typing `1800` — `Send for approval` disables with "below floor + cushion".
5. Hit **Send for approval at Rs.2,189**. The row gets a yellow `Pending approval from Priya Iyer` banner.
6. Switch to the **Approvals tab**. The card is there with `WhatsApp` and `Email` reminder buttons. Send a reminder, then **Mark approved**. Row flips to `Approved & repriced`.
7. Switch to **Brand view**. Natura Casa shows a `3 moves today — at portfolio limit` warning because three SKUs in that brand were last changed today.
8. Click **Import data** in the page header. Download the XLSX template, change a price in Excel, re-upload. The triage updates with your new data.

---

## What I'd change with another 4 hours

- **Approver routing per brand / category** — currently Priya gets everything; in reality each category has a designated approver.
- **Persisted reminder schedule** — auto-bump after 2h with no response. The infrastructure is in place (we already store reminder count + last channel); just need a cron-style background worker.
- **Real Supabase backend.** Schema designed (`reprice_actions`, `skip_reasons`, `approvals`, `reminders_sent`) but localStorage was the right call for a 4-hour case study.
- **A second AI call per session** that summarizes "what changed today" — a 3-bullet pre-coffee briefing. The data is already structured for it.
- **Onboarding tour.** First-time users land on the page with no idea what the colored chips mean.

---

## Tech

- **Next.js 14** (pages router)
- **React 18**
- **OpenAI SDK v4** with `response_format: json_object`
- **SheetJS (xlsx)** for spreadsheet parse + template generation
- **localStorage** for action persistence
- Design tokens lifted from the **SourceX / Fynd ERP** design system (`#2e31be` indigo primary, Google Sans, dark `#1f1f1f` topbar)
