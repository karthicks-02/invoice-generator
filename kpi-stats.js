/**
 * kpi-stats.js  —  Live KPI dashboard for Karthick Industries
 *
 * Strategy: Watch #homePanel visibility directly via MutationObserver.
 * When it becomes visible, script.js has already resolved auth and called
 * goHome(), so firebase.auth().currentUser is guaranteed to be set.
 * We do NOT use onAuthStateChanged — avoids all timing races.
 */
(function () {
  'use strict';

  /* ── Date / greeting labels ──────────────────────────── */
  var homeDate = document.getElementById('homeDate');
  if (homeDate) {
    homeDate.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
  var kpiMonthEl = document.getElementById('kpiMonthName');
  if (kpiMonthEl) {
    kpiMonthEl.textContent = new Date().toLocaleDateString('en-IN', {
      month: 'long', year: 'numeric'
    });
  }

  /* Time-based greeting — update text nodes safely (no innerHTML) */
  var h1 = document.querySelector('.home-greeting-h1');
  if (h1) {
    var hr = new Date().getHours();
    var greet = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
    var emoji  = hr < 12 ? '👋' : hr < 17 ? '☀️' : '🌙';
    /* childNodes[0] = "Good Morning, " text node
       childNodes[1] = <span>Karthick</span>
       childNodes[2] = " 👋" text node  */
    var nodes = h1.childNodes;
    if (nodes[0] && nodes[0].nodeType === 3) nodes[0].textContent = greet + ', ';
    if (nodes[2] && nodes[2].nodeType === 3) nodes[2].textContent = ' ' + emoji;
  }

  /* ── Invoice total computation ───────────────────────── */
  function calcTotal(inv) {
    var sub = (inv.items || []).reduce(function (s, it) {
      return s + Math.round(Number(it.qty) || 0) * (Number(it.rate) || 0);
    }, 0);
    var r   = parseFloat(inv.gstRate) || 0;
    var tax = (inv.gstType === 'cgst') ? sub * (r / 100) * 2 : sub * (r / 100);
    return Math.round(sub + tax);
  }

  /* ── Formatters ──────────────────────────────────────── */
  function fmtMoney(v) {
    if (v >= 10000000) return '\u20B9' + (v / 10000000).toFixed(2) + 'Cr';
    if (v >= 100000)   return '\u20B9' + (v / 100000).toFixed(2) + 'L';
    if (v >= 1000)     return '\u20B9' + (v / 1000).toFixed(1) + 'K';
    return '\u20B9' + Math.round(v).toLocaleString('en-IN');
  }

  /* ── Shimmer (loading state) ─────────────────────────── */
  var KPI_IDS = ['kpiRevenue', 'kpiOutstanding', 'kpiThisMonth', 'kpiInvoiceCount'];
  function shimmer(on) {
    KPI_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList[on ? 'add' : 'remove']('kpi-loading');
    });
  }

  /* ── Animated counter ────────────────────────────────── */
  function countUp(id, target, fmtr, ms) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('kpi-loading');
    var steps = Math.max(1, Math.ceil(ms / 16));
    var inc = target / steps, cur = 0;
    var t = setInterval(function () {
      cur = Math.min(cur + inc, target);
      el.textContent = fmtr ? fmtr(cur) : Math.round(cur).toString();
      if (cur >= target) clearInterval(t);
    }, 16);
  }

  /* ── Load + render KPI data ──────────────────────────── */
  var loaded = false;

  function loadStats() {
    if (loaded) return;
    loaded = true;

    var user = firebase.auth().currentUser;
    if (!user) {
      loaded = false;
      return;
    }

    shimmer(true);

    var base = firestore.collection('users').doc(user.uid).collection('data');
    Promise.all([
      base.doc('invoices').get(),
      base.doc('payments').get()
    ]).then(function (snaps) {
      var invoices = snaps[0].exists ? (snaps[0].data().items || []) : [];
      var payData  = snaps[1].exists ? (snaps[1].data().data  || {}) : {};

      /* Total revenue */
      var revenue = invoices.reduce(function (s, inv) {
        return s + calcTotal(inv);
      }, 0);

      /* This month */
      var now  = new Date();
      var mo0  = new Date(now.getFullYear(), now.getMonth(), 1);
      var month = invoices
        .filter(function (inv) {
          var d = inv.invoiceDate || inv.date || '';
          return d && new Date(d) >= mo0;
        })
        .reduce(function (s, inv) { return s + calcTotal(inv); }, 0);

      /* Outstanding = revenue − (payments + TDS) */
      var paid = 0;
      Object.values(payData).forEach(function (arr) {
        (arr || []).forEach(function (p) {
          paid += parseFloat(p.amount) || 0;
          (p.tds || []).forEach(function (t) { paid += parseFloat(t.amount) || 0; });
        });
      });

      /* Animate counters */
      countUp('kpiRevenue',      revenue,                     fmtMoney, 1400);
      countUp('kpiOutstanding',  Math.max(0, revenue - paid), fmtMoney, 1000);
      countUp('kpiThisMonth',    month,                       fmtMoney,  900);
      countUp('kpiInvoiceCount', invoices.length,             null,       750);

    }).catch(function (e) {
      loaded = false;
      shimmer(false);
      console.warn('[kpi-stats]', e);
    });
  }

  /* ── Watch #homePanel visibility ─────────────────────── */
  var panel = document.getElementById('homePanel');
  if (panel) {
    new MutationObserver(function () {
      if (panel.classList.contains('hidden')) {
        loaded = false; /* reset so data refreshes on next visit to home */
      } else {
        loadStats();
      }
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });

    /* Handle case where panel is already visible on load */
    if (!panel.classList.contains('hidden')) {
      loadStats();
    }
  }

})();
