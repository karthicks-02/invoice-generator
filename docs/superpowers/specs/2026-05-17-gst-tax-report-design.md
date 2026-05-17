# GST Tax Report — Design Spec
**Date:** 2026-05-17
**Project:** Invoice Generator (Karthick Industries)
**Status:** Approved

---

## Overview

Add a GST Tax Report view to the existing invoice generator app. The report aggregates outward supply data from existing invoices — no schema changes required — and presents it in a GSTR-1-style layout with a summary KPI grid, a filterable invoice table, and PDF + CSV export. The design is premium ("$60k website" quality) with a dark theme matching the existing app.

---

## Goals

- Give the business owner a ready-to-use GST summary for monthly/quarterly filing
- Auto-split invoices into B2B (has buyerGstin) and B2C (no buyerGstin)
- Show CGST/SGST for intra-state, IGST for inter-state — sourced from existing `gstType` field
- Let users drill into source invoices from the report
- Export the report as PDF or CSV

---

## Architecture

**Approach:** Compute on-the-fly. No Firestore schema changes, no migration. All GST values are derived at render time from fields already stored on each invoice:
- `gstRate` (percentage, e.g. 18)
- `gstType` (`"intra"` → CGST + SGST, `"inter"` → IGST)
- `items[]` with `qty` × `rate` = taxable subtotal per line

**New view:** `gstReportView` — added to the existing 14-view router in `script.js`. Follows the same pattern as `customerReportView`, `purchaseAnalyticsView`, etc.

**Navigation:** Add "GST Report" entry to the existing sidebar/nav alongside other report views.

---

## GST Calculation Logic

For each invoice:
```
taxableValue = sum(item.qty × item.rate)  for all items

if gstType === "intra":
  CGST = taxableValue × (gstRate / 200)
  SGST = taxableValue × (gstRate / 200)
  IGST = 0

if gstType === "inter":
  CGST = 0
  SGST = 0
  IGST = taxableValue × (gstRate / 100)

totalTax = CGST + SGST + IGST
```

B2B: invoice has non-empty `buyerGstin`
B2C: invoice has empty or missing `buyerGstin`

---

## Period Filter Logic

Three modes, toggled by tabs in the header:

| Mode | Logic |
|------|-------|
| **Monthly** | Filter by calendar month + year. Prev/next arrows navigate months. |
| **Quarterly** | Indian FY quarters — Q1: Apr–Jun, Q2: Jul–Sep, Q3: Oct–Dec, Q4: Jan–Mar. Prev/next navigate quarters. |
| **Full FY** | Apr 1 – Mar 31. e.g. FY 2024-25. Prev/next navigate years. |

Default: Monthly, current month.

---

## UI Components

### 1. Report Header (Hero Banner)
- Gradient background (indigo → navy)
- Business name + GSTIN chip (read from existing business settings or first invoice)
- "GSTR-1 Style Report" tag badge
- Period tabs: Monthly / Quarterly / Full FY
- Prev/next period arrows + current period label

### 2. KPI Grid (6 cards)
| Card | Value | Delta |
|------|-------|-------|
| Taxable Value | Sum of all taxable values in period | vs previous period |
| CGST Collected | Sum of CGST in period | vs previous period |
| SGST Collected | Sum of SGST in period | vs previous period |
| IGST Collected | Sum of IGST in period | vs previous period |
| Total Tax | CGST + SGST + IGST | vs previous period |
| Invoices | Count of invoices in period | B2B: N · B2C: N |

Each card has a colored top-accent strip and a MoM/QoQ/YoY delta badge (green ↑ / red ↓ / grey neutral).

### 3. Invoice Table

**Toolbar:**
- Left: Segmented control — B2B Invoices / B2C Invoices / All
- Right: Search box (filter by party name), PDF export button, CSV export button

**Columns:**
| # | Party & GSTIN | Invoice No. | Date | Taxable (₹) | CGST/SGST | IGST | Action |
|---|---------------|-------------|------|-------------|-----------|------|--------|

- GSTIN shown as a monospace chip on B2B rows; "B2C" grey chip on B2C rows
- CGST/SGST column shows CGST amount for intra-state (SGST is always equal to CGST, so one value represents both; label reads "₹7,650 each"). Shows "—" for inter-state invoices.
- IGST column shows value for inter-state, "—" for intra-state
- Action: "View ↗" button — opens the invoice in `invoiceView` in read-only/view mode (existing behavior)
- Table sorted by invoice date descending

**Footer totals row:**
- Sticky totals row at bottom: sum of Taxable, CGST/SGST, IGST for the active segment + period

### 4. Export

**PDF:**
- Uses existing window.print / PDF infrastructure
- Print-only stylesheet hides sidebar, toolbar, action buttons
- Renders: header (business name, GSTIN, period), KPI summary table, full invoice table with totals

**CSV:**
- Client-side Blob download
- Filename: `GST_Report_<Period>.csv`
- Columns: Invoice No, Invoice Date, Party Name, Party GSTIN, Taxable Value, CGST, SGST, IGST, Total Tax, GST Rate, GST Type
- Respects active period filter + B2B/B2C/All segment

---

## Data Flow

```
User selects period
  → filter invoices[] from Firestore cache by invoiceDate in period range
  → for each invoice: compute taxableValue, CGST, SGST, IGST
  → split into b2bInvoices (has buyerGstin) and b2cInvoices
  → aggregate KPI totals
  → compute previous-period totals for delta badges
  → render KPI grid + table for active segment
```

No additional Firestore reads — uses the invoices already loaded in the app's data layer.

---

## Implementation Constraints

- **No schema changes** — all fields already exist on invoices
- **No new Firestore collections** — read from existing `users/{uid}/data/invoices`
- **Follows existing code patterns** — view function, render function, nav entry, same CSS variables
- **No new dependencies** — CSV export via native Blob API, PDF via existing print infra
- **Row click → open invoice** — reuse existing `openInvoice(id)` / `showView('invoiceView')` pattern

---

## Out of Scope

- GSTR-2A (inward supplies / purchase GST) — separate feature
- GST portal JSON export format — future enhancement
- HSN-wise summary — future enhancement (HSN codes exist on items but aggregation not in this spec)
- E-invoice / IRN generation — out of scope

---

## Success Criteria

- [ ] Period filter correctly buckets invoices into months, quarters, FY
- [ ] CGST/SGST computed correctly for intra-state invoices
- [ ] IGST computed correctly for inter-state invoices
- [ ] B2B/B2C split based on presence of `buyerGstin`
- [ ] KPI deltas show correct comparison to previous period
- [ ] CSV export downloads with correct values and headers
- [ ] PDF export renders cleanly (no UI chrome, no action buttons)
- [ ] "View ↗" opens correct invoice in view mode
- [ ] Navigation entry appears in sidebar and routes correctly
