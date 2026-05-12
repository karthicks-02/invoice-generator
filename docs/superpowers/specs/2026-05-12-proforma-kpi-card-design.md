# Proforma Invoice KPI Card — Design Spec
**Date:** 2026-05-12

## Problem

The "Total Amount" card in the invoice list view currently sums all filtered invoices, including proforma invoices. Proforma invoices are not actual confirmed revenue — they are draft/estimate documents. Including them in the total misleads the user about real receivables. The user wants:

1. The Total Amount card to reflect only confirmed invoice value.
2. The proforma invoice value to be visible beside it, not hidden.
3. The invoice count card to show how many invoices are confirmed vs proforma.

---

## Design

### KPI Row — Three Cards

The invoice list KPI row (`#invTotalPanel`) is updated from 2 cards to 3.

#### Card 1 — Total Amount (existing, updated)
- **Color:** Purple gradient (unchanged — `akpi-revenue` class)
- **Label:** `TOTAL AMOUNT` (unchanged)
- **Period:** same dynamic period label (e.g., "This month")
- **Value (`#invTotalSummaryValue`):** Sum of `computeGrandTotal()` for **confirmed invoices only** (i.e., `!isProformaInvoice(inv)`)
- **Subtitle:** Changes from "filtered invoice value" → **"confirmed invoices only"**

#### Card 2 — Proforma Value (new)
- **Color:** Orange gradient (`linear-gradient(145deg, #c2410c 0%, #ea580c 50%, #f97316 100%)`) — new CSS class `akpi-proforma`
- **Label:** `PROFORMA VALUE`
- **Period:** Same dynamic period label as Card 1 (`#invProformaSummaryPeriod`)
- **Value (`#invProformaSummaryValue`):** Sum of `computeGrandTotal()` for **proforma invoices only** (`isProformaInvoice(inv)`)
- **Subtitle:** "proforma invoices"

#### Card 3 — Total Invoices (existing, updated)
- **Color:** White/glass (unchanged)
- **Label:** `TOTAL INVOICES` (unchanged)
- **Count (`#invTotalSummaryCount`):** Total of all filtered invoices (confirmed + proforma combined) — unchanged format "14 invoices"
- **Subtitle:** "matching current filters" (unchanged)
- **NEW — Count split chips:** Two small pill chips below the subtitle:
  - `#invConfirmedCount` chip (indigo) — confirmed invoice count
  - `#invProformaCount` chip (orange) — proforma invoice count
- **Hint:** "Uses search + date range filters." (unchanged)

---

## Data Flow

All changes are in `renderInvoiceList()` in `script.js`.

**Current logic:**
```js
let sum = 0;
filtered.forEach(inv => { sum += computeGrandTotal(inv); });
valueEl.textContent = '₹' + fmtNum(sum);
countEl.textContent = filtered.length + ' invoice(s)';
```

**New logic:**
```js
let confirmedSum = 0;
let proformaSum = 0;
let confirmedCount = 0;
let proformaCount = 0;

filtered.forEach(inv => {
  const total = computeGrandTotal(inv);
  if (isProformaInvoice(inv)) {
    proformaSum += total;
    proformaCount++;
  } else {
    confirmedSum += total;
    confirmedCount++;
  }
});

// Update Card 1
valueEl.textContent = '₹' + fmtNum(confirmedSum);

// Update Card 2 (new)
proformaValueEl.textContent = '₹' + fmtNum(proformaSum);
proformaPeriodEl.textContent = getInvoiceListSummaryPeriodLabel();

// Update Card 3
countEl.textContent = filtered.length + ' invoice' + (filtered.length !== 1 ? 's' : '');
confirmedCountEl.textContent = confirmedCount;
proformaCountEl.textContent = proformaCount;
```

`isProformaInvoice()` already exists in `script.js` — no new helper needed.

---

## HTML Changes

**File:** `index.html` — `#invTotalPanel`

- Add new `analytics-kpi-card invoice-kpi-card akpi-proforma` div between Card 1 and Card 3.
- Add `#invProformaSummaryPeriod` and `#invProformaSummaryValue` elements inside it.
- Add `#invConfirmedCount` and `#invProformaCount` chip elements inside Card 3.
- Change Card 1 subtitle text from "filtered invoice value" to "confirmed invoices only".

---

## CSS Changes

**File:** `style.css`

- Add `.akpi-proforma` variant (orange gradient, matching the existing `.akpi-revenue` pattern).
- Add `.inv-count-split`, `.inv-count-chip`, `.inv-count-chip.proforma` for the two chips inside Card 3.
- No changes to existing card styles.

---

## Out of Scope

- The invoice list table rows still show all invoices (confirmed + proforma) — no filtering of the table itself.
- No changes to any other views (analytics dashboard, payments, aging).
- No changes to how proforma invoices are identified (`isProformaInvoice()` is unchanged).
