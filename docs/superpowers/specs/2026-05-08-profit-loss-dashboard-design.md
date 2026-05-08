# P&L Dashboard Design
**Date:** 2026-05-08
**Status:** Approved

## Problem

The app shows revenue from customer invoices and vendor purchases separately, but there is no single view that combines them into a real profit/loss number. The business also has direct production costs per product (steel coil, coating, drilling) and overheads (rent, electricity, salaries) that are not tracked anywhere. Without this, the owner cannot know actual profit.

## Goals

- Show true net profit = Revenue − COGS − Vendor Purchases − Overheads − Payroll
- Support period comparison (this month vs last month, this week vs last week, this year vs last year)
- Be simple enough for a non-technical user (owner's father) to update and read
- Reuse existing invoice and PO invoice data — no double entry for revenue or vendor purchases

## Out of Scope

- Bank reconciliation or receipt uploads
- Per-invoice cost attribution (costs are rate-based, not invoice-specific)
- Multi-user or accountant access
- GST filing summaries

---

## Section 1 — Product Cost Rates

### Where
Inside the existing Products list. Each product gets a "Cost Sheet" button.

### Data Model
Each product in Firestore gets a `costSheet` object:
```json
{
  "coilCost": 50,
  "coatingCharge": 10,
  "drillingCharge": 5,
  "unit": "kg"
}
```

### UI
Tapping "Cost Sheet" opens a small inline form:
```
Steel Coil Cost    [₹ _____ per kg]
Coating Charge     [₹ _____ per kg]
Drilling Charge    [₹ _____ per kg]
[Save]
```

- All three fields are optional (leave blank = ₹0)
- Unit is always `per kg` for now (matches existing product unit)
- Saving updates the product document in Firestore

### P&L Calculation
For each invoice in the selected period:
- For each line item: look up the product's current cost rates
- COGS contribution = (coilCost + coatingCharge + drillingCharge) × qty sold
- Sum across all invoices and all line items for the period

**Note:** Uses current rates at time of P&L view (not historical rates). If rates change, old period P&L will reflect new rates — acceptable tradeoff for simplicity.

**Products with no cost sheet:** If a product has no costSheet saved, its COGS contribution is ₹0 for all three cost lines. No error shown.

**Unit assumption:** Cost rates are per unit of qty as entered in the invoice line item (e.g. kg). This matches the existing product unit field.

---

## Section 2 — Overhead & Payroll Tracker

### Where
New "Expenses" quick-action card on the home dashboard. Opens a dedicated panel.

### Data Model
New Firestore collection: `expenses/{userId}/entries/{entryId}`
```json
{
  "category": "Electricity",
  "amount": 8500,
  "month": "2026-05",
  "note": "EB bill Q1",
  "employeeName": "",
  "createdAt": "timestamp"
}
```

- `category`: one of `Rent`, `Electricity`, `Fuel`, `Salary`, `Other`
- `month`: stored as `YYYY-MM` string for easy period filtering
- `employeeName`: only populated when category is `Salary`

### UI
**Top — Entry Form:**
```
Category   [Rent / Electricity / Fuel / Salary / Other ▼]
Amount     [₹ _____]
Month      [May 2026 ▼]
Note       [optional]
Employee   [_____]   ← only visible when category = Salary
[+ Add Expense]
```

**Below — Entry List:**
- Grouped by month (most recent first)
- Each row: Category · Amount · Note (if any) · [✕ delete]
- Salary rows show employee name: "Salary — Ravi — ₹18,000"

### Validation
- Category and Amount are required
- Amount must be a positive number
- Month defaults to current month

---

## Section 3 — P&L View

### Where
- New KPI card on home dashboard showing current month's net profit
- Tapping it opens the full P&L panel

### Period Options
| Selected | Comparison |
|----------|-----------|
| This Week | Last Week |
| This Month | Last Month |
| This Year | Last Year |
| Custom | None |

### Data Sources
| Line | Source |
|------|--------|
| Revenue | Customer invoices (existing `invoices` collection) |
| Steel Coil Cost | Product costSheet.coilCost × qty from invoices |
| Coating Charges | Product costSheet.coatingCharge × qty from invoices |
| Drilling Charges | Product costSheet.drillingCharge × qty from invoices |
| Vendor Purchases | PO invoices (existing `poInvoices` collection) |
| Overheads & Payroll | New `expenses` collection |

### P&L Panel Layout
```
Period  [This Month ▼]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                      May 2026    Apr 2026    Δ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REVENUE            ₹4,20,000   ₹3,80,000  ▲ 10.5%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Steel Coil         ₹1,20,000   ₹1,05,000  ▲ 14.3%
  Coating              ₹45,000     ₹42,000  ▲  7.1%
  Drilling             ₹18,000     ₹18,000      —
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Vendor Purchases     ₹32,000     ₹28,000  ▲ 14.3%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Rent                 ₹15,000     ₹15,000      —
  Electricity           ₹8,500      ₹7,200  ▲ 18.1%
  Salaries             ₹54,000     ₹54,000      —
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NET PROFIT         ₹1,27,500   ₹1,10,800  ▲ 15.1%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Delta Display Rules
- Profit up → green ▲ percentage
- Profit down → red ▼ percentage
- No change → dash `—`
- No comparison period data → comparison column hidden entirely

### Net Profit KPI Card (Home Dashboard)
- Position: 3rd card in the KPI row, after the existing Outstanding card
- Shows current month net profit
- Sub-label: vs last month delta (e.g. "▲ 15.1% vs last month")
- Tapping opens the full P&L panel

### Download PDF
- Button at the bottom of P&L panel
- Exports the current view (period + comparison if visible) as a PDF
- Follows existing PDF generation pattern (html2canvas / jsPDF)

---

## Firestore Rules

New collection `expenses` follows the same per-user security pattern as existing collections:
```
match /expenses/{userId}/entries/{entryId} {
  allow read, write: if request.auth.uid == userId;
}
```

Product documents already exist — adding `costSheet` field requires no new collection.

---

## Simplicity Constraints

- No historical cost rate tracking — current rate is used for all P&L calculations
- No complex expense categories beyond the 5 listed
- Month picker defaults to current month — one tap to change
- All auto-pulled data (revenue, PO purchases) requires zero manual entry
- Maximum 3 fields to fill for any expense entry
