/**
 * kpi-stats.js  v10  —  Premium KPI dashboard for Karthick Industries
 *
 * Features: polling-safe data load, count-up animation, sparklines,
 *           month-over-month trend badges, Chart.js revenue chart.
 */
(function () {
  'use strict';

  /* ── Greeting & Date ─────────────────────────────────────── */
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
    var hr  = new Date().getHours();
    var greet = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
    var emoji = hr < 12 ? '\uD83D\uDC4B' : hr < 17 ? '\u2600\uFE0F' : '\uD83C\uDF19';
    var nodes = h1.childNodes;
    if (nodes[0] && nodes[0].nodeType === 3) nodes[0].textContent = greet + ', ';
    if (nodes[2] && nodes[2].nodeType === 3) nodes[2].textContent = ' ' + emoji;
  }

  /* ── State ───────────────────────────────────────────────── */
  var loaded = false;

  /* ── DOM helpers ─────────────────────────────────────────── */
  var KPI_IDS = ['kpiRevenue', 'kpiOutstanding', 'kpiThisMonth', 'kpiInvoiceCount'];

  function shimmer(on) {
    KPI_IDS.forEach(function (id) {
      var e = document.getElementById(id);
      if (e) e.classList[on ? 'add' : 'remove']('kpi-loading');
    });
  }
  function setKpiText(id, text) {
    var e = document.getElementById(id);
    if (e) { e.classList.remove('kpi-loading'); e.textContent = text; }
  }

  /* ── Invoice total computation ───────────────────────────── */
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

  /* ── Sparkline canvas renderer ───────────────────────────── */
  function renderSpark(id, values) {
    var el = document.getElementById(id);
    if (!el || values.length < 2) return;
    var max = Math.max.apply(null, values);
    if (max === 0) return;
    var dpr = window.devicePixelRatio || 1;
    var CW = 80, CH = 32;
    el.width  = CW * dpr;
    el.height = CH * dpr;
    el.style.width  = CW + 'px';
    el.style.height = CH + 'px';
    var ctx = el.getContext('2d');
    ctx.scale(dpr, dpr);
    var pts = values.map(function (v, i) {
      return {
        x: (i / (values.length - 1)) * CW,
        y: CH - (v / max) * (CH - 6) - 3
      };
    });
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      var cpx = (pts[i - 1].x + pts[i].x) / 2;
      ctx.bezierCurveTo(cpx, pts[i - 1].y, cpx, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(pts[pts.length - 1].x, CH);
    ctx.lineTo(pts[0].x, CH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
  }

  /* ── Chart.js revenue chart — premium bar+line combo ──────── */
  function renderChart(labels, data) {
    var canvas = document.getElementById('revenueChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (window._kpiChart) { window._kpiChart.destroy(); window._kpiChart = null; }

    var ctx = canvas.getContext('2d');
    var chartH = (canvas.parentElement || {}).offsetHeight || 210;

    /* Area gradient under the line */
    var areaGrad = ctx.createLinearGradient(0, 0, 0, chartH);
    areaGrad.addColorStop(0, 'rgba(124,58,237,0.22)');
    areaGrad.addColorStop(0.75, 'rgba(124,58,237,0.04)');
    areaGrad.addColorStop(1,  'rgba(124,58,237,0.00)');

    /* Bar colours — highlight the current (last) month */
    var barColors = data.map(function (_, i) {
      return i === data.length - 1
        ? 'rgba(124,58,237,0.65)'   /* current month — vivid */
        : 'rgba(124,58,237,0.14)';  /* past months — translucent */
    });

    /* Glow plugin — applies canvas shadow only while drawing the line */
    var glowPlugin = {
      id: 'kpiLineGlow',
      beforeDatasetDraw: function (chart, args) {
        if (args.index !== 1) return;
        chart.ctx.save();
        chart.ctx.shadowBlur  = 18;
        chart.ctx.shadowColor = 'rgba(124,58,237,0.72)';
      },
      afterDatasetDraw: function (chart, args) {
        if (args.index !== 1) return;
        chart.ctx.restore();
      }
    };

    window._kpiChart = new Chart(canvas, {
      type: 'bar',
      plugins: [glowPlugin],
      data: {
        labels: labels,
        datasets: [
          /* Dataset 0 — bars */
          {
            type: 'bar',
            data: data,
            backgroundColor: barColors,
            hoverBackgroundColor: data.map(function () { return 'rgba(124,58,237,0.55)'; }),
            borderRadius: { topLeft: 8, topRight: 8 },
            borderSkipped: 'bottom',
            maxBarThickness: 28,
            order: 2
          },
          /* Dataset 1 — glowing line */
          {
            type: 'line',
            data: data,
            borderColor: '#7c3aed',
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 7,
            pointHoverBackgroundColor: '#7c3aed',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 3,
            tension: 0.44,
            fill: true,
            backgroundColor: areaGrad,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(12,6,32,0.96)',
            titleColor: 'rgba(255,255,255,0.42)',
            bodyColor: '#ffffff',
            padding: { top: 12, bottom: 14, left: 16, right: 16 },
            cornerRadius: 14,
            displayColors: false,
            titleFont: {
              family: "'Plus Jakarta Sans',sans-serif", size: 11, weight: '600'
            },
            bodyFont: {
              family: "'Plus Jakarta Sans',sans-serif", size: 19, weight: '800'
            },
            callbacks: {
              title: function (items) { return items[0].label; },
              label: function (c) {
                if (c.datasetIndex !== 1) return null;
                return fmtMoney(c.parsed.y);
              }
            },
            filter: function (item) { return item.datasetIndex === 1; }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              font: { family: "'Plus Jakarta Sans',sans-serif", size: 11, weight: '600' },
              color: function (c) {
                return c.index === labels.length - 1 ? '#7c3aed' : '#a49bbe';
              }
            }
          },
          y: {
            grid: { color: 'rgba(124,58,237,0.055)', drawTicks: false },
            border: { display: false, dash: [4, 4] },
            ticks: {
              font: { family: "'Plus Jakarta Sans',sans-serif", size: 10 },
              color: '#b8aed6',
              padding: 10,
              callback: function (v) { return fmtMoney(v); },
              maxTicksLimit: 4
            }
          }
        }
      }
    });
  }

  /* ── Core data fetch ─────────────────────────────────────── */
  function doLoad(uid) {
    shimmer(true);
    var fs;
    try { fs = firestore; } catch (e) { setKpiText('kpiRevenue', 'No DB'); return; }

    var base = fs.collection('users').doc(uid).collection('data');
    Promise.all([
      base.doc('invoices').get(),
      base.doc('payments').get()
    ]).then(function (snaps) {
      var invoices = snaps[0].exists ? (snaps[0].data().items || []) : [];
      var payData  = snaps[1].exists ? (snaps[1].data().data  || {}) : {};

      /* ── Totals ──────────────────────────────────────────── */
      var revenue = invoices.reduce(function (s, inv) { return s + calcTotal(inv); }, 0);

      var now = new Date();
      var mo0 = new Date(now.getFullYear(), now.getMonth(), 1);
      var month = invoices
        .filter(function (inv) {
          var d = inv.invoiceDate || inv.date || '';
          return d && new Date(d) >= mo0;
        })
        .reduce(function (s, inv) { return s + calcTotal(inv); }, 0);

      /* payments: { "Company": { credits:[...], totalCredited: N } } */
      var paid = 0;
      Object.values(payData).forEach(function (rec) {
        if (!rec || typeof rec !== 'object') return;
        paid += Number(rec.totalCredited) || 0;
      });

      /* ── Animated KPI values ─────────────────────────────── */
      countUp('kpiRevenue',      revenue,                     fmtMoney, 1400);
      countUp('kpiOutstanding',  Math.max(0, revenue - paid), fmtMoney, 1000);
      countUp('kpiThisMonth',    month,                       fmtMoney,  900);
      countUp('kpiInvoiceCount', invoices.length,             null,      750);

      /* ── Monthly buckets (last 12 months) ────────────────── */
      var buckets = [];
      for (var i = 11; i >= 0; i--) {
        var bd = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({ y: bd.getFullYear(), m: bd.getMonth(), rev: 0, cnt: 0 });
      }
      invoices.forEach(function (inv) {
        var dStr = inv.invoiceDate || inv.date || '';
        if (!dStr) return;
        var d = new Date(dStr);
        if (isNaN(d)) return;
        buckets.forEach(function (bk) {
          if (d.getFullYear() === bk.y && d.getMonth() === bk.m) {
            bk.rev += calcTotal(inv);
            bk.cnt++;
          }
        });
      });

      /* ── Trend badges (this month vs last month) ─────────── */
      var cur  = buckets[11];
      var prev = buckets[10];
      function mkTrend(curVal, prevVal) {
        if (!prevVal) return '';
        var pct = Math.round((curVal - prevVal) / prevVal * 100);
        return (pct >= 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(pct) + '%';
      }
      var monTrend = document.getElementById('kpiMonthTrend');
      var cntTrend = document.getElementById('kpiCountTrend');
      if (monTrend) monTrend.textContent = mkTrend(cur.rev, prev.rev);
      if (cntTrend) cntTrend.textContent = mkTrend(cur.cnt, prev.cnt);

      /* ── Sparklines (last 6 months) ──────────────────────── */
      var spark6 = buckets.slice(6);
      renderSpark('kpiRevenueSpark', spark6.map(function (b) { return b.rev; }));
      renderSpark('kpiMonthSpark',   spark6.map(function (b) { return b.rev; }));
      renderSpark('kpiCountSpark',   spark6.map(function (b) { return b.cnt; }));

      /* ── Revenue chart (all 12 months) ───────────────────── */
      var chartLabels = buckets.map(function (b) {
        return new Date(b.y, b.m, 1).toLocaleDateString('en-IN', { month: 'short' });
      });
      renderChart(chartLabels, buckets.map(function (b) { return b.rev; }));

      var badge = document.getElementById('chartTotalBadge');
      if (badge) badge.textContent = fmtMoney(revenue) + ' total';

    }).catch(function (err) {
      loaded = false;
      shimmer(false);
      setKpiText('kpiRevenue', 'Err:' + (err.code || err.message || '?'));
      startPoll();
    });
  }

  /* ── Reset on panel hide ─────────────────────────────────── */
  var panel = document.getElementById('homePanel');
  if (panel) {
    new MutationObserver(function () {
      if (panel.classList.contains('hidden')) {
        loaded = false;
        startPoll();
      }
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  /* ── Polling loop ────────────────────────────────────────── */
  var pollTimer = null;
  var attempts  = 0;

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    attempts = 0;
    pollTimer = setInterval(function () {
      attempts++;
      if (attempts > 100) { clearInterval(pollTimer); pollTimer = null; return; }
      if (loaded)         { clearInterval(pollTimer); pollTimer = null; return; }
      var user;
      try { user = (typeof auth !== 'undefined') ? auth.currentUser : null; } catch (e) { user = null; }
      var pnl   = document.getElementById('homePanel');
      var ready = user && pnl && !pnl.classList.contains('hidden');
      if (!ready) return;
      clearInterval(pollTimer); pollTimer = null;
      loaded = true;
      doLoad(user.uid);
    }, 300);
  }

  startPoll();

})();
