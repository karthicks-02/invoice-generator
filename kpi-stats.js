/**
 * kpi-stats.js  v6  —  Live KPI dashboard for Karthick Industries
 *
 * Polling-first: checks every 300ms until auth.currentUser is set
 * AND homePanel is visible. Errors written directly to DOM for diagnosis.
 */
(function () {
  'use strict';

  /* ── Date / greeting labels ──────────────────────────────── */
  var homeDateEl = document.getElementById('homeDate');
  if (homeDateEl) {
    homeDateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
  var kpiMonthEl = document.getElementById('kpiMonthName');
  if (kpiMonthEl) {
    kpiMonthEl.textContent = new Date().toLocaleDateString('en-IN', {
      month: 'long', year: 'numeric'
    });
  }
  var h1 = document.querySelector('.home-greeting-h1');
  if (h1) {
    var hr = new Date().getHours();
    var greet = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
    var emoji  = hr < 12 ? '\uD83D\uDC4B' : hr < 17 ? '\u2600\uFE0F' : '\uD83C\uDF19';
    var nodes  = h1.childNodes;
    if (nodes[0] && nodes[0].nodeType === 3) nodes[0].textContent = greet + ', ';
    if (nodes[2] && nodes[2].nodeType === 3) nodes[2].textContent = ' ' + emoji;
  }

  /* ── State ───────────────────────────────────────────────── */
  var loaded = false;

  /* ── DOM helpers ─────────────────────────────────────────── */
  var KPI_IDS = ['kpiRevenue', 'kpiOutstanding', 'kpiThisMonth', 'kpiInvoiceCount'];

  function setKpiText(id, text) {
    var e = document.getElementById(id);
    if (e) { e.classList.remove('kpi-loading'); e.textContent = text; }
  }

  function shimmer(on) {
    KPI_IDS.forEach(function (id) {
      var e = document.getElementById(id);
      if (e) e.classList[on ? 'add' : 'remove']('kpi-loading');
    });
  }

  /* ── Invoice total from stored fields ────────────────────── */
  function calcTotal(inv) {
    var sub = (inv.items || []).reduce(function (s, it) {
      return s + Math.round(Number(it.qty) || 0) * (Number(it.rate) || 0);
    }, 0);
    var r   = parseFloat(inv.gstRate) || 0;
    var tax = (inv.gstType === 'cgst') ? sub * (r / 100) * 2 : sub * (r / 100);
    return Math.round(sub + tax);
  }

  /* ── Money formatter ─────────────────────────────────────── */
  function fmtMoney(v) {
    v = Math.round(v);
    if (v >= 10000000) return '\u20B9' + (v / 10000000).toFixed(2) + 'Cr';
    if (v >= 100000)   return '\u20B9' + (v / 100000).toFixed(2) + 'L';
    if (v >= 1000)     return '\u20B9' + (v / 1000).toFixed(1) + 'K';
    return '\u20B9' + v.toLocaleString('en-IN');
  }

  /* ── Animated counter ────────────────────────────────────── */
  function countUp(id, target, fmtr, ms) {
    var e = document.getElementById(id);
    if (!e) return;
    e.classList.remove('kpi-loading');
    var steps = Math.max(1, Math.ceil(ms / 16));
    var inc = target / steps, cur = 0;
    var t = setInterval(function () {
      cur = Math.min(cur + inc, target);
      e.textContent = fmtr ? fmtr(cur) : Math.round(cur).toString();
      if (cur >= target) clearInterval(t);
    }, 16);
  }

  /* ── Core data fetch ─────────────────────────────────────── */
  function doLoad(uid) {
    shimmer(true);

    var fs;
    try { fs = firestore; } catch (e) {
      setKpiText('kpiRevenue', 'No DB');
      return;
    }

    var base = fs.collection('users').doc(uid).collection('data');
    Promise.all([
      base.doc('invoices').get(),
      base.doc('payments').get()
    ]).then(function (snaps) {
      var invoices = snaps[0].exists ? (snaps[0].data().items || []) : [];
      var payData  = snaps[1].exists ? (snaps[1].data().data  || {}) : {};

      var revenue = invoices.reduce(function (s, inv) { return s + calcTotal(inv); }, 0);

      var now = new Date();
      var mo0 = new Date(now.getFullYear(), now.getMonth(), 1);
      var month = invoices
        .filter(function (inv) {
          var d = inv.invoiceDate || inv.date || '';
          return d && new Date(d) >= mo0;
        })
        .reduce(function (s, inv) { return s + calcTotal(inv); }, 0);

      var paid = 0;
      Object.values(payData).forEach(function (arr) {
        var items = Array.isArray(arr) ? arr : Object.values(arr || {});
        items.forEach(function (p) {
          if (!p || typeof p !== 'object') return;
          paid += parseFloat(p.amount) || 0;
          var tds = Array.isArray(p.tds) ? p.tds : Object.values(p.tds || {});
          tds.forEach(function (t) { if (t && typeof t === 'object') paid += parseFloat(t.amount) || 0; });
        });
      });

      countUp('kpiRevenue',      revenue,                     fmtMoney, 1400);
      countUp('kpiOutstanding',  Math.max(0, revenue - paid), fmtMoney, 1000);
      countUp('kpiThisMonth',    month,                       fmtMoney,  900);
      countUp('kpiInvoiceCount', invoices.length,             null,       750);
    }).catch(function (err) {
      loaded = false;
      shimmer(false);
      /* Write error directly to first card so it's visible without DevTools */
      setKpiText('kpiRevenue', 'Err:' + (err.code || err.message || '?'));
      /* Restart polling so it retries */
      startPoll();
    });
  }

  /* ── Reset when navigating away ──────────────────────────── */
  var panel = document.getElementById('homePanel');
  if (panel) {
    new MutationObserver(function () {
      if (panel.classList.contains('hidden')) {
        loaded = false;
        /* Restart poller so data refreshes next time panel opens */
        startPoll();
      }
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  /* ── Poll every 300ms until both conditions are met ─────── */
  var pollTimer = null;
  var attempts  = 0;

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    attempts = 0;

    pollTimer = setInterval(function () {
      attempts++;
      if (attempts > 100) { clearInterval(pollTimer); pollTimer = null; return; }
      if (loaded) { clearInterval(pollTimer); pollTimer = null; return; }

      var user;
      try { user = (typeof auth !== 'undefined') ? auth.currentUser : null; }
      catch (e) { user = null; }

      var pnl   = document.getElementById('homePanel');
      var ready = user && pnl && !pnl.classList.contains('hidden');
      if (!ready) return;

      clearInterval(pollTimer);
      pollTimer = null;
      loaded = true;
      doLoad(user.uid);
    }, 300);
  }

  startPoll();

})();
