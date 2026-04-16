/**
 * kpi-stats.js
 * Loads KPI data from Firestore and renders it in the home panel KPI cards.
 * Uses the globally available `auth` and `firestore` objects from firebase-config.js.
 * Starts loading immediately on auth — does NOT wait for homePanel to be visible.
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

  // Set month name in KPI sub-label
  var kpiMonthName = document.getElementById('kpiMonthName');
  if (kpiMonthName) {
    kpiMonthName.textContent = new Date().toLocaleDateString('en-IN', {
      month: 'long', year: 'numeric'
    });
  }

  // Compute invoice total from stored fields (mirrors script.js logic)
  function calcInvoiceTotal(inv) {
    var items = inv.items || [];
    var gstRate = parseFloat(inv.gstRate) || 0;
    var gstType = inv.gstType || 'cgst';
    var subtotal = items.reduce(function (s, it) {
      return s + Math.round(Number(it.qty) || 0) * (Number(it.rate) || 0);
    }, 0);
    var totalTax = gstType === 'cgst'
      ? subtotal * (gstRate / 100) * 2
      : subtotal * (gstRate / 100);
    return Math.round(subtotal + totalTax);
  }

  var pendingStats = null; // holds computed stats before panel is visible

  function renderStats(stats) {
    animateValue('kpiRevenue',      stats.totalRevenue,  fmtLakh, 1200);
    animateValue('kpiOutstanding',  stats.outstanding,   fmtLakh, 900);
    animateValue('kpiThisMonth',    stats.thisMonth,     fmtLakh, 800);
    animateCount('kpiInvoiceCount', stats.invoiceCount,  700);
  }

  function resetKpis() {
    ['kpiRevenue', 'kpiOutstanding', 'kpiThisMonth', 'kpiInvoiceCount'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
  }

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      pendingStats = null;
      resetKpis();
      return;
    }

    var uid = user.uid;
    var base = firestore.collection('users').doc(uid).collection('data');

    // Load data immediately — do NOT gate on homePanel visibility
    Promise.all([
      base.doc('invoices').get(),
      base.doc('payments').get()
    ]).then(function (results) {
      var invSnap = results[0];
      var paySnap = results[1];

      var invoices = invSnap.exists ? (invSnap.data().items || []) : [];
      var payments = paySnap.exists ? (paySnap.data().data || {}) : {};

      // Total revenue — computed from items (grandTotal not stored)
      var totalRevenue = invoices.reduce(function (s, inv) {
        return s + calcInvoiceTotal(inv);
      }, 0);

      // This month's revenue
      var now        = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      var thisMonth  = invoices
        .filter(function (inv) {
          var d = inv.invoiceDate || inv.date || '';
          return d && new Date(d) >= monthStart;
        })
        .reduce(function (s, inv) { return s + calcInvoiceTotal(inv); }, 0);

      // Outstanding = total billed − payments received (incl. TDS)
      var totalPaid = 0;
      Object.values(payments).forEach(function (entries) {
        (entries || []).forEach(function (p) {
          totalPaid += parseFloat(p.amount) || 0;
          (p.tds || []).forEach(function (t) { totalPaid += parseFloat(t.amount) || 0; });
        });
      });
      var outstanding = Math.max(0, totalRevenue - totalPaid);

      var stats = {
        totalRevenue: totalRevenue,
        outstanding:  outstanding,
        thisMonth:    thisMonth,
        invoiceCount: invoices.length
      };

      var homePanel = document.getElementById('homePanel');
      if (homePanel && !homePanel.classList.contains('hidden')) {
        // Panel already visible — render now
        renderStats(stats);
      } else {
        // Store and wait for panel to become visible
        pendingStats = stats;
        if (homePanel) {
          var obs = new MutationObserver(function () {
            if (!homePanel.classList.contains('hidden') && pendingStats) {
              renderStats(pendingStats);
              pendingStats = null;
              obs.disconnect();
            }
          });
          obs.observe(homePanel, { attributes: true, attributeFilter: ['class'] });
        }
      }
    }).catch(function (err) {
      // Fail silently — KPI cards remain showing '—'
      console.warn('[kpi-stats] Failed to load stats:', err);
    });
  });

  function fmtLakh(val) {
    if (val >= 10000000) return '₹' + (val / 10000000).toFixed(1) + 'Cr';
    if (val >= 100000)   return '₹' + (val / 100000).toFixed(1) + 'L';
    if (val >= 1000)     return '₹' + (val / 1000).toFixed(1) + 'K';
    return '₹' + Math.round(val).toLocaleString('en-IN');
  }

  function animateValue(elId, target, formatter, duration) {
    var el = document.getElementById(elId);
    if (!el) return;
    var stepTime = 16;
    var steps    = Math.max(1, Math.ceil(duration / stepTime));
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
    var steps    = Math.max(1, Math.ceil(duration / stepTime));
    var inc      = target / steps;
    var current  = 0;
    var timer    = setInterval(function () {
      current = Math.min(current + inc, target);
      el.textContent = Math.round(current).toString();
      if (current >= target) clearInterval(timer);
    }, stepTime);
  }

})();
