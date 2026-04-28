# Product Sales Analytics & Purchase Analytics — Design Spec
**Date:** 2026-04-28  
**Status:** Approved

---

## Overview

Add two new analytics views to the Karthick Industries invoice generator:

1. **Product Sales Analytics** — in the Customer section; analyses sales-side invoices
2. **Purchase Analytics** — in the Vendor & Purchase section; analyses PO invoices

Both views are identical in layout and behaviour, differing only in their data source.

---

## Navigation Placement

- **Customer section**: add a new `home-nav-item` with `data-view="productSalesView"` alongside the existing Customer List, Product List, Invoice, All Invoices, Cust. Payment cards.
- **Vendor & Purchase section**: add a new `home-nav-item` with `data-view="purchaseAnalyticsView"` alongside the existing Vendor, Purchase Product, PO Invoice, All PO Invoices, Vendor Payment cards.

Both cards get a distinct icon and label:
- Customer side: chart-bar icon, label **"Sales Analytics"**
- Vendor side: chart-bar icon, label **"Purchase Analytics"**

---

## Data Sources

| View | Invoice source | Product name field |
|---|---|---|
| Product Sales Analytics | `invoices[]` (customer invoices) | `item.description` |
| Purchase Analytics | `poInvoices[]` (PO invoices) | `item.description` |

Each invoice has an `invoiceDate` (YYYY-MM-DD string) and an `items[]` array. Each item has:
- `description` — product name
- `qty` — quantity (parsed via existing `numericQtyForLine()`)
- `rate` — unit price
- `amount` (optional; fallback: `qty * rate`)

---

## Filters

Identical preset buttons to the existing invoice list filters:

| Button ID prefix | Label | Range function |
|---|---|---|
| `psPreset*` / `paPreset*` | Today, Yesterday | `getTodayRange()`, `getYesterdayRange()` |
| | This Week, Last Week | `getWeekRange(0)`, `getWeekRange(-1)` |
| | This Month, Last Month | `getMonthRange(0)`, `getMonthRange(-1)` |
| | This Year, Last Year | `getYearRange(0)`, `getYearRange(-1)` |
| | Custom | date pickers (from / to inputs) |
| | Clear dates | resets to all-time |

Reuse the existing `getWeekRange`, `getMonthRange`, `getYearRange` helper functions from `script.js`. When no filter is active, show all-time data.

---

## Aggregation Logic

For the filtered invoice set, group line items by normalised product name (`description.trim().toLowerCase()`):

```
For each invoice in filtered set:
  For each item in invoice.items:
    key = item.description.trim().toLowerCase()
    map[key].invoiceCount++      ← count distinct invoices (not line occurrences)
    map[key].totalQty    += numericQtyForLine(item)
    map[key].rates.push(Number(item.rate) || 0)
    map[key].totalRevenue += numericQtyForLine(item) * (Number(item.rate) || 0)
```

**Note:** `invoiceCount` increments once per invoice per product, even if the product appears on multiple lines of the same invoice.

**Avg Rate** = `totalRevenue / totalQty` (weighted average).  
**Rate varied badge** = shown when `Math.max(...rates) !== Math.min(...rates)`.

Sort results by `totalRevenue` descending by default.

---

## Summary KPI Strip (4 tiles)

| Tile | Value |
|---|---|
| Products Invoiced | distinct product count in filtered set |
| Total Invoices | distinct invoice count in filtered set |
| Total Qty Sold | sum of all qty across all products |
| Total Revenue | sum of all revenue across all products |

---

## Table Columns

| Column | Alignment | Notes |
|---|---|---|
| # | left | row index, 1-based |
| Product Name | left | original casing (not normalised) |
| Invoice Count | right | |
| Total Qty | right | formatted number |
| Avg Rate | right | `₹X,XX,XXX` + amber `↕ varied` badge if rates differ |
| Total Revenue | right | bold, purple (`#6d28d9`) |

**Totals row** pinned at bottom: sums Invoice Count, Total Qty, Total Revenue; Avg Rate cell shows `—`.

**Search input**: client-side filter on Product Name (case-insensitive `includes`).

---

## Download — PDF Only

Single **"Download PDF"** button (top-right of view header).

PDF content:
- Business name + view title ("Product Sales Analytics" or "Purchase Analytics")
- Period label (e.g. "This Month — April 2026")
- The full filtered table (all rows, including totals row)
- Generated using the existing `html2pdf` pipeline already used in the app

Filename: `product-sales-[period].pdf` / `purchase-analytics-[period].pdf`

---

## Implementation Approach

Follow the existing patterns in `script.js` and `index.html` exactly:

1. **`index.html`**: Add two new `<div id="productSalesView" class="view hidden">` and `<div id="purchaseAnalyticsView" class="view hidden">` sections with the filter bar, KPI strip, search input, and table scaffold. Add the two new `home-nav-item` cards in the respective accordion sections.

2. **`script.js`**: Add two new self-contained sections (one per view) at the bottom of the file, following the same structure as the `invPreset*` / `poPreset*` filter blocks. Each section:
   - Registers preset button click listeners
   - Implements `renderProductSales(from, to)` / `renderPurchaseAnalytics(from, to)` functions
   - Handles search input live filtering
   - Handles PDF download

3. **`style.css`**: Add only the styles needed for the `↕ varied` badge and the KPI strip (reuse existing `.home-kpi-card` patterns as much as possible).

No new files are needed. All changes go into the three existing files.

---

## Out of Scope

- Bar/pie charts per product (can be added later)
- Sorting by column click (can be added later)
- Export to CSV (PDF only, as decided)
- Drill-down to see which invoices a product appeared in
