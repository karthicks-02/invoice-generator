/**
 * kpi-stats.js
 * Loads KPI data from Firestore and renders it in the home panel KPI cards.
 * Uses the globally available `auth` and `firestore` objects from firebase-config.js.
 * Observes #homePanel visibility via MutationObserver to refresh on navigation.
 * Never modifies script.js or db.js.
 */
(function () {
  'use strict';

  // Set today's date in the greeting
  var homeDate = document.getElementById('homeDate');
  if (homeDate) {
    homeDate.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // Also set month name in KPI sub-label
  var kpiMonthName = document.getElementById('kpiMonthName');
  if (kpiMonthName) {
    kpiMonthName.textContent = new Date().toLocaleDateString('en-IN', {
      month: 'long', year: 'numeric'
    });
  }

  var statsLoaded = false;

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      statsLoaded = false;
      resetKpis();
      return;
    }

    var homePanel = document.getElementById('homePanel');
    if (!homePanel) return;

    // Load immediately if home is already visible
    if (!homePanel.classList.contains('hidden')) {
      loadAndRenderStats(user.uid);
    }

    // Watch for home panel becoming visible (e.g. after back-navigation)
    var obs = new MutationObserver(function () {
      if (!homePanel.classList.contains('hidden')) {
        loadAndRenderStats(user.uid);
      }
    });
    obs.observe(homePanel, { attributes: true, attributeFilter: ['class'] });
  });

  function resetKpis() {
    ['kpiRevenue', 'kpiOutstanding', 'kpiThisMonth', 'kpiInvoiceCount'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    statsLoaded = false;
  }

  function loadAndRenderStats(uid) {
    if (statsLoaded) return;
    statsLoaded = true;

    var base = firestore.collection('users').doc(uid).collection('data');

    // Load invoices, payments, customers in parallel
    Promise.all([
      base.doc('invoices').get(),
      base.doc('payments').get(),
      base.doc('customers').get()
    ]).then(function (results) {
      var invSnap  = results[0];
      var paySnap  = results[1];
      var custSnap = results[2];

      var invoices  = invSnap.exists  ? (invSnap.data().items  || []) : [];
      var payments  = paySnap.exists  ? (paySnap.data().data   || {}) : {};

      // Total revenue (sum of all grandTotal values)
      var totalRevenue = invoices.reduce(function (s, inv) {
        return s + (parseFloat(inv.grandTotal) || 0);
      }, 0);

      // This month's revenue
      var now        = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      var thisMonth  = invoices
        .filter(function (inv) { return inv.date && new Date(inv.date) >= monthStart; })
        .reduce(function (s, inv) { return s + (parseFloat(inv.grandTotal) || 0); }, 0);

      // Outstanding = total billed − total payments received
      var totalPaid = 0;
      Object.values(payments).forEach(function (entries) {
        (entries || []).forEach(function (p) {
          totalPaid += parseFloat(p.amount) || 0;
          (p.tds || []).forEach(function (t) { totalPaid += parseFloat(t.amount) || 0; });
        });
      });
      var outstanding = Math.max(0, totalRevenue - totalPaid);

      // Format helper
      function fmtLakh(val) {
        if (val >= 10000000) return '₹' + (val / 10000000).toFixed(1) + 'Cr';
        if (val >= 100000)   return '₹' + (val / 100000).toFixed(1) + 'L';
        if (val >= 1000)     return '₹' + (val / 1000).toFixed(1) + 'K';
        return '₹' + val.toFixed(0);
      }

      // Animate counters
      animateValue('kpiRevenue',      totalRevenue,   fmtLakh, 1200);
      animateValue('kpiOutstanding',  outstanding,    fmtLakh, 900);
      animateValue('kpiThisMonth',    thisMonth,      fmtLakh, 800);
      animateCount('kpiInvoiceCount', invoices.length, 700);

    }).catch(function () {
      // Fail silently — KPI cards remain showing '—'
      statsLoaded = false;
    });
  }

  function animateValue(elId, target, formatter, duration) {
    var el = document.getElementById(elId);
    if (!el) return;
    var stepTime = 16;
    var steps    = Math.ceil(duration / stepTime);
    var inc      = target / steps;
    var current  = 0;
    var timer    = setInterval(function () {
      current = Math.min(current + inc, target);
      el.textContent = formatter(current);
      if (current >= target) clearInterval(timer);
    }, stepTime);
  }

  function animateCount(elId, target, duration) {
    var el = document.getElementById(elId);
    if (!el) return;
    var stepTime = 16;
    var steps    = Math.ceil(duration / stepTime);
    var inc      = target / steps;
    var current  = 0;
    var timer    = setInterval(function () {
      current = Math.min(current + inc, target);
      el.textContent = Math.round(current).toString();
      if (current >= target) clearInterval(timer);
    }, stepTime);
  }

})();
