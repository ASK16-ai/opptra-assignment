/* CSV / XLSX template generation + ingest.
   ──────────────────────────────────────────────────────────────────────
   Ranjit's team works in spreadsheets today. Even if we never wire this
   to a real marketplace API, importing their existing sheet is what
   makes the prototype feel believable. We support both .csv and .xlsx
   (via SheetJS) and ship a one-click template download.

   Required columns (case-insensitive, order-flexible):
     sku, brand, marketplace, our_price, competitor_price, buy_box,
     margin_floor, last_changed

   Optional:
     name, category
*/

import * as XLSX from "xlsx";
import { BASE_SKUS, MARKETPLACES, parseDaysSince } from "./data";

// The 8 sample SKUs from the brief, written into the template so anyone
// downloading it immediately has a working file to upload back.
const TEMPLATE_ROWS = [
  { sku: "SKU-001", brand: "Natura Casa",   name: "Olivewood Coaster Set",       category: "Home · Dining",         marketplace: "Amazon India", our_price: 1299, competitor_price: 1199, buy_box: "Lost", margin_floor: 1050, last_changed: "3 days ago" },
  { sku: "SKU-002", brand: "Natura Casa",   name: "Terracotta Planter, Medium",  category: "Garden · Decor",        marketplace: "Amazon India", our_price: 849,  competitor_price: 860,  buy_box: "Won",  margin_floor: 720,  last_changed: "Today" },
  { sku: "SKU-003", brand: "LivSpace Pro",  name: "Modular Drawer System (3pc)", category: "Storage",               marketplace: "Amazon India", our_price: 2499, competitor_price: 2199, buy_box: "Lost", margin_floor: 1800, last_changed: "6 days ago" },
  { sku: "SKU-004", brand: "LivSpace Pro",  name: "Cable Sleeve, 1.5m",          category: "Storage · Accessories", marketplace: "Amazon India", our_price: 599,  competitor_price: 610,  buy_box: "Won",  margin_floor: 480,  last_changed: "2 days ago" },
  { sku: "SKU-005", brand: "Artisan Home",  name: "Hand-Hammered Brass Bowl",    category: "Home · Decor",          marketplace: "Amazon India", our_price: 3799, competitor_price: 3750, buy_box: "Lost", margin_floor: 3200, last_changed: "1 day ago" },
  { sku: "SKU-006", brand: "Artisan Home",  name: "Walnut Tea Tray",             category: "Home · Dining",         marketplace: "Amazon India", our_price: 1150, competitor_price: 1390, buy_box: "Won",  margin_floor: 900,  last_changed: "Today" },
  { sku: "SKU-007", brand: "Nordic Basics", name: "Linen Tea Towel, Pack of 2",  category: "Kitchen · Linen",       marketplace: "Amazon India", our_price: 449,  competitor_price: 399,  buy_box: "Lost", margin_floor: 420,  last_changed: "5 days ago" },
  { sku: "SKU-008", brand: "Nordic Basics", name: "Oak Cutting Board, Large",    category: "Kitchen · Boards",      marketplace: "Amazon India", our_price: 2199, competitor_price: 2100, buy_box: "Lost", margin_floor: 1750, last_changed: "4 days ago" }
];

const COLUMNS = [
  "sku", "brand", "name", "category", "marketplace",
  "our_price", "competitor_price", "buy_box", "margin_floor", "last_changed"
];

// ─── Template generators ──────────────────────────────────────────────
function escapeCsvCell(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsvTemplate() {
  const header = COLUMNS.join(",");
  const rows = TEMPLATE_ROWS.map(r =>
    COLUMNS.map(c => escapeCsvCell(r[c])).join(",")
  );
  return [header, ...rows].join("\n");
}

export function buildXlsxTemplate() {
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_ROWS, { header: COLUMNS });
  // Make columns reasonably wide so the header isn't truncated on first open.
  ws["!cols"] = COLUMNS.map(c => ({ wch: c.length > 14 ? c.length + 2 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SKUs");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

export function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTemplate(format = "xlsx") {
  if (format === "csv") {
    const csv = buildCsvTemplate();
    triggerDownload("opptra-sku-template.csv", new Blob([csv], { type: "text/csv;charset=utf-8" }));
  } else {
    const arr = buildXlsxTemplate();
    triggerDownload("opptra-sku-template.xlsx", new Blob([arr], { type: "application/octet-stream" }));
  }
}

// ─── Ingest ───────────────────────────────────────────────────────────
function normalizeKey(k) {
  return String(k || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "");
}

const COL_ALIASES = {
  sku: ["sku", "sku_id", "skuid", "id"],
  brand: ["brand"],
  name: ["name", "product_name", "product", "title"],
  category: ["category", "cat"],
  marketplace: ["marketplace", "channel", "site", "store"],
  our_price: ["our_price", "ourprice", "current_price", "price", "list_price"],
  competitor_price: ["competitor_price", "compprice", "competitor", "comp_price", "best_competitor", "best_competitor_price"],
  buy_box: ["buy_box", "buybox", "buy_box_status", "bb"],
  margin_floor: ["margin_floor", "floor", "min_price", "min", "cost_floor"],
  last_changed: ["last_changed", "lastchanged", "last_change", "last_updated", "updated_at"]
};

function pickField(rowRecord, target) {
  for (const alias of COL_ALIASES[target] || [target]) {
    if (rowRecord[alias] !== undefined && rowRecord[alias] !== null && rowRecord[alias] !== "") {
      return rowRecord[alias];
    }
  }
  return undefined;
}

function asNumber(v) {
  if (v == null || v === "") return NaN;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function asBuyBox(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "won" || s === "yes" || s === "y" || s === "true" || s === "1") return "Won";
  if (s === "lost" || s === "no" || s === "n" || s === "false" || s === "0") return "Lost";
  return null;
}

function normalizeMarketplace(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (s.includes("amazon")) return "Amazon India";
  if (s.includes("noon")) return "Noon UAE";
  if (s.includes("flipkart")) return "Flipkart";
  // pass through as-is — synthesizer falls back to a generic competitor pool
  return String(v).trim();
}

// Parse a single sheet of rows (already objects). Returns {rows, errors}.
function ingestRows(records) {
  const errors = [];
  const out = [];

  records.forEach((rawRow, idx) => {
    const lineNo = idx + 2; // +1 for header, +1 for 1-based
    // Normalize keys
    const r = {};
    Object.keys(rawRow).forEach(k => { r[normalizeKey(k)] = rawRow[k]; });

    const sku = pickField(r, "sku");
    const brand = pickField(r, "brand");
    const marketplace = normalizeMarketplace(pickField(r, "marketplace"));
    const ourPrice = asNumber(pickField(r, "our_price"));
    const competitorPrice = asNumber(pickField(r, "competitor_price"));
    const buyBox = asBuyBox(pickField(r, "buy_box"));
    const floor = asNumber(pickField(r, "margin_floor"));
    const lastChanged = pickField(r, "last_changed");

    const missing = [];
    if (!sku) missing.push("sku");
    if (!brand) missing.push("brand");
    if (!marketplace) missing.push("marketplace");
    if (!Number.isFinite(ourPrice)) missing.push("our_price");
    if (!Number.isFinite(competitorPrice)) missing.push("competitor_price");
    if (!buyBox) missing.push("buy_box (Won/Lost)");
    if (!Number.isFinite(floor)) missing.push("margin_floor");

    if (missing.length) {
      errors.push(`Row ${lineNo}: missing ${missing.join(", ")}`);
      return;
    }

    out.push({
      sku: String(sku).trim(),
      brand: String(brand).trim(),
      name: pickField(r, "name") ? String(pickField(r, "name")).trim() : String(sku).trim(),
      category: pickField(r, "category") ? String(pickField(r, "category")).trim() : "—",
      marketplace,
      ourPrice,
      competitorPrice,
      buyBox,
      floor,
      lastChanged: lastChanged ? String(lastChanged).trim() : "Today"
    });
  });

  return { rows: out, errors };
}

// Convert ingested rows into the shape the engine expects (with synthesized
// competitor stack + history). We piggyback on the same synthesis logic by
// re-using the data layer's hashing — that keeps the demo coherent.
function buildListingsFromIngested(rows) {
  // Inline a tiny version of the synthesizer (mirrors lib/data.js) so we don't
  // depend on the module-level LISTINGS being frozen at import time.
  const lcg = (seed) => {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  };
  const hashStr = (s) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  };
  const POOL = {
    "Amazon India": ["HomeKraft", "UrbanLeaf", "TidyHaus", "Maison&Co", "PrimePicks", "ShelfMate"],
    "Noon UAE":     ["NoonDirect", "DarLuxe", "HomeStore Gulf", "MajilisCo", "Souq Express"],
    "Flipkart":     ["F-PrimeHome", "Casaberry", "NestNook", "Bazaarly", "HomeOrbit"]
  };

  return rows.map(row => {
    const key = `${row.sku}|${row.marketplace}`;
    const rand = lcg(hashStr(key));
    const pool = POOL[row.marketplace] || ["Competitor A", "Competitor B", "Competitor C"];
    const n = 3 + Math.floor(rand() * 2);
    const names = pool.slice(0, n);

    // The user-supplied competitor_price is the leader.
    const anchor = row.competitorPrice;
    const competitors = names.map((name, i) => {
      const spread = rand() * 0.18;
      const price = i === 0 ? anchor : Math.round(anchor * (1 + spread));
      const isLeader = i === 0;
      const buyBoxShare = isLeader
        ? (row.buyBox === "Lost" ? 55 + Math.floor(rand() * 25) : 12 + Math.floor(rand() * 18))
        : Math.floor(rand() * 14);
      const moveDirection = rand() > 0.5 ? "down" : "up";
      const moveSize = Math.floor((0.02 + rand() * 0.12) * price);
      const moveDaysAgo = Math.floor(rand() * 8);
      return {
        name, price, buyBoxShare,
        lastMoveDirection: moveDirection,
        lastMoveSize: moveSize,
        lastMoveDaysAgo: moveDaysAgo,
        isLeader
      };
    }).sort((a, b) => a.price - b.price);

    // 30-day history
    const histRand = lcg(hashStr("hist:" + key));
    const baseMed = competitors[Math.floor(competitors.length / 2)]?.price ?? row.ourPrice;
    let ours = row.ourPrice * 1.04;
    let comp = baseMed * 1.02;
    const history = [];
    for (let d = 30; d >= 0; d--) {
      ours += (histRand() - 0.5) * (row.ourPrice * 0.008);
      comp += (histRand() - 0.5) * (baseMed * 0.012);
      if (histRand() < 0.06) ours -= row.ourPrice * 0.02;
      if (histRand() < 0.06) comp -= baseMed * 0.025;
      history.push({ daysAgo: d, ourPrice: Math.round(ours), competitorMedian: Math.round(comp) });
    }
    history[history.length - 1].ourPrice = row.ourPrice;
    history[history.length - 1].competitorMedian = baseMed;

    return {
      id: `${row.sku}|${row.marketplace}`,
      sku: row.sku,
      brand: row.brand,
      name: row.name,
      category: row.category,
      marketplace: row.marketplace,
      ourPrice: row.ourPrice,
      floor: row.floor,
      buyBox: row.buyBox,
      lastChanged: row.lastChanged,
      daysSince: parseDaysSince(row.lastChanged),
      competitors,
      topCompetitor: competitors[0],
      history30d: history
    };
  });
}

// ─── Public entry point ───────────────────────────────────────────────
export async function parseUploadedFile(file) {
  const name = (file?.name || "").toLowerCase();
  let records;
  if (name.endsWith(".csv")) {
    const text = await file.text();
    records = parseCsv(text);
  } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    records = XLSX.utils.sheet_to_json(ws, { defval: "" });
  } else {
    return { listings: [], errors: ["Unsupported file type. Use .csv or .xlsx."] };
  }

  const { rows, errors } = ingestRows(records);
  if (rows.length === 0) {
    return { listings: [], errors: errors.length ? errors : ["No valid rows found in file."] };
  }
  const listings = buildListingsFromIngested(rows);
  return { listings, errors };
}

// Tiny CSV parser. Handles quoted fields with commas, escaped quotes, and
// \r\n line endings. Good enough for the spreadsheets pricing teams actually
// produce; we don't try to support multiline cells (which sheets rarely have).
function parseCsv(text) {
  const lines = [];
  let cur = "";
  let inQuotes = false;
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === "\"") {
        if (text[i + 1] === "\"") { cur += "\""; i++; }
        else { inQuotes = false; }
      } else { cur += c; }
    } else if (c === "\"") {
      inQuotes = true;
    } else if (c === "\n" || c === "\r") {
      if (cur !== "" || lines.length || out.length === 0) {
        out.push(cur);
        lines.push(out.slice());
        out.length = 0;
        cur = "";
      }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur !== "" || out.length) {
    out.push(cur);
    lines.push(out);
  }

  if (lines.length === 0) return [];
  const header = lines[0].map(h => String(h).trim());
  return lines.slice(1)
    .filter(row => row.some(cell => String(cell).trim() !== ""))
    .map(row => {
      const obj = {};
      header.forEach((h, i) => { obj[h] = row[i] ?? ""; });
      return obj;
    });
}

// Suppress an unused-import warning while keeping BASE_SKUS available for
// any consumer that imports this file directly. (Re-exported deliberately
// so other modules can reference it through one import path.)
export { BASE_SKUS, MARKETPLACES };
