# Proforma KPI Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Total Amount KPI card into confirmed-only and proforma-only values, and add confirmed/proforma count chips to the invoice count card.

**Architecture:** Three targeted edits across `style.css`, `index.html`, and `script.js` — no new files. The existing `isProformaInvoice()` helper is reused. `renderInvoiceList()` accumulates four counters (confirmedSum, proformaSum, confirmedCount, proformaCount) in a single pass through the filtered array.

**Tech Stack:** Vanilla HTML5 / CSS3 / JavaScript (ES6). No build step, no test runner — verification is manual in-browser.

---

## File Map

| File | Change |
|------|--------|
| `style.css` | Add `.akpi-proforma` gradient card variant + `.inv-count-split` / `.inv-count-chip` chip styles |
| `index.html` | Add proforma KPI card between Card 1 and Card 3; update Card 1 subtitle; add count chips inside Card 3 |
| `script.js` | Update `renderInvoiceList()` to split confirmed vs proforma sums and counts (lines 1055–1085) |
| `.gitignore` | Add `.superpowers/` entry |

---

## Task 1: Housekeeping — add `.superpowers/` to `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the entry**

Open `.gitignore` and append `.superpowers/` on a new line.

Current content:
```
.worktrees/
```

New content:
```
.worktrees/
.superpowers/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers/ directory"
```

---

## Task 2: CSS — proforma card gradient + count chip styles

**Files:**
- Modify: `style.css` (after line 2438, after the `.akpi-revenue-blue:hover` block)

- [ ] **Step 1: Add the new CSS block**

Insert the following immediately after the `.akpi-revenue-blue:hover { … }` closing brace (after line 2438 in `style.css`):

```css
/* Proforma card — orange gradient */
.akpi-proforma {
  background: linear-gradient(145deg, #c2410c 0%, #ea580c 50%, #f97316 100%);
  border-color: rgba(255,255,255,0.25);
  box-shadow: 0 8px 36px rgba(234,88,12,0.38), 0 1px 0 rgba(255,255,255,0.3) inset;
}
.akpi-proforma:hover {
  box-shadow: 0 22px 52px rgba(234,88,12,0.55), 0 1px 0 rgba(255,255,255,0.4) inset;
  transform: translateY(-7px) scale(1.02);
}
.akpi-proforma .akpi-label { color: rgba(255,255,255,0.72); }
.akpi-proforma .akpi-value { color: #fff; text-shadow: 0 2px 12px rgba(0,0,0,0.18); }
.akpi-proforma .akpi-sub   { color: rgba(255,255,255,0.70); }
.akpi-proforma .inv-total-panel-period { color: rgba(255,255,255,0.60); }

/* Count chip split inside the invoice count card */
.inv-count-split {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.inv-count-chip {
  flex: 1;
  background: rgba(99,102,241,0.07);
  border: 1px solid rgba(99,102,241,0.15);
  border-radius: 10px;
  padding: 6px 8px;
  text-align: center;
}
.inv-count-chip-val {
  display: block;
  font-size: 16px;
  font-weight: 800;
  color: #4f46e5;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.inv-count-chip-label {
  font-size: 9.5px;
  font-weight: 600;
  color: #7a6a9a;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.inv-count-chip.proforma {
  background: rgba(234,88,12,0.07);
  border-color: rgba(234,88,12,0.18);
}
.inv-count-chip.proforma .inv-count-chip-val { color: #c2410c; }
```

- [ ] **Step 2: Open `index.html` in browser and verify no visual regressions**

Open `index.html` in Chrome/Safari. Go to the Invoice List view. The existing two KPI cards should look exactly the same as before — CSS is additive at this point, no HTML has changed yet.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat(kpi): add proforma card and count chip CSS styles"
```

---

## Task 3: HTML — add proforma card and count chips

**Files:**
- Modify: `index.html` lines 995–1008

- [ ] **Step 1: Replace the `#invTotalPanel` block**

Find this existing block (lines 995–1008 of `index.html`):

```html
      <div class="invoice-kpi-row" id="invTotalPanel">
        <div class="analytics-kpi-card invoice-kpi-card">
          <div class="akpi-label">Total Amount</div>
          <div class="inv-total-panel-period" id="invTotalSummaryPeriod">All dates</div>
          <div class="akpi-value" id="invTotalSummaryValue">&#8377;0.00</div>
          <div class="akpi-sub">filtered invoice value</div>
        </div>
        <div class="analytics-kpi-card invoice-kpi-card invoice-kpi-count-card">
          <div class="akpi-label">Total Invoices</div>
          <div class="akpi-value" id="invTotalSummaryCount">0 invoices</div>
          <div class="akpi-sub">matching current filters</div>
          <div class="inv-total-panel-hint">Uses search + date range filters.</div>
        </div>
      </div>
```

Replace it with:

```html
      <div class="invoice-kpi-row" id="invTotalPanel">
        <div class="analytics-kpi-card invoice-kpi-card akpi-revenue">
          <div class="akpi-label">Total Amount</div>
          <div class="inv-total-panel-period" id="invTotalSummaryPeriod">All dates</div>
          <div class="akpi-value" id="invTotalSummaryValue">&#8377;0.00</div>
          <div class="akpi-sub">confirmed invoices only</div>
        </div>
        <div class="analytics-kpi-card invoice-kpi-card akpi-proforma">
          <div class="akpi-label">Proforma Value</div>
          <div class="inv-total-panel-period" id="invProformaSummaryPeriod">All dates</div>
          <div class="akpi-value" id="invProformaSummaryValue">&#8377;0.00</div>
          <div class="akpi-sub">proforma invoices</div>
        </div>
        <div class="analytics-kpi-card invoice-kpi-card invoice-kpi-count-card">
          <div class="akpi-label">Total Invoices</div>
          <div class="akpi-value" id="invTotalSummaryCount">0 invoices</div>
          <div class="akpi-sub">matching current filters</div>
          <div class="inv-count-split">
            <div class="inv-count-chip">
              <span class="inv-count-chip-val" id="invConfirmedCount">0</span>
              <span class="inv-count-chip-label">Confirmed</span>
            </div>
            <div class="inv-count-chip proforma">
              <span class="inv-count-chip-val" id="invProformaCount">0</span>
              <span class="inv-count-chip-label">Proforma</span>
            </div>
          </div>
          <div class="inv-total-panel-hint">Uses search + date range filters.</div>
        </div>
      </div>
```

- [ ] **Step 2: Open in browser and verify layout**

Reload `index.html`. Go to Invoice List view. You should see three KPI cards:
- Purple "Total Amount" card (values still ₹0.00 until JS is wired up in Task 4)
- Orange "Proforma Value" card (₹0.00)
- White "Total Invoices" card with two chips: "0 Confirmed" and "0 Proforma"

All three cards should be visible, properly styled, and responsive.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(kpi): add proforma value card and count chips to invoice KPI row"
```

---

## Task 4: JS — wire up the proforma split in `renderInvoiceList()`

**Files:**
- Modify: `script.js` lines 1054–1085

- [ ] **Step 1: Replace the accumulation and KPI update block**

In `script.js`, find `renderInvoiceList()`. Locate the section that starts with:

```js
    const fragment = document.createDocumentFragment();
    let sum = 0;
    filtered.forEach(inv => {
```

And ends with:

```js
    if (countEl) {
      countEl.textContent = filtered.length + ' invoice' + (filtered.length !== 1 ? 's' : '');
    }
  }
```

Replace **only** the `let sum = 0;` line and the KPI-update block at the bottom. The `tr` building code (the `tr.innerHTML = ...` row template) stays exactly as-is — do not touch it.

**Change the opening accumulator declaration** from:
```js
    let sum = 0;
```
To:
```js
    let confirmedSum = 0;
    let proformaSum = 0;
    let confirmedCount = 0;
    let proformaCount = 0;
```

**Inside the `filtered.forEach` callback**, replace `sum += total;` with:
```js
      if (isProformaInvoice(inv)) {
        proformaSum += total;
        proformaCount++;
      } else {
        confirmedSum += total;
        confirmedCount++;
      }
```

**Replace the KPI update block** at the bottom of `renderInvoiceList()` (after `tbody.appendChild(fragment)`). From:
```js
    const periodEl = $('invTotalSummaryPeriod');
    const valueEl = $('invTotalSummaryValue');
    const countEl = $('invTotalSummaryCount');
    if (periodEl) periodEl.textContent = getInvoiceListSummaryPeriodLabel();
    if (valueEl) valueEl.textContent = '₹' + fmtNum(sum);
    if (countEl) {
      countEl.textContent = filtered.length + ' invoice' + (filtered.length !== 1 ? 's' : '');
    }
```

To:
```js
    const periodLabel = getInvoiceListSummaryPeriodLabel();
    const periodEl = $('invTotalSummaryPeriod');
    const valueEl = $('invTotalSummaryValue');
    const proformaPeriodEl = $('invProformaSummaryPeriod');
    const proformaValueEl = $('invProformaSummaryValue');
    const countEl = $('invTotalSummaryCount');
    const confirmedCountEl = $('invConfirmedCount');
    const proformaCountEl = $('invProformaCount');
    if (periodEl) periodEl.textContent = periodLabel;
    if (valueEl) valueEl.textContent = '₹' + fmtNum(confirmedSum);
    if (proformaPeriodEl) proformaPeriodEl.textContent = periodLabel;
    if (proformaValueEl) proformaValueEl.textContent = '₹' + fmtNum(proformaSum);
    if (countEl) {
      countEl.textContent = filtered.length + ' invoice' + (filtered.length !== 1 ? 's' : '');
    }
    if (confirmedCountEl) confirmedCountEl.textContent = confirmedCount;
    if (proformaCountEl) proformaCountEl.textContent = proformaCount;
```

- [ ] **Step 2: Reload and verify with real data**

Reload `index.html`. Go to Invoice List view. Verify these four scenarios:

1. **No date filter:** All three cards show real numbers. "Total Amount" must not include any proforma invoice totals. "Proforma Value" shows the proforma-only sum. Confirmed chip + Proforma chip count = Total Invoices count.

2. **Date filter applied (e.g. "This month"):** Both amount cards reflect only invoices in that date range. Period label on both cards reads "This month".

3. **No proforma invoices in filtered set:** "Proforma Value" shows ₹0.00, Proforma chip shows 0. "Total Amount" matches the old combined total.

4. **All invoices are proforma:** "Total Amount" shows ₹0.00, Proforma chip count equals total count.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat(kpi): split confirmed vs proforma totals and counts in invoice KPI row"
```
