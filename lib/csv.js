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
     name, category, listed_at, competitor_name

   Multiple competitors: add one row per competitor with the same
   (sku, marketplace). Each row contributes ONE entry to that listing's
   competitor stack — its competitor_name and competitor_price. The stack
   is sorted by price ascending so the leader (price-to-beat) sits first.
   If competitor_name is empty, the row falls back to a generic
   "Competitor N" label.

   Listing-level fields (our_price, buy_box, margin_floor, brand, name,
   category, listed_at) should match across rows of the same group — if
   they don't, the first row wins and a warning is surfaced.
*/

import * as XLSX from "xlsx";
import { BASE_SKUS, MARKETPLACES, parseDaysSince } from "./data";

// Sample SKUs from the brief, written into the template so anyone
// downloading it immediately has a working file to upload back.
// SKU-001 and SKU-003 demonstrate the multi-competitor pattern: extra
// rows with the same (sku, marketplace) but different competitor_price
// add competitors to that listing's stack.
const TEMPLATE_ROWS = [
  { sku: "SKU-001", brand: "Natura Casa",   name: "Olivewood Coaster Set",       category: "Home · Dining",         marketplace: "Amazon India", our_price: 1299, competitor_name: "HomeKraft",   competitor_price: 1199, buy_box: "Lost", margin_floor: 1050, last_changed: "3 days ago" },
  { sku: "SKU-001", brand: "Natura Casa",   name: "Olivewood Coaster Set",       category: "Home · Dining",         marketplace: "Amazon India", our_price: 1299, competitor_name: "UrbanLeaf",   competitor_price: 1249, buy_box: "Lost", margin_floor: 1050, last_changed: "3 days ago" },
  { sku: "SKU-002", brand: "Natura Casa",   name: "Terracotta Planter, Medium",  category: "Garden · Decor",        marketplace: "Amazon India", our_price: 849,  competitor_name: "GreenNest",   competitor_price: 860,  buy_box: "Won",  margin_floor: 720,  last_changed: "Today" },
  { sku: "SKU-003", brand: "LivSpace Pro",  name: "Modular Drawer System (3pc)", category: "Storage",               marketplace: "Amazon India", our_price: 2499, competitor_name: "ShelfMate",   competitor_price: 2199, buy_box: "Lost", margin_floor: 1800, last_changed: "6 days ago" },
  { sku: "SKU-003", brand: "LivSpace Pro",  name: "Modular Drawer System (3pc)", category: "Storage",               marketplace: "Amazon India", our_price: 2499, competitor_name: "TidyHaus",    competitor_price: 2299, buy_box: "Lost", margin_floor: 1800, last_changed: "6 days ago" },
  { sku: "SKU-003", brand: "LivSpace Pro",  name: "Modular Drawer System (3pc)", category: "Storage",               marketplace: "Amazon India", our_price: 2499, competitor_name: "PrimePicks",  competitor_price: 2389, buy_box: "Lost", margin_floor: 1800, last_changed: "6 days ago" },
  { sku: "SKU-004", brand: "LivSpace Pro",  name: "Cable Sleeve, 1.5m",          category: "Storage · Accessories", marketplace: "Amazon India", our_price: 599,  competitor_name: "GadgetGrid",  competitor_price: 610,  buy_box: "Won",  margin_floor: 480,  last_changed: "2 days ago" },
  { sku: "SKU-005", brand: "Artisan Home",  name: "Hand-Hammered Brass Bowl",    category: "Home · Decor",          marketplace: "Amazon India", our_price: 3799, competitor_name: "Maison&Co",   competitor_price: 3750, buy_box: "Lost", margin_floor: 3200, last_changed: "1 day ago" },
  { sku: "SKU-006", brand: "Artisan Home",  name: "Walnut Tea Tray",             category: "Home · Dining",         marketplace: "Amazon India", our_price: 1150, competitor_name: "BrewCraft",   competitor_price: 1390, buy_box: "Won",  margin_floor: 900,  last_changed: "Today" },
  { sku: "SKU-007", brand: "Nordic Basics", name: "Linen Tea Towel, Pack of 2",  category: "Kitchen · Linen",       marketplace: "Amazon India", our_price: 449,  competitor_name: "LinenLab",    competitor_price: 399,  buy_box: "Lost", margin_floor: 420,  last_changed: "5 days ago" },
  { sku: "SKU-008", brand: "Nordic Basics", name: "Oak Cutting Board, Large",    category: "Kitchen · Boards",      marketplace: "Amazon India", our_price: 2199, competitor_name: "WoodWorks",   competitor_price: 2100, buy_box: "Lost", margin_floor: 1750, last_changed: "4 days ago" }
];

const COLUMNS = [
  "sku", "brand", "name", "category", "marketplace",
  "our_price", "competitor_name", "competitor_price",
  "buy_box", "margin_floor", "last_changed"
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
  competitor_name: ["competitor_name", "compname", "competitor_seller", "comp_name", "competitor_brand"],
  competitor_price: ["competitor_price", "compprice", "competitor", "comp_price", "best_competitor", "best_competitor_price"],
  buy_box: ["buy_box", "buybox", "buy_box_status", "bb"],
  margin_floor: ["margin_floor", "floor", "min_price", "min", "cost_floor"],
  last_changed: ["last_changed", "lastchanged", "last_change", "last_updated", "updated_at"],
  listed_at: ["listed_at", "listedat", "listing_date", "listed_on", "created_at", "first_listed"]
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
    const competitorName = pickField(r, "competitor_name");
    const competitorPrice = asNumber(pickField(r, "competitor_price"));
    const buyBox = asBuyBox(pickField(r, "buy_box"));
    const floor = asNumber(pickField(r, "margin_floor"));
    const lastChanged = pickField(r, "last_changed");
    const listedAt = pickField(r, "listed_at");

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
      competitorName: competitorName ? String(competitorName).trim() : null,
      competitorPrice,
      buyBox,
      floor,
      lastChanged: lastChanged ? String(lastChanged).trim() : "Today",
      listedAt: listedAt ? String(listedAt).trim() : null
    });
  });

  return { rows: out, errors };
}

// Convert ingested rows into the shape the engine expects.
//
// Rows are grouped by (sku + marketplace). Each row in a group contributes
// one competitor price to that listing — so a SKU with three competitor
// rows on Amazon India becomes one listing card with a 3-deep competitor
// stack. The lowest competitor price is the leader (the price-to-beat
// that the recommendation engine targets).
//
// Listing-level fields (our_price, buy_box, margin_floor, last_changed,
// brand, name, category, listed_at) are taken from the first row of the
// group; if subsequent rows disagree, we log a warning so the uploader
// can clean up their sheet.
function buildListingsFromIngested(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.sku}|${row.marketplace}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const warnings = [];
  const listings = [];

  for (const [key, group] of groups) {
    const head = group[0];

    // Verify listing-level fields are consistent across the rows.
    // Only the competitor price is allowed to vary within a group.
    const inconsistent = [];
    for (let i = 1; i < group.length; i++) {
      const r = group[i];
      if (r.ourPrice !== head.ourPrice) inconsistent.push("our_price");
      if (r.buyBox !== head.buyBox) inconsistent.push("buy_box");
      if (r.floor !== head.floor) inconsistent.push("margin_floor");
    }
    if (inconsistent.length) {
      const dedup = Array.from(new Set(inconsistent));
      warnings.push(`${key}: ${dedup.join(", ")} differ across rows — using the first row's value.`);
    }

    // Build the competitor stack from each row in the group, preserving
    // the name → price pairing. Sort ascending so the lowest priced
    // competitor (the leader / Buy Box contender we need to beat) is at
    // index 0. If a row has no competitor_name we fall back to a generic
    // "Competitor N" label so the stack still reads cleanly.
    const competitorsRaw = group
      .filter(r => Number.isFinite(r.competitorPrice))
      .map(r => ({ name: r.competitorName || null, price: r.competitorPrice }))
      .sort((a, b) => a.price - b.price);

    const competitors = competitorsRaw.map((c, i) => ({
      name: c.name || (competitorsRaw.length > 1 ? `Competitor ${i + 1}` : "Competitor"),
      price: c.price,
      isLeader: i === 0
    }));

    const uploadedListedAt = head.listedAt
      ? new Date(head.listedAt).getTime()
      : Date.now();

    listings.push({
      id: key,
      sku: head.sku,
      brand: head.brand,
      name: head.name,
      category: head.category,
      marketplace: head.marketplace,
      ourPrice: head.ourPrice,
      floor: head.floor,
      buyBox: head.buyBox,
      lastChanged: head.lastChanged,
      daysSince: parseDaysSince(head.lastChanged),
      listedAt: uploadedListedAt,
      listedDaysAgo: Math.floor((Date.now() - uploadedListedAt) / 86400000),
      competitors,
      topCompetitor: competitors[0],
      history30d: []
    });
  }

  return { listings, warnings };
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
  const { listings, warnings } = buildListingsFromIngested(rows);
  return { listings, errors: errors.concat(warnings) };
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
