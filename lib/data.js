/* Opptra Pricing Copilot — data
   ──────────────────────────────────────────────────────────────────────
   Sample data extended from the 8-SKU brief to a multi-marketplace,
   multi-competitor model. The 8 base SKUs still anchor the math —
   the same numbers from the brief are present on Amazon India and
   match the brief's note about SKU-007.

   Listings are SKU × marketplace. Each carries its own competitor stack
   and a procedurally-seeded 30-day price history (deterministic per id).
*/

// ─── Marketplaces and competitor names per marketplace ────────────────
export const MARKETPLACES = ["Amazon India", "Noon UAE", "Flipkart"];

// Realistic-enough competitor handles per marketplace. Stable list so the
// "competitor X dropped price" copy ties back to the same handle on reload.
const COMPETITORS_BY_MARKETPLACE = {
  "Amazon India": ["HomeKraft", "UrbanLeaf", "TidyHaus", "Maison&Co", "PrimePicks", "ShelfMate"],
  "Noon UAE":     ["NoonDirect", "DarLuxe", "HomeStore Gulf", "MajilisCo", "Souq Express"],
  "Flipkart":     ["F-PrimeHome", "Casaberry", "NestNook", "Bazaarly", "HomeOrbit"]
};

// ─── Base SKUs — the 8 from the brief ─────────────────────────────────
export const BASE_SKUS = [
  { sku: "SKU-001", brand: "Natura Casa",   name: "Olivewood Coaster Set",        category: "Home · Dining" },
  { sku: "SKU-002", brand: "Natura Casa",   name: "Terracotta Planter, Medium",   category: "Garden · Decor" },
  { sku: "SKU-003", brand: "LivSpace Pro",  name: "Modular Drawer System (3pc)",  category: "Storage" },
  { sku: "SKU-004", brand: "LivSpace Pro",  name: "Cable Sleeve, 1.5m",           category: "Storage · Accessories" },
  { sku: "SKU-005", brand: "Artisan Home",  name: "Hand-Hammered Brass Bowl",     category: "Home · Decor" },
  { sku: "SKU-006", brand: "Artisan Home",  name: "Walnut Tea Tray",              category: "Home · Dining" },
  { sku: "SKU-007", brand: "Nordic Basics", name: "Linen Tea Towel, Pack of 2",   category: "Kitchen · Linen" },
  { sku: "SKU-008", brand: "Nordic Basics", name: "Oak Cutting Board, Large",     category: "Kitchen · Boards" }
];

// ─── Per-listing seeded data ──────────────────────────────────────────
const RAW_LISTINGS = [
  // ── Amazon India (the 8 from the brief, verbatim) ──
  { sku: "SKU-001", marketplace: "Amazon India", ourPrice: 1299, floor: 1050, buyBox: "Lost", lastChanged: "3 days ago" },
  { sku: "SKU-002", marketplace: "Amazon India", ourPrice: 849,  floor: 720,  buyBox: "Won",  lastChanged: "Today" },
  { sku: "SKU-003", marketplace: "Amazon India", ourPrice: 2499, floor: 1800, buyBox: "Lost", lastChanged: "6 days ago" },
  { sku: "SKU-004", marketplace: "Amazon India", ourPrice: 599,  floor: 480,  buyBox: "Won",  lastChanged: "2 days ago" },
  { sku: "SKU-005", marketplace: "Amazon India", ourPrice: 3799, floor: 3200, buyBox: "Lost", lastChanged: "1 day ago" },
  { sku: "SKU-006", marketplace: "Amazon India", ourPrice: 1150, floor: 900,  buyBox: "Won",  lastChanged: "Today" },
  { sku: "SKU-007", marketplace: "Amazon India", ourPrice: 449,  floor: 420,  buyBox: "Lost", lastChanged: "5 days ago" },
  { sku: "SKU-008", marketplace: "Amazon India", ourPrice: 2199, floor: 1750, buyBox: "Lost", lastChanged: "4 days ago" },

  // ── Noon UAE counterparts (price in Rs. equivalent for prototype simplicity) ──
  { sku: "SKU-001", marketplace: "Noon UAE",     ourPrice: 1349, floor: 1050, buyBox: "Won",  lastChanged: "8 days ago" },
  { sku: "SKU-003", marketplace: "Noon UAE",     ourPrice: 2350, floor: 1800, buyBox: "Lost", lastChanged: "2 days ago" },
  { sku: "SKU-005", marketplace: "Noon UAE",     ourPrice: 3690, floor: 3200, buyBox: "Won",  lastChanged: "Today" },
  { sku: "SKU-006", marketplace: "Noon UAE",     ourPrice: 1240, floor: 900,  buyBox: "Won",  lastChanged: "11 days ago" },
  { sku: "SKU-008", marketplace: "Noon UAE",     ourPrice: 2099, floor: 1750, buyBox: "Lost", lastChanged: "7 days ago" },

  // ── Flipkart counterparts ──
  { sku: "SKU-002", marketplace: "Flipkart",     ourPrice: 829,  floor: 720,  buyBox: "Won",  lastChanged: "Today" },
  { sku: "SKU-003", marketplace: "Flipkart",     ourPrice: 2399, floor: 1800, buyBox: "Lost", lastChanged: "9 days ago" },
  { sku: "SKU-004", marketplace: "Flipkart",     ourPrice: 569,  floor: 480,  buyBox: "Lost", lastChanged: "12 days ago" },
  { sku: "SKU-008", marketplace: "Flipkart",     ourPrice: 2249, floor: 1750, buyBox: "Won",  lastChanged: "Today" }
];

// ─── Helpers used by the synthesis layer ──────────────────────────────
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
export function parseDaysSince(str) {
  if (!str) return 0;
  if (/today/i.test(str)) return 0;
  const m = String(str).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// ─── Synthesize a competitor stack for a listing ──────────────────────
// We seed off (sku + marketplace) so the stack is stable. The TOP competitor's
// price is fixed to match the brief's number on Amazon India. Other competitors
// fan out around it.
const BRIEF_COMPETITOR_PRICE = {
  "SKU-001|Amazon India": 1199,
  "SKU-002|Amazon India": 860,
  "SKU-003|Amazon India": 2199,
  "SKU-004|Amazon India": 610,
  "SKU-005|Amazon India": 3750,
  "SKU-006|Amazon India": 1390,
  "SKU-007|Amazon India": 399,
  "SKU-008|Amazon India": 2100
};

function synthesizeCompetitors(listing) {
  const key = `${listing.sku}|${listing.marketplace}`;
  const rand = lcg(hashStr(key));
  const pool = COMPETITORS_BY_MARKETPLACE[listing.marketplace] || ["Competitor A", "Competitor B", "Competitor C"];
  const n = 3 + Math.floor(rand() * 2); // 3 or 4 competitors
  const names = pool.slice(0, n);

  const anchor = BRIEF_COMPETITOR_PRICE[key] != null
    ? BRIEF_COMPETITOR_PRICE[key]
    : Math.round(listing.ourPrice * (0.94 + rand() * 0.10));

  const competitors = names.map((name, i) => {
    const spread = rand() * 0.18;
    const price = i === 0 ? anchor : Math.round(anchor * (1 + spread));
    const isLeader = i === 0;
    const buyBoxShare = isLeader
      ? (listing.buyBox === "Lost" ? 55 + Math.floor(rand() * 25) : 12 + Math.floor(rand() * 18))
      : Math.floor(rand() * 14);

    const moveDirection = rand() > 0.5 ? "down" : "up";
    const moveSize = Math.floor((0.02 + rand() * 0.12) * price);
    const moveDaysAgo = Math.floor(rand() * 8);

    return {
      name,
      price,
      buyBoxShare,
      lastMoveDirection: moveDirection,
      lastMoveSize: moveSize,
      lastMoveDaysAgo: moveDaysAgo,
      isLeader
    };
  });

  return competitors.sort((a, b) => a.price - b.price);
}

// ─── 30-day price history (us + competitor median) ────────────────────
function synthesizeHistory(listing, competitors) {
  const key = `hist:${listing.sku}|${listing.marketplace}`;
  const rand = lcg(hashStr(key));
  const days = 30;
  const out = [];
  const baseCompMedian = competitors[Math.floor(competitors.length / 2)]?.price ?? listing.ourPrice;
  let ours = listing.ourPrice * 1.04;
  let comp = baseCompMedian * 1.02;

  for (let d = days; d >= 0; d--) {
    ours += (rand() - 0.5) * (listing.ourPrice * 0.008);
    comp += (rand() - 0.5) * (baseCompMedian * 0.012);
    if (rand() < 0.06) ours -= listing.ourPrice * 0.02;
    if (rand() < 0.06) comp -= baseCompMedian * 0.025;
    out.push({
      daysAgo: d,
      ourPrice: Math.round(ours),
      competitorMedian: Math.round(comp)
    });
  }
  out[out.length - 1].ourPrice = listing.ourPrice;
  out[out.length - 1].competitorMedian = baseCompMedian;
  return out;
}

// ─── Build the final listings array ───────────────────────────────────
export function buildListings() {
  const skuMeta = Object.fromEntries(BASE_SKUS.map(s => [s.sku, s]));
  return RAW_LISTINGS
    .filter(r => r.ourPrice != null && MARKETPLACES.includes(r.marketplace))
    .map(r => {
      const meta = skuMeta[r.sku] || { brand: "Unknown", name: r.sku, category: "—" };
      const competitors = synthesizeCompetitors(r);
      const history = synthesizeHistory(r, competitors);
      const daysSince = parseDaysSince(r.lastChanged);
      return {
        id: `${r.sku}|${r.marketplace}`,
        sku: r.sku,
        brand: meta.brand,
        name: meta.name,
        category: meta.category,
        marketplace: r.marketplace,
        ourPrice: r.ourPrice,
        floor: r.floor,
        buyBox: r.buyBox,
        lastChanged: r.lastChanged,
        daysSince,
        competitors,
        topCompetitor: competitors[0],
        history30d: history
      };
    });
}

export const LISTINGS = buildListings();
