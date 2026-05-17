# GST Tax Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GSTR-1-style GST Tax Report view with KPI cards, filterable invoice table, and PDF/CSV export — computed on-the-fly from existing invoice data.

**Architecture:** New `gstReportView` added to the existing 14-view router. GST values (taxableValue, CGST, SGST, IGST) are computed at render time from `gstRate` + `gstType` + `items[]` already on each invoice. No schema changes, no new Firestore collections. All user-provided string values rendered into HTML must be escaped through the existing `escapeHtml()` helper (script.js:5209).

**Tech Stack:** Vanilla JS, Firestore (via existing `invoices[]` global), html2pdf.js (already loaded), native Blob API for CSV.

---

## File Map

| File | Change |
|------|--------|
| `index.html` | Add nav item (after line 241) + view div (before `</main>` at line 2153) |
| `style.css` | Add `.gr-*` CSS block at end of file |
| `script.js` | Add `cameFromGstReport` flag (line 137), back-button branch (lines 155-178), router entry (line 217), + new functions before closing `});` at line 9339 |

---

## Task 1: HTML — Nav item + view skeleton

**Files:**
- Modify: `index.html:241` (nav item, after vendorReportView nav item)
- Modify: `index.html:2152` (view div, before `</main>`)

- [ ] **Step 1: Add the GST Report nav item**

In `index.html`, after line 241 (`</div>` closing vendorReportView nav item, before line 242 `</div>`), insert:

```html
                <div class="home-nav-item" data-view="gstReportView">
                  <div class="home-nav-item-icon" style="background:linear-gradient(135deg,#6366f1,#4338ca);box-shadow:0 6px 16px rgba(99,102,241,0.35)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8zm0-4h8v2H8zm0-4h5v2H8z"/></svg></div>
                  <div class="home-nav-item-label">GST Report</div>
                </div>
```

- [ ] **Step 2: Add the gstReportView div**

In `index.html`, before `</main>` (line 2153), insert the full view skeleton:

```html
    <div id="gstReportView" class="view hidden">
      <div class="view-header analytics-view-header">
        <button class="btn btn-secondary" id="grBackBtn">&#8592; Back</button>
        <div class="analytics-header-center">
          <div class="analytics-header-icon" style="background:linear-gradient(135deg,#6366f1,#4338ca)">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8zm0-4h8v2H8zm0-4h5v2H8z"/></svg>
          </div>
          <div>
            <h2>GST Tax Report</h2>
            <p class="analytics-header-sub">GSTR-1 style outward supply summary</p>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-secondary btn-sm analytics-dl-btn" id="grCsvBtn">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5z"/></svg>
            CSV
          </button>
          <button class="btn btn-primary btn-sm analytics-dl-btn" id="grPdfBtn">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5z"/></svg>
            PDF
          </button>
        </div>
      </div>

      <!-- Report Hero Banner -->
      <div class="gr-report-header">
        <div class="gr-rh-left">
          <div class="gr-rh-tag">GSTR-1 Style Report</div>
          <div class="gr-rh-title">GST Tax Report</div>
          <div class="gr-rh-sub">Karthick Industries&nbsp;<span class="gr-rh-gstin" id="grGstinChip"></span></div>
        </div>
        <div class="gr-rh-right">
          <div class="gr-period-tabs">
            <button class="gr-period-tab gr-period-tab-active" data-mode="monthly">Monthly</button>
            <button class="gr-period-tab" data-mode="quarterly">Quarterly</button>
            <button class="gr-period-tab" data-mode="yearly">Full FY</button>
          </div>
          <div class="gr-period-nav">
            <button class="gr-nav-arrow" id="grPrevBtn">&#8249;</button>
            <span class="gr-period-label" id="grPeriodLabel">—</span>
            <button class="gr-nav-arrow" id="grNextBtn">&#8250;</button>
          </div>
        </div>
      </div>

      <!-- KPI Grid -->
      <div class="gr-kpi-grid">
        <div class="gr-kpi-card gr-kpi-taxable">
          <div class="gr-kpi-label">Taxable Value</div>
          <div class="gr-kpi-value" id="grKpiTaxable">—</div>
          <div class="gr-kpi-delta gr-delta-neutral" id="grKpiTaxableDelta">&nbsp;</div>
        </div>
        <div class="gr-kpi-card gr-kpi-cgst">
          <div class="gr-kpi-label">CGST Collected</div>
          <div class="gr-kpi-value" id="grKpiCgst">—</div>
          <div class="gr-kpi-delta gr-delta-neutral" id="grKpiCgstDelta">&nbsp;</div>
        </div>
        <div class="gr-kpi-card gr-kpi-sgst">
          <div class="gr-kpi-label">SGST Collected</div>
          <div class="gr-kpi-value" id="grKpiSgst">—</div>
          <div class="gr-kpi-delta gr-delta-neutral" id="grKpiSgstDelta">&nbsp;</div>
        </div>
        <div class="gr-kpi-card gr-kpi-igst">
          <div class="gr-kpi-label">IGST Collected</div>
          <div class="gr-kpi-value" id="grKpiIgst">—</div>
          <div class="gr-kpi-delta gr-delta-neutral" id="grKpiIgstDelta">&nbsp;</div>
        </div>
        <div class="gr-kpi-card gr-kpi-total">
          <div class="gr-kpi-label">Total Tax</div>
          <div class="gr-kpi-value" id="grKpiTotal">—</div>
          <div class="gr-kpi-delta gr-delta-neutral" id="grKpiTotalDelta">&nbsp;</div>
        </div>
        <div class="gr-kpi-card gr-kpi-count">
          <div class="gr-kpi-label">Invoices</div>
          <div class="gr-kpi-value" id="grKpiCount">—</div>
          <div class="gr-kpi-delta gr-delta-neutral" id="grKpiCountSub">&nbsp;</div>
        </div>
      </div>

      <!-- Table Section -->
      <div class="gr-table-section">
        <div class="gr-table-toolbar">
          <div class="gr-seg-control">
            <button class="gr-seg-btn gr-seg-active" data-seg="b2b">B2B Invoices</button>
            <button class="gr-seg-btn" data-seg="b2c">B2C Invoices</button>
            <button class="gr-seg-btn" data-seg="all">All</button>
          </div>
          <div class="gr-toolbar-right">
            <div class="gr-search-wrap">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input type="text" id="grSearch" placeholder="Search party..." class="gr-search-input">
            </div>
          </div>
        </div>
        <div class="gr-table-wrap">
          <table class="gr-table">
            <thead>
              <tr class="gr-thead-row">
                <th class="gr-th gr-th-num">#</th>
                <th class="gr-th">Party &amp; GSTIN</th>
                <th class="gr-th">Invoice No.</th>
                <th class="gr-th">Date</th>
                <th class="gr-th gr-th-right">Taxable (&#8377;)</th>
                <th class="gr-th gr-th-right">CGST / SGST</th>
                <th class="gr-th gr-th-right">IGST</th>
                <th class="gr-th gr-th-right">Action</th>
              </tr>
            </thead>
            <tbody id="grTableBody"></tbody>
            <tfoot id="grTableFoot"></tfoot>
          </table>
        </div>
      </div>

      <!-- Hidden PDF render target -->
      <div id="grPdfContainer" style="display:none;position:absolute;left:-9999px;top:0;width:700px"></div>
    </div>
```

- [ ] **Step 3: Verify HTML structure**

Open the app in a browser. The home screen should show a "GST Report" tile with an indigo icon. Clicking it navigates to the new (blank) view without errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(gst-report): add HTML nav item and view skeleton"
```

---

## Task 2: CSS — All styles

**Files:**
- Modify: `style.css` (append at end of file)

- [ ] **Step 1: Append the full `.gr-*` CSS block**

Add at the very end of `style.css`:

```css
/* ===== GST Report View ===== */
.gr-report-header {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%);
  border-radius: 16px;
  padding: 22px 28px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(99,102,241,0.2);
  position: relative;
  overflow: hidden;
}
.gr-report-header::before {
  content: '';
  position: absolute;
  top: -50px; right: -50px;
  width: 220px; height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%);
  pointer-events: none;
}
.gr-rh-left { position: relative; z-index: 1; }
.gr-rh-tag {
  display: inline-flex;
  align-items: center;
  background: rgba(99,102,241,0.25);
  border: 1px solid rgba(99,102,241,0.4);
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 0.66rem;
  font-weight: 700;
  color: #a5b4fc;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.gr-rh-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.5px;
  margin-bottom: 5px;
}
.gr-rh-sub {
  font-size: 0.85rem;
  color: #93c5fd;
  display: flex;
  align-items: center;
  gap: 10px;
}
.gr-rh-gstin {
  background: rgba(255,255,255,0.1);
  border-radius: 6px;
  padding: 2px 9px;
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: 0.72rem;
  color: #bfdbfe;
  letter-spacing: 0.4px;
}
.gr-rh-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  position: relative;
  z-index: 1;
}
.gr-period-tabs {
  display: flex;
  background: rgba(0,0,0,0.25);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.gr-period-tab {
  padding: 7px 18px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  background: transparent;
  color: rgba(255,255,255,0.55);
}
.gr-period-tab:hover { color: #ffffff; }
.gr-period-tab-active { background: #ffffff; color: #4338ca !important; }
.gr-period-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gr-nav-arrow {
  width: 30px; height: 30px;
  border-radius: 8px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.2);
  color: #ffffff;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  line-height: 1;
}
.gr-nav-arrow:hover { background: rgba(255,255,255,0.22); }
.gr-period-label {
  font-size: 0.88rem;
  font-weight: 700;
  color: #ffffff;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.2);
  padding: 5px 16px;
  border-radius: 8px;
  min-width: 130px;
  text-align: center;
  display: inline-block;
}
.gr-kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}
.gr-kpi-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 18px 14px;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s cubic-bezier(.16,1,.3,1), box-shadow 0.2s;
  box-shadow: var(--shadow);
}
.gr-kpi-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.gr-kpi-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 14px 14px 0 0;
}
.gr-kpi-taxable::before { background: linear-gradient(90deg,#6366f1,#8b5cf6); }
.gr-kpi-cgst::before    { background: linear-gradient(90deg,#06b6d4,#0284c7); }
.gr-kpi-sgst::before    { background: linear-gradient(90deg,#10b981,#059669); }
.gr-kpi-igst::before    { background: linear-gradient(90deg,#f59e0b,#d97706); }
.gr-kpi-total::before   { background: linear-gradient(90deg,#ec4899,#db2777); }
.gr-kpi-count::before   { background: linear-gradient(90deg,#8b5cf6,#7c3aed); }
.gr-kpi-label {
  font-size: 0.64rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 8px;
}
.gr-kpi-value {
  font-size: 1.18rem;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.4px;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gr-kpi-delta {
  font-size: 0.67rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  display: inline-block;
}
.gr-delta-up      { background: rgba(16,185,129,0.10); color: #059669; }
.gr-delta-down    { background: rgba(239,68,68,0.10);  color: #ef4444; }
.gr-delta-neutral { background: rgba(100,116,139,0.10); color: #64748b; }
.gr-table-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow);
  margin-bottom: 24px;
}
.gr-table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: #f8fafc;
  flex-wrap: wrap;
  gap: 10px;
}
.gr-seg-control {
  display: flex;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.gr-seg-btn {
  padding: 7px 18px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  background: transparent;
  color: var(--text-muted);
}
.gr-seg-btn:hover { color: var(--text); }
.gr-seg-active { background: var(--primary); color: #ffffff !important; box-shadow: 0 2px 8px rgba(26,58,92,0.28); }
.gr-toolbar-right { display: flex; align-items: center; gap: 8px; }
.gr-search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 12px;
  color: var(--text-muted);
}
.gr-search-input {
  border: none;
  outline: none;
  font-size: 0.82rem;
  color: var(--text);
  background: transparent;
  width: 160px;
  font-family: inherit;
}
.gr-search-input::placeholder { color: var(--text-muted); }
.gr-table-wrap { overflow-x: auto; }
.gr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.gr-thead-row { background: #f8fafc; }
.gr-th {
  padding: 10px 16px;
  font-size: 0.64rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  text-align: left;
}
.gr-th-right { text-align: right; }
.gr-th-num   { width: 44px; }
.gr-tr { transition: background 0.12s; cursor: pointer; }
.gr-tr:hover { background: rgba(99,102,241,0.04); }
.gr-tr:hover .gr-td-inv { color: #6366f1; }
.gr-td { padding: 11px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.gr-td-num   { color: var(--text-muted); font-size: 0.75rem; font-weight: 600; }
.gr-td-right { text-align: right; }
.gr-party-name { font-size: 0.85rem; font-weight: 600; color: var(--text); margin-bottom: 3px; }
.gr-gstin-chip {
  display: inline-block;
  background: rgba(99,102,241,0.08);
  border: 1px solid rgba(99,102,241,0.2);
  color: #6366f1;
  padding: 1px 7px;
  border-radius: 5px;
  font-size: 0.61rem;
  font-weight: 700;
  font-family: 'SF Mono','Courier New',monospace;
  letter-spacing: 0.3px;
}
.gr-b2c-chip {
  display: inline-block;
  background: rgba(100,116,139,0.08);
  border: 1px solid rgba(100,116,139,0.2);
  color: var(--text-muted);
  padding: 1px 7px;
  border-radius: 5px;
  font-size: 0.61rem;
  font-weight: 700;
}
.gr-td-inv  { font-size: 0.82rem; font-weight: 700; color: #64748b; transition: color 0.12s; }
.gr-td-date { font-size: 0.78rem; color: var(--text-muted); white-space: nowrap; }
.gr-td-cgst { color: #0891b2; font-weight: 600; font-size: 0.84rem; }
.gr-td-igst { color: #d97706; font-weight: 600; font-size: 0.84rem; }
.gr-nil     { color: #cbd5e1; }
.gr-view-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  background: rgba(99,102,241,0.08);
  color: #6366f1;
  border: 1px solid rgba(99,102,241,0.2);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.gr-view-btn:hover { background: rgba(99,102,241,0.16); }
.gr-tfoot-row { background: #f8fafc; }
.gr-tfoot-row td { border-top: 2px solid var(--border); border-bottom: none; }
.gr-tfoot-label { font-size: 0.76rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; }
.gr-tfoot-val     { font-size: 0.9rem; font-weight: 800; }
.gr-tfoot-taxable { color: #6366f1; }
.gr-tfoot-cgst    { color: #0891b2; }
.gr-tfoot-igst    { color: #d97706; }
.gr-empty-msg     { text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 0.9rem; }
@media (max-width: 900px) { .gr-kpi-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 600px) {
  .gr-kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .gr-report-header { flex-direction: column; align-items: flex-start; gap: 16px; }
}
```

- [ ] **Step 2: Verify CSS loads**

Reload the app and navigate to GST Report. The indigo gradient hero banner should render, KPI cards should show as white cards with colored top strips.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat(gst-report): add CSS styles for hero banner, KPI grid, and table"
```

---

## Task 3: JS — Core data functions

**Files:**
- Modify: `script.js` (add before the closing `});` at line 9339)

- [ ] **Step 1: Add the four core data functions**

In `script.js`, immediately before the final `});` at line 9339, insert:

```javascript
  // ── GST Report: core data functions ──────────────────────────────────────

  function computeGstForInvoice(inv) {
    var taxableValue = (inv.items || []).reduce(function(sum, item) {
      return sum + ((parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0));
    }, 0);
    var rate = parseFloat(inv.gstRate) || 0;
    var cgst = 0, sgst = 0, igst = 0;
    if (inv.gstType === 'inter') {
      igst = taxableValue * (rate / 100);
    } else {
      cgst = taxableValue * (rate / 200);
      sgst = taxableValue * (rate / 200);
    }
    return { taxableValue: taxableValue, cgst: cgst, sgst: sgst, igst: igst, totalTax: cgst + sgst + igst };
  }

  function getGstPeriodRange(mode, offset) {
    var now = new Date();
    var start, end, label;
    if (mode === 'monthly') {
      var d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      start = new Date(d.getFullYear(), d.getMonth(), 1);
      end   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      label = start.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    } else if (mode === 'quarterly') {
      var m = now.getMonth();
      var curQtr = m >= 3 ? Math.floor((m - 3) / 3) : 3;
      var curFY  = m >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      var total  = curFY * 4 + curQtr + offset;
      var fy  = Math.floor(total / 4);
      var qtr = ((total % 4) + 4) % 4;
      var qSM = [3, 6, 9, 0][qtr];
      var qEM = [5, 8, 11, 2][qtr];
      var sY  = qtr === 3 ? fy + 1 : fy;
      var eY  = qtr === 3 ? fy + 1 : fy;
      start = new Date(sY, qSM, 1);
      end   = new Date(eY, qEM + 1, 0);
      var qNames = ['Q1 (Apr–Jun)', 'Q2 (Jul–Sep)', 'Q3 (Oct–Dec)', 'Q4 (Jan–Mar)'];
      label = qNames[qtr] + ' FY ' + fy + '–' + String(fy + 1).slice(-2);
    } else {
      var m2 = now.getMonth();
      var fy2 = (m2 >= 3 ? now.getFullYear() : now.getFullYear() - 1) + offset;
      start = new Date(fy2, 3, 1);
      end   = new Date(fy2 + 1, 2, 31);
      label = 'FY ' + fy2 + '–' + String(fy2 + 1).slice(-2);
    }
    return { start: start, end: end, label: label };
  }

  function computeGstReportData(mode, offset) {
    var range     = getGstPeriodRange(mode, offset);
    var prevRange = getGstPeriodRange(mode, offset - 1);
    var sTs  = range.start.getTime();
    var eTs  = range.end.getTime() + 86399999;
    var pSTs = prevRange.start.getTime();
    var pETs = prevRange.end.getTime() + 86399999;

    function enrichAndFilter(startTs, endTs) {
      return (invoices || []).filter(function(inv) {
        if (!inv.invoiceDate) return false;
        var t = new Date(inv.invoiceDate + 'T00:00:00').getTime();
        return t >= startTs && t <= endTs;
      }).map(function(inv) {
        return Object.assign({}, inv, computeGstForInvoice(inv));
      });
    }

    function agg(arr) {
      return arr.reduce(function(a, inv) {
        a.taxableValue += inv.taxableValue; a.cgst += inv.cgst;
        a.sgst += inv.sgst; a.igst += inv.igst;
        a.totalTax += inv.totalTax; a.count++;
        return a;
      }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, count: 0 });
    }

    var curr = enrichAndFilter(sTs, eTs);
    var prev = enrichAndFilter(pSTs, pETs);
    var b2b  = curr.filter(function(inv) { return inv.buyerGstin && inv.buyerGstin.trim(); });
    var b2c  = curr.filter(function(inv) { return !inv.buyerGstin || !inv.buyerGstin.trim(); });

    return {
      invoices: curr, b2b: b2b, b2c: b2c,
      kpi: agg(curr), prevKpi: agg(prev),
      label: range.label, b2bCount: b2b.length, b2cCount: b2c.length
    };
  }

  function gstDeltaBadge(curr, prev) {
    if (!prev) return { text: ' ', cls: 'gr-delta-neutral' };
    var pct = Math.round(((curr - prev) / prev) * 100);
    if (pct > 0) return { text: '↑ ' + pct + '%', cls: 'gr-delta-up' };
    if (pct < 0) return { text: '↓ ' + Math.abs(pct) + '%', cls: 'gr-delta-down' };
    return { text: '0%', cls: 'gr-delta-neutral' };
  }
```

- [ ] **Step 2: Verify functions in console**

Open browser DevTools. Run:
```javascript
computeGstForInvoice({ items: [{qty:10,rate:100}], gstRate: 18, gstType: 'intra' })
```
Expected: `{ taxableValue: 1000, cgst: 90, sgst: 90, igst: 0, totalTax: 180 }`

Run:
```javascript
computeGstForInvoice({ items: [{qty:5,rate:200}], gstRate: 18, gstType: 'inter' })
```
Expected: `{ taxableValue: 1000, cgst: 0, sgst: 0, igst: 180, totalTax: 180 }`

Run:
```javascript
getGstPeriodRange('monthly', 0).label
```
Expected: current month name + year, e.g. `"May 2026"`

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat(gst-report): add core GST computation and period range functions"
```

---

## Task 4: JS — State variables + render function

**Files:**
- Modify: `script.js` (add after Task 3 functions, before closing `});`)

**Note:** All user-provided string data (`buyerName`, `buyerGstin`, `invoiceNumber`) is passed through the existing `escapeHtml()` helper (script.js:5209) before being placed into DOM node text content — never raw into innerHTML attribute values.

- [ ] **Step 1: Add state variables and render function**

After the Task 3 functions (before the closing `});`), add:

```javascript
  // ── GST Report: state + render ────────────────────────────────────────────

  var grPeriodMode   = 'monthly';
  var grPeriodOffset = 0;
  var grSegment      = 'b2b';

  function renderGstReport() {
    var data = computeGstReportData(grPeriodMode, grPeriodOffset);

    // Period label + tab active state
    $('grPeriodLabel').textContent = data.label;
    document.querySelectorAll('#gstReportView .gr-period-tab').forEach(function(btn) {
      btn.classList.toggle('gr-period-tab-active', btn.dataset.mode === grPeriodMode);
    });

    // KPI values
    function setKpi(valId, deltaId, curr, prev) {
      $(valId).textContent = '₹' + fmtNum(curr);
      var d = gstDeltaBadge(curr, prev);
      $(deltaId).textContent = d.text;
      $(deltaId).className = 'gr-kpi-delta ' + d.cls;
    }
    setKpi('grKpiTaxable', 'grKpiTaxableDelta', data.kpi.taxableValue, data.prevKpi.taxableValue);
    setKpi('grKpiCgst',    'grKpiCgstDelta',    data.kpi.cgst,         data.prevKpi.cgst);
    setKpi('grKpiSgst',    'grKpiSgstDelta',    data.kpi.sgst,         data.prevKpi.sgst);
    setKpi('grKpiIgst',    'grKpiIgstDelta',    data.kpi.igst,         data.prevKpi.igst);
    setKpi('grKpiTotal',   'grKpiTotalDelta',   data.kpi.totalTax,     data.prevKpi.totalTax);
    $('grKpiCount').textContent = String(data.kpi.count);
    $('grKpiCountSub').textContent = 'B2B: ' + data.b2bCount + ' · B2C: ' + data.b2cCount;
    $('grKpiCountSub').className = 'gr-kpi-delta gr-delta-neutral';

    // Segment active state
    document.querySelectorAll('#gstReportView .gr-seg-btn').forEach(function(btn) {
      btn.classList.toggle('gr-seg-active', btn.dataset.seg === grSegment);
    });

    // Get rows for active segment + search
    var segRows = grSegment === 'b2b' ? data.b2b : grSegment === 'b2c' ? data.b2c : data.invoices;
    var q = ($('grSearch').value || '').trim().toLowerCase();
    var rows = q ? segRows.filter(function(inv) {
      return (inv.buyerName   || '').toLowerCase().indexOf(q) !== -1 ||
             (inv.buyerGstin  || '').toLowerCase().indexOf(q) !== -1;
    }) : segRows;
    rows = rows.slice().sort(function(a, b) {
      return new Date(b.invoiceDate + 'T00:00:00') - new Date(a.invoiceDate + 'T00:00:00');
    });

    // Render tbody using safe DOM construction (no user data in innerHTML)
    var tbody = $('grTableBody');
    tbody.innerHTML = '';

    if (rows.length === 0) {
      var emptyTr = document.createElement('tr');
      var emptyTd = document.createElement('td');
      emptyTd.colSpan = 8;
      emptyTd.className = 'gr-empty-msg';
      emptyTd.textContent = 'No invoices found for this period.';
      emptyTr.appendChild(emptyTd);
      tbody.appendChild(emptyTr);
    } else {
      rows.forEach(function(inv, i) {
        var tr = document.createElement('tr');
        tr.className = 'gr-tr';

        // # cell
        var tdNum = document.createElement('td');
        tdNum.className = 'gr-td gr-td-num';
        tdNum.textContent = String(i + 1);
        tr.appendChild(tdNum);

        // Party & GSTIN cell
        var tdParty = document.createElement('td');
        tdParty.className = 'gr-td';
        var nameDiv = document.createElement('div');
        nameDiv.className = 'gr-party-name';
        nameDiv.textContent = inv.buyerName || '—';
        tdParty.appendChild(nameDiv);
        var chip = document.createElement('span');
        if (inv.buyerGstin && inv.buyerGstin.trim()) {
          chip.className = 'gr-gstin-chip';
          chip.textContent = inv.buyerGstin;
        } else {
          chip.className = 'gr-b2c-chip';
          chip.textContent = 'B2C';
        }
        tdParty.appendChild(chip);
        tr.appendChild(tdParty);

        // Invoice No. cell
        var tdInv = document.createElement('td');
        tdInv.className = 'gr-td gr-td-inv';
        tdInv.textContent = inv.invoiceNumber || inv.id || '—';
        tr.appendChild(tdInv);

        // Date cell
        var tdDate = document.createElement('td');
        tdDate.className = 'gr-td gr-td-date';
        tdDate.textContent = formatShortDate(inv.invoiceDate);
        tr.appendChild(tdDate);

        // Taxable cell
        var tdTax = document.createElement('td');
        tdTax.className = 'gr-td gr-td-right';
        tdTax.textContent = '₹' + fmtNum(inv.taxableValue);
        tr.appendChild(tdTax);

        // CGST/SGST cell
        var tdCgst = document.createElement('td');
        tdCgst.className = 'gr-td gr-td-right';
        if (inv.gstType === 'inter') {
          tdCgst.innerHTML = '<span class="gr-nil">—</span>';
        } else {
          tdCgst.className += ' gr-td-cgst';
          tdCgst.textContent = '₹' + fmtNum(inv.cgst) + ' each';
        }
        tr.appendChild(tdCgst);

        // IGST cell
        var tdIgst = document.createElement('td');
        tdIgst.className = 'gr-td gr-td-right';
        if (inv.gstType === 'inter') {
          tdIgst.className += ' gr-td-igst';
          tdIgst.textContent = '₹' + fmtNum(inv.igst);
        } else {
          tdIgst.innerHTML = '<span class="gr-nil">—</span>';
        }
        tr.appendChild(tdIgst);

        // Action cell
        var tdAction = document.createElement('td');
        tdAction.className = 'gr-td gr-td-right';
        var viewBtn = document.createElement('button');
        viewBtn.className = 'gr-view-btn';
        viewBtn.dataset.id = inv.id;
        viewBtn.textContent = 'View ↗';
        tdAction.appendChild(viewBtn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
      });
    }

    // Render tfoot totals
    var tfoot = $('grTableFoot');
    tfoot.innerHTML = '';
    var totTaxable = rows.reduce(function(s, r) { return s + r.taxableValue; }, 0);
    var totCgst    = rows.reduce(function(s, r) { return s + r.cgst; }, 0);
    var totIgst    = rows.reduce(function(s, r) { return s + r.igst; }, 0);

    var tfTr = document.createElement('tr');
    tfTr.className = 'gr-tfoot-row';

    var cells = [
      { cls: 'gr-td gr-td-num', text: '' },
      { cls: 'gr-td gr-tfoot-label', text: 'Total (' + rows.length + ' invoice' + (rows.length !== 1 ? 's' : '') + ')' },
      { cls: 'gr-td', text: '' },
      { cls: 'gr-td', text: '' },
      { cls: 'gr-td gr-td-right gr-tfoot-val gr-tfoot-taxable', text: '₹' + fmtNum(totTaxable) },
      { cls: 'gr-td gr-td-right gr-tfoot-val gr-tfoot-cgst',    text: '₹' + fmtNum(totCgst)    },
      { cls: 'gr-td gr-td-right gr-tfoot-val gr-tfoot-igst',    text: '₹' + fmtNum(totIgst)    },
      { cls: 'gr-td', text: '' }
    ];
    cells.forEach(function(c) {
      var td = document.createElement('td');
      td.className = c.cls;
      td.textContent = c.text;
      tfTr.appendChild(td);
    });
    tfoot.appendChild(tfTr);
  }
```

- [ ] **Step 2: Commit**

```bash
git add script.js
git commit -m "feat(gst-report): add state variables and renderGstReport function"
```

---

## Task 5: JS — Event wiring

**Files:**
- Modify: `script.js:137` — add `cameFromGstReport` flag
- Modify: `script.js:172-178` — add branch in `invBackBtn` handler
- Modify: `script.js:217` — add router entry
- Modify: `script.js` before closing `});` — add event listeners + `viewInvoiceFromGstReport`

- [ ] **Step 1: Add `cameFromGstReport` flag**

Find (lines 133–137):
```javascript
  let cameFromInvoiceList = false;
  let cameFromPayment = false;
  let cameFromVendorPayment = false;
  let cameFromAgingReport = false;
  let cameFromCrDrawer = false;
```

Replace with:
```javascript
  let cameFromInvoiceList = false;
  let cameFromPayment = false;
  let cameFromVendorPayment = false;
  let cameFromAgingReport = false;
  let cameFromCrDrawer = false;
  let cameFromGstReport = false;
```

- [ ] **Step 2: Add `cameFromGstReport` branch in back button handler**

Find this exact block (lines 172–178):
```javascript
    } else if (cameFromInvoiceList) {
      cameFromInvoiceList = false;
      showView('invoiceListView');
      renderInvoiceList();
    } else {
      goHome();
    }
```

Replace with:
```javascript
    } else if (cameFromInvoiceList) {
      cameFromInvoiceList = false;
      showView('invoiceListView');
      renderInvoiceList();
    } else if (cameFromGstReport) {
      cameFromGstReport = false;
      showView('gstReportView');
      renderGstReport();
    } else {
      goHome();
    }
```

- [ ] **Step 3: Add router entry**

Find (line 217):
```javascript
      if (v === 'vendorReportView')      renderVendorReport();
```

Add immediately after:
```javascript
      if (v === 'gstReportView')         renderGstReport();
```

- [ ] **Step 4: Add event listeners and `viewInvoiceFromGstReport`**

Before the final `});`, add:

```javascript
  // ── GST Report: navigation + interaction events ───────────────────────────

  function viewInvoiceFromGstReport(id) {
    var inv = invoices.find(function(x) { return x.id === id; });
    if (!inv) return;
    cameFromGstReport = true;
    loadInvoiceIntoForm(inv);
    syncCopyChecks('copyType', 'copyTypePreview');
    buildAllInvoices();
    showView('invoiceView');
    $('formPanel').classList.add('hidden');
    $('previewPanel').classList.remove('hidden');
  }

  $('grBackBtn').addEventListener('click', function() { goHome(); });

  document.querySelectorAll('#gstReportView .gr-period-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      grPeriodMode = btn.dataset.mode;
      grPeriodOffset = 0;
      renderGstReport();
    });
  });

  $('grPrevBtn').addEventListener('click', function() { grPeriodOffset--; renderGstReport(); });
  $('grNextBtn').addEventListener('click', function() { grPeriodOffset++; renderGstReport(); });

  document.querySelectorAll('#gstReportView .gr-seg-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      grSegment = btn.dataset.seg;
      renderGstReport();
    });
  });

  $('grSearch').addEventListener('input', function() { renderGstReport(); });

  $('grTableBody').addEventListener('click', function(e) {
    var btn = e.target.closest('.gr-view-btn');
    if (btn) viewInvoiceFromGstReport(btn.dataset.id);
  });
```

- [ ] **Step 5: Verify navigation end-to-end**

Reload app. Test:
1. Home → GST Report tile → report loads with current month data
2. Monthly → Quarterly → Full FY tabs switch period
3. Prev/Next arrows change period label
4. B2B / B2C / All segment filters table
5. Search filters by party name
6. Back button → returns to home
7. "View ↗" on a row → opens invoice preview; pressing Back there → returns to GST report

- [ ] **Step 6: Commit**

```bash
git add script.js
git commit -m "feat(gst-report): wire navigation, router, period/segment/search events, and invoice drill-through"
```

---

## Task 6: JS — CSV export

**Files:**
- Modify: `script.js` (add before closing `});`)

- [ ] **Step 1: Add `downloadGstCsv` and wire button**

Before the final `});`, add:

```javascript
  // ── GST Report: CSV export ────────────────────────────────────────────────

  function downloadGstCsv(data) {
    var segRows = grSegment === 'b2b' ? data.b2b : grSegment === 'b2c' ? data.b2c : data.invoices;
    var q = ($('grSearch').value || '').trim().toLowerCase();
    var rows = q ? segRows.filter(function(inv) {
      return (inv.buyerName  || '').toLowerCase().indexOf(q) !== -1 ||
             (inv.buyerGstin || '').toLowerCase().indexOf(q) !== -1;
    }) : segRows;
    rows = rows.slice().sort(function(a, b) {
      return new Date(b.invoiceDate + 'T00:00:00') - new Date(a.invoiceDate + 'T00:00:00');
    });

    var headers = [
      'Invoice No', 'Invoice Date', 'Party Name', 'Party GSTIN',
      'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax', 'GST Rate %', 'GST Type'
    ];
    var lines = [headers.join(',')];
    rows.forEach(function(inv) {
      var cols = [
        inv.invoiceNumber || inv.id || '',
        inv.invoiceDate   || '',
        '"' + (inv.buyerName  || '').replace(/"/g, '""') + '"',
        '"' + (inv.buyerGstin || '').replace(/"/g, '""') + '"',
        inv.taxableValue.toFixed(2),
        inv.cgst.toFixed(2),
        inv.sgst.toFixed(2),
        inv.igst.toFixed(2),
        inv.totalTax.toFixed(2),
        inv.gstRate  || '',
        inv.gstType  || ''
      ];
      lines.push(cols.join(','));
    });

    var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'GST_Report_' + data.label.replace(/[^a-zA-Z0-9\-]/g, '_') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  $('grCsvBtn').addEventListener('click', function() {
    downloadGstCsv(computeGstReportData(grPeriodMode, grPeriodOffset));
  });
```

- [ ] **Step 2: Verify CSV export**

Click the CSV button. A file `GST_Report_<period>.csv` should download. Open it in a spreadsheet and verify:
- 11 columns with correct headers
- Intra-state rows: CGST/SGST have values, IGST is `0.00`
- Inter-state rows: IGST has a value, CGST/SGST are `0.00`

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat(gst-report): add CSV export with period and segment filtering"
```

---

## Task 7: JS — PDF export

**Files:**
- Modify: `script.js` (add before closing `});`)

- [ ] **Step 1: Add `downloadGstPdf` async function and wire button**

Before the final `});`, add:

```javascript
  // ── GST Report: PDF export ────────────────────────────────────────────────

  async function downloadGstPdf(data) {
    var segRows = grSegment === 'b2b' ? data.b2b : grSegment === 'b2c' ? data.b2c : data.invoices;
    var q = ($('grSearch').value || '').trim().toLowerCase();
    var rows = q ? segRows.filter(function(inv) {
      return (inv.buyerName  || '').toLowerCase().indexOf(q) !== -1 ||
             (inv.buyerGstin || '').toLowerCase().indexOf(q) !== -1;
    }) : segRows;
    rows = rows.slice().sort(function(a, b) {
      return new Date(b.invoiceDate + 'T00:00:00') - new Date(a.invoiceDate + 'T00:00:00');
    });

    var totTaxable = rows.reduce(function(s, r) { return s + r.taxableValue; }, 0);
    var totCgst    = rows.reduce(function(s, r) { return s + r.cgst; }, 0);
    var totSgst    = rows.reduce(function(s, r) { return s + r.sgst; }, 0);
    var totIgst    = rows.reduce(function(s, r) { return s + r.igst; }, 0);
    var totTax     = totCgst + totSgst + totIgst;

    var segLabel = grSegment === 'b2b' ? 'B2B Invoices' : grSegment === 'b2c' ? 'B2C Invoices' : 'All Invoices';
    var th  = 'padding:7px 10px;background:#1a3a5c;color:#fff;font-size:11px;font-weight:700;text-align:left;white-space:nowrap;';
    var thR = th + 'text-align:right;';
    var td  = 'padding:6px 10px;font-size:11px;border-bottom:1px solid #e2e6ed;color:#1e293b;';
    var tdR = td + 'text-align:right;';
    var tfS = td + 'font-weight:800;background:#f4f6f9;border-top:2px solid #1a3a5c;border-bottom:none;';
    var tfR = tfS + 'text-align:right;';

    // Build table rows using a DocumentFragment to avoid XSS
    var table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;margin-bottom:14px';

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    [['#',th],['Party & GSTIN',th],['Invoice No.',th],['Date',th],['Taxable (₹)',thR],['CGST / SGST',thR],['IGST',thR]].forEach(function(col) {
      var th2 = document.createElement('th');
      th2.style.cssText = col[1];
      th2.textContent = col[0];
      headRow.appendChild(th2);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody2 = document.createElement('tbody');
    rows.forEach(function(inv, i) {
      var row = document.createElement('tr');
      var cgstTxt = inv.gstType === 'inter' ? '—' : '₹' + fmtNum(inv.cgst) + ' each';
      var igstTxt = inv.gstType === 'inter' ? '₹' + fmtNum(inv.igst) : '—';
      var partyHtml = (inv.buyerName || '—');
      var gstinSuffix = inv.buyerGstin ? ' (' + inv.buyerGstin + ')' : '';
      [
        [String(i + 1), td],
        [partyHtml + gstinSuffix, td],
        [inv.invoiceNumber || inv.id || '—', td],
        [formatShortDate(inv.invoiceDate), td],
        ['₹' + fmtNum(inv.taxableValue), tdR],
        [cgstTxt, tdR],
        [igstTxt, tdR]
      ].forEach(function(col) {
        var cell = document.createElement('td');
        cell.style.cssText = col[1];
        cell.textContent = col[0];
        row.appendChild(cell);
      });
      tbody2.appendChild(row);
    });
    table.appendChild(tbody2);

    var tfoot2 = document.createElement('tfoot');
    var totRow = document.createElement('tr');
    [
      ['Total (' + rows.length + ' invoice' + (rows.length !== 1 ? 's' : '') + ')', tfS, 4],
      ['₹' + fmtNum(totTaxable), tfR, 1],
      ['₹' + fmtNum(totCgst), tfR, 1],
      ['₹' + fmtNum(totIgst), tfR, 1]
    ].forEach(function(col) {
      var cell = document.createElement('td');
      cell.style.cssText = col[1];
      cell.colSpan = col[2];
      cell.textContent = col[0];
      totRow.appendChild(cell);
    });
    tfoot2.appendChild(totRow);
    table.appendChild(tfoot2);

    // Assemble full container
    var container = $('grPdfContainer');
    container.innerHTML = '';
    container.style.display = 'block';

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'font-family:Inter,system-ui,sans-serif;padding:20px;background:#fff';

    var header = document.createElement('div');
    header.style.cssText = 'background:linear-gradient(135deg,#1a3a5c,#2d5a87);color:#fff;padding:16px 22px;border-radius:10px;margin-bottom:18px';
    var tagLine = document.createElement('div');
    tagLine.style.cssText = 'font-size:10px;color:#93c5fd;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px';
    tagLine.textContent = 'GSTR-1 Style Report';
    var titleLine = document.createElement('div');
    titleLine.style.cssText = 'font-size:18px;font-weight:800';
    titleLine.textContent = 'GST Tax Report';
    var subLine = document.createElement('div');
    subLine.style.cssText = 'font-size:11px;color:#bfdbfe;margin-top:3px';
    subLine.textContent = 'Karthick Industries  ·  ' + data.label + '  ·  ' + segLabel;
    header.appendChild(tagLine);
    header.appendChild(titleLine);
    header.appendChild(subLine);

    var footer = document.createElement('div');
    footer.style.cssText = 'font-size:10px;color:#94a3b8;border-top:1px solid #e2e6ed;padding-top:8px';
    footer.textContent = 'Total Tax Collected: ₹' + fmtNum(totTax) + '  |  Generated: ' + new Date().toLocaleDateString('en-IN');

    wrapper.appendChild(header);
    wrapper.appendChild(table);
    wrapper.appendChild(footer);
    container.appendChild(wrapper);

    var fname = 'GST_Report_' + data.label.replace(/[^a-zA-Z0-9\-]/g, '_') + '.pdf';
    var opt = Object.assign({}, PDF_OPT, {
      margin: [0.35, 0.42, 0.35, 0.42],
      html2canvas: Object.assign({}, PDF_OPT.html2canvas, { scale: 1.65, scrollX: 0, scrollY: 0 }),
      filename: fname
    });
    try {
      await html2pdf().set(opt).from(container).save();
    } finally {
      container.style.display = 'none';
      container.innerHTML = '';
    }
  }

  $('grPdfBtn').addEventListener('click', async function() {
    await downloadGstPdf(computeGstReportData(grPeriodMode, grPeriodOffset));
  });
```

- [ ] **Step 2: Verify PDF export**

Click the PDF button. A `GST_Report_<period>.pdf` file should download. Open it and verify:
- Branded indigo gradient header with "Karthick Industries · period · segment"
- Table with correct columns and formatting
- Totals row at the bottom
- No sidebar, no toolbar, no action buttons

- [ ] **Step 3: Full end-to-end smoke test**

Verify all success criteria from the spec:
- [ ] Monthly / Quarterly / Full FY period filter changes data correctly
- [ ] CGST/SGST shown for intra-state; IGST for inter-state; "—" for inapplicable
- [ ] B2B/B2C split based on `buyerGstin` presence
- [ ] KPI delta badges show correct direction vs previous period
- [ ] Search filters by party name and GSTIN
- [ ] "View ↗" opens correct invoice; Back returns to GST report
- [ ] CSV downloads with all 11 columns and correct values
- [ ] PDF renders cleanly with no UI chrome

- [ ] **Step 4: Final commit**

```bash
git add script.js
git commit -m "feat(gst-report): add PDF export and complete GST tax report feature"
```
