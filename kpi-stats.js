/**
 * kpi-stats.js  v4  —  Live KPI dashboard for Karthick Industries
 *
 * Uses BOTH auth.onAuthStateChanged AND a MutationObserver on #homePanel.
 * tryLoad() is called from either path; it proceeds only when both
 * conditions are true: (a) user is signed in, (b) home panel is visible.
 * This is race-free regardless of which event fires first.
 */
(function () {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }

  /* ── Date / greeting labels (safe DOM manipulation) ──────── */
  var homeDateEl = el('homeDate');
  if (homeDateEl) {
    homeDateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
  var kpiMonthEl = el('kpiMonthName');
  if (kpiMonthEl) {
    kpiMonthEl.textContent = new Date().toLocaleDateString('en-IN', {
      month: 'long', year: 'numeric'
    });
  }
  /* Time-based greeting via text node (no innerHTML) */
  var h1 = document.querySelector('.home-greeting-h1');
  if (h1) {
    var hr = new Date().getHours();
    var greet = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
    var emoji  = hr < 12 ? '\uD83D\uDC4B' : hr < 17 ? '\u2600\uFE0F' : '\uD83C\uDF19';
    var nodes = h1.childNodes;
    if (nodes[0] && nodes[0].nodeType === 3) nodes[0].textContent = greet + ', ';
    if (nodes[2] && nodes[2].nodeType === 3) nodes[2].textContent = ' ' + emoji;
  }

  /* ── State ───────────────────────────────────────────────── */
  var uid    = null;   /* set by onAuthStateChanged */
  var loaded = false;  /* prevent duplicate fetches */

  /* ── Shimmer ─────────────────────────────────────────────── */
  var KPI_IDS = ['kpiRevenue', 'kpiOutstanding', 'kpiThisMonth', 'kpiInvoiceCount'];
  function shimmer(on) {
    KPI_IDS.forEach(function (id) {
      var e = el(id);
      if (e) e.classList[on ? 'add' : 'remove']('kpi-loading');
    });
  }
  function resetDashes() {
    KPI_IDS.forEach(function (id) {
      var e = el(id);
      if (e) { e.textContent = '\u2014'; e.classList.remove('kpi-loading'); }
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

  /* ── Formatters ──────────────────────────────────────────── */
  function fmtMoney(v) {
    v = Math.round(v);
    if (v >= 10000000) return '\u20B9' + (v / 10000000).toFixed(2) + 'Cr';
    if (v >= 100000)   return '\u20B9' + (v / 100000).toFixed(2) + 'L';
    if (v >= 1000)     return '\u20B9' + (v / 1000).toFixed(1) + 'K';
    return '\u20B9' + v.toLocaleString('en-IN');
  }

  /* ── Animated counter ────────────────────────────────────── */
  function countUp(id, target, fmtr, ms) {
    var e = el(id);
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
  function doLoad() {
    shimmer(true);
    var base = firestore.collection('users').doc(uid).collection('data');
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
        (arr || []).forEach(function (p) {
          paid += parseFloat(p.amount) || 0;
          (p.tds || []).forEach(function (t) { paid += parseFloat(t.amount) || 0; });
        });
      });

      countUp('kpiRevenue',      revenue,                     fmtMoney, 1400);
      countUp('kpiOutstanding',  Math.max(0, revenue - paid), fmtMoney, 1000);
      countUp('kpiThisMonth',    month,                       fmtMoney,  900);
      countUp('kpiInvoiceCount', invoices.length,             null,       750);
    }).catch(function (e) {
      loaded = false;
      shimmer(false);
      console.warn('[kpi-stats] Firestore error:', e);
    });
  }

  /* ── tryLoad: proceed only when BOTH uid AND panel are ready ─ */
  var panel = document.getElementById('homePanel');

  function tryLoad() {
    if (loaded)  return;
    if (!uid)    return;
    if (!panel || panel.classList.contains('hidden')) return;
    loaded = true;
    doLoad();
  }

  /* ── 1. Auth listener (runs regardless of panel state) ───── */
  auth.onAuthStateChanged(function (user) {
    if (user) {
      uid = user.uid;
      tryLoad();
    } else {
      uid    = null;
      loaded = false;
      resetDashes();
    }
  });

  /* ── 2. Panel visibility watcher ─────────────────────────── */
  if (panel) {
    new MutationObserver(function () {
      if (panel.classList.contains('hidden')) {
        loaded = false;   /* reset so data refreshes on next home visit */
      } else {
        tryLoad();
      }
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });

    tryLoad(); /* cover the (unlikely) case where panel is already visible */
  }

})();
