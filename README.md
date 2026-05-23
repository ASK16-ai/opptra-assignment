# Opptra Pricing Copilot

The full product document lives in **[PRD.md](./PRD.md)** — problem framing, what shipped in v1, the v2/v3/v4 roadmap, and success metrics.

## Run it locally

```bash
cd opptra
npm install
cp .env.local.example .env.local        # paste your OPENAI_API_KEY
npm run dev                             # http://localhost:3000
```

Without an `OPENAI_API_KEY`, every recommendation falls back to a deterministic engine-written sentence — the app still runs end-to-end. With a key, the AI fills in the manager's note and the decision walkthrough.
