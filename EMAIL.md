# Email — assignment response

**Subject:** Opptra AI PE case study — submission (Atharv Kulkarni)

**To:** [hiring team email]

---

Hi team,

Submitting my take on the AI Product Engineer case study — **Opptra Pricing Copilot**, a working Next.js prototype that automates the analyse-decide-request middle of the Category lead's daily pricing loop.

**Repo:** https://github.com/ASK16-ai/opptra-assignment
**PRD (2-page, with diagrams):** https://github.com/ASK16-ai/opptra-assignment/blob/main/opptra/PRD.md
**Run locally:** `cd opptra && npm install && npm run dev` (with `OPENAI_API_KEY` in `.env.local`; falls back to deterministic recs without one)

A few things I'd flag in review:

- **Hybrid engine** — the rules engine (`lib/heuristics.js`) picks the bucket and target price; the LLM (GPT-5-mini) only writes the sentence, manager's note, and reasoning walkthrough. A server-side floor guard rejects any AI output below margin floor. The LLM never decides; it explains.
- **Multi-competitor CSV ingest** — one row per (sku, marketplace, competitor); listing-level fields validated for consistency on import. Added `orders_in_period` / `period_days` / `profit_margin` as optional inputs so the category lead's own sales data drives the forecast and prompt.
- **End-to-end loop** — explicit Submit step on import, From/To date filter, persistent AI cache (no re-fetching on reload), append-only audit trail at `/audit`.
- **What's deliberately missing in v1, and what's planned for v2–v4** — covered in the PRD. v4 closes the loop into a full agent (live scraping, 3-hour scheduled runs, auto-execute on no-brainer raises with a concrete gate, direct marketplace push with rollback).

Happy to walk through the engine, the AI prompt design, or the architecture trade-offs in person.

Thanks,
Atharv
atharvkulkarni@fynd.com
