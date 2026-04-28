/**
 * kpi-stats.js  v10  —  Premium KPI dashboard for Karthick Industries
 *
 * Features: polling-safe data load, count-up animation, sparklines,
 *           month-over-month trend badges, Chart.js revenue chart.
 */
(function () {
  'use strict';

  /* ── Date & Greeting ─────────────────────────────────────── */
  var kpiMonthEl = document.getElementById('kpiMonthName');
  if (kpiMonthEl) {
    kpiMonthEl.textContent = new Date().toLocaleDateString('en-IN', {
      month: 'long', year: 'numeric'
    });
  }
  var dateSubEl = document.getElementById('homeDate');
  if (dateSubEl) {
    var now = new Date();
    var hr = now.getHours();
    var greet = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
    var emoji = hr < 12 ? '\uD83D\uDC4B' : hr < 17 ? '\u2600\uFE0F' : '\uD83C\uDF19';
    dateSubEl.textContent = greet + ' ' + emoji + '  \u2022  ' + now.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
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

  function lineQtyForAmount(it) {
    var n = Number(it.qty);
    if (!isFinite(n)) return 0;
    if (Math.abs(n - Math.round(n)) > 1e-9) return Math.round(n * 1000) / 1000;
    return Math.round(n);
  }

  /* ── Invoice total computation ───────────────────────────── */
  function calcTotal(inv) {
    var sub = (inv.items || []).reduce(function (s, it) {
      return s + lineQtyForAmount(it) * (Number(it.rate) || 0);
    }, 0);
    var r   = parseFloat(inv.gstRate) || 0;
    var gType = inv.gstType || '';
    var isIntra = (gType === 'intra' || gType === 'cgst');
    var tax = isIntra ? sub * (r / 100) * 2 : sub * (r / 100);
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
        layout: { padding: { top: 18, left: 0, right: 4, bottom: 0 } },
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
            grace: '8%',
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

  /* ── Relative time helper ────────────────────────────────── */
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d)) return '';
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  /* ── Safe DOM setter ───────────────────────────────────── */
  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  /* ── Core data fetch ─────────────────────────────────────── */
  function doLoad(uid) {
    shimmer(true);
    var fs;
    try { fs = firestore; } catch (e) { setKpiText('kpiRevenue', 'No DB'); return; }

    var base = fs.collection('users').doc(uid).collection('data');
    Promise.all([
      base.doc('invoices').get(),
      base.doc('payments').get(),
      base.doc('poInvoices').get(),
      base.doc('vendorPayments').get()
    ]).then(function (snaps) {
      var invoices   = snaps[0].exists ? (snaps[0].data().items || []) : [];
      var payData    = snaps[1].exists ? (snaps[1].data().data  || {}) : {};
      var poInvoices = snaps[2].exists ? (snaps[2].data().items || []) : [];
      var vpayData   = snaps[3].exists ? (snaps[3].data().data  || {}) : {};

      /* ── Totals ──────────────────────────────────────────── */
      var revenue = invoices.reduce(function (s, inv) { return s + calcTotal(inv); }, 0);

      var now = new Date();
      var mo0 = new Date(now.getFullYear(), now.getMonth(), 1);
      var mo1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      var monthInvs = invoices.filter(function (inv) {
        var d = inv.invoiceDate || inv.date || '';
        if (!d) return false;
        var parsed = new Date(d);
        return !isNaN(parsed) && parsed >= mo0 && parsed < mo1;
      });
      var month = monthInvs.reduce(function (s, inv) { return s + calcTotal(inv); }, 0);

      var paid = 0;
      Object.values(payData).forEach(function (rec) {
        if (!rec || typeof rec !== 'object') return;
        paid += Number(rec.totalCredited) || 0;
      });
      var outstanding = Math.max(0, revenue - paid);

      /* ── Animated KPI values ─────────────────────────────── */
      countUp('kpiRevenue',      revenue,       fmtMoney, 1400);
      countUp('kpiOutstanding',  outstanding,   fmtMoney, 1000);
      countUp('kpiThisMonth',    month,          fmtMoney,  900);
      countUp('kpiInvoiceCount', invoices.length, null,     750);

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

      /* ── Trend badges ──────────────────────────────────── */
      var cur  = buckets[11];
      var prev = buckets[10];
      function applyTrend(el, curVal, prevVal) {
        if (!el || !prevVal) { if (el) el.textContent = ''; return; }
        var pct = Math.round((curVal - prevVal) / prevVal * 100);
        var up  = pct >= 0;
        el.textContent = (up ? '\u25B2 ' : '\u25BC ') + Math.abs(pct) + '%';
        el.classList.remove('trend-up', 'trend-down');
        el.classList.add(up ? 'trend-up' : 'trend-down');
      }
      applyTrend(document.getElementById('kpiMonthTrend'), cur.rev, prev.rev);
      applyTrend(document.getElementById('kpiCountTrend'), cur.cnt, prev.cnt);

      /* ── Sparklines ────────────────────────────────────── */
      var spark6 = buckets.slice(6);
      renderSpark('kpiRevenueSpark', spark6.map(function (b) { return b.rev; }));
      renderSpark('kpiMonthSpark',   spark6.map(function (b) { return b.rev; }));
      renderSpark('kpiCountSpark',   spark6.map(function (b) { return b.cnt; }));

      /* ── Revenue chart ─────────────────────────────────── */
      var chartLabels = buckets.map(function (b) {
        return new Date(b.y, b.m, 1).toLocaleDateString('en-IN', { month: 'short' });
      });
      renderChart(chartLabels, buckets.map(function (b) { return b.rev; }));

      var badge = document.getElementById('chartTotalBadge');
      if (badge) badge.textContent = fmtMoney(revenue) + ' total';

      /* ═══════════════════════════════════════════════════════
         NEW DASHBOARD WIDGETS
         ═══════════════════════════════════════════════════════ */

      /* ── 1. Receivable Aging Breakdown ──────────────────── */
      var ageBuckets = [0, 0, 0, 0];
      var compPaid = {};
      Object.keys(payData).forEach(function (name) {
        compPaid[name] = Number((payData[name] || {}).totalCredited) || 0;
      });
      invoices.slice().sort(function (a, b) {
        return new Date(a.invoiceDate || a.date || 0) - new Date(b.invoiceDate || b.date || 0);
      }).forEach(function (inv) {
        var buyer = inv.buyerName || '';
        var total = calcTotal(inv);
        var pool  = compPaid[buyer] || 0;
        var applied = Math.min(pool, total);
        if (compPaid[buyer] !== undefined) compPaid[buyer] -= applied;
        var balance = total - applied;
        if (balance <= 0) return;
        var dStr = inv.invoiceDate || inv.date || inv.createdAt || '';
        var days = dStr ? Math.max(0, Math.floor((Date.now() - new Date(dStr).getTime()) / 86400000)) : 0;
        if (days <= 30)      ageBuckets[0] += balance;
        else if (days <= 60) ageBuckets[1] += balance;
        else if (days <= 90) ageBuckets[2] += balance;
        else                 ageBuckets[3] += balance;
      });
      var ageMax = Math.max.apply(null, ageBuckets) || 1;
      var ageIds = [['aging030','agingAmt030'], ['aging3160','agingAmt3160'],
                    ['aging6190','agingAmt6190'], ['aging90','agingAmt90']];
      ageBuckets.forEach(function (val, idx) {
        var bar = document.getElementById(ageIds[idx][0]);
        if (bar) bar.style.width = Math.round((val / ageMax) * 100) + '%';
        setText(ageIds[idx][1], fmtMoney(val));
      });
      setText('agingTotal', fmtMoney(outstanding));

      /* ── 2. Revenue Forecast / Run Rate ────────────────── */
      var dayOfMonth = now.getDate();
      var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      var projected = dayOfMonth > 0 ? Math.round((month / dayOfMonth) * daysInMonth) : 0;
      var lastMonthRev = prev ? prev.rev : 0;
      var target = lastMonthRev || projected;
      setText('forecastValue', fmtMoney(projected));
      var forecastBadge = document.getElementById('forecastBadge');
      if (forecastBadge) {
        forecastBadge.textContent = dayOfMonth + '/' + daysInMonth + ' days';
      }
      setText('forecastCurrent', fmtMoney(month));
      setText('forecastTarget', fmtMoney(target));
      var pctDone = target > 0 ? Math.min(100, Math.round((month / target) * 100)) : 0;
      var fillEl = document.getElementById('forecastFill');
      if (fillEl) setTimeout(function () { fillEl.style.width = pctDone + '%'; }, 200);

      /* ── 3. Top 5 Customers ────────────────────────────── */
      var custRevenue = {};
      invoices.forEach(function (inv) {
        var n = inv.buyerName || 'Unknown';
        custRevenue[n] = (custRevenue[n] || 0) + calcTotal(inv);
      });
      var sortedCust = Object.keys(custRevenue).sort(function (a, b) {
        return custRevenue[b] - custRevenue[a];
      }).slice(0, 5);
      var topMax = sortedCust.length ? custRevenue[sortedCust[0]] : 1;
      var topList = document.getElementById('topCustList');
      if (topList) {
        topList.textContent = '';
        if (sortedCust.length === 0) {
          var emptyDiv = document.createElement('div');
          emptyDiv.className = 'top-cust-empty';
          emptyDiv.textContent = 'No invoices yet';
          topList.appendChild(emptyDiv);
        } else {
          sortedCust.forEach(function (name, idx) {
            var row = document.createElement('div');
            row.className = 'top-cust-row';
            row.style.animationDelay = (idx * 80) + 'ms';
            var rank = document.createElement('div');
            rank.className = 'top-cust-rank top-rank-' + (idx + 1);
            rank.textContent = idx + 1;
            var info = document.createElement('div');
            info.className = 'top-cust-info';
            var nm = document.createElement('div');
            nm.className = 'top-cust-name';
            nm.textContent = name;
            var bar = document.createElement('div');
            bar.className = 'top-cust-bar';
            var barFill = document.createElement('div');
            barFill.className = 'top-cust-bar-fill';
            setTimeout(function (f, w) { return function () { f.style.width = w + '%'; }; }(barFill, Math.round((custRevenue[name] / topMax) * 100)), 300);
            bar.appendChild(barFill);
            info.appendChild(nm);
            info.appendChild(bar);
            var amt = document.createElement('div');
            amt.className = 'top-cust-amt';
            amt.textContent = fmtMoney(custRevenue[name]);
            row.appendChild(rank);
            row.appendChild(info);
            row.appendChild(amt);
            topList.appendChild(row);
          });
        }
      }

      /* ── 4. Invoice Status Donut ───────────────────────── */
      var statusPaid = 0, statusPartial = 0, statusUnpaid = 0;
      var compPaidCopy = {};
      Object.keys(payData).forEach(function (name) {
        compPaidCopy[name] = Number((payData[name] || {}).totalCredited) || 0;
      });
      invoices.slice().sort(function (a, b) {
        return new Date(a.invoiceDate || a.date || 0) - new Date(b.invoiceDate || b.date || 0);
      }).forEach(function (inv) {
        var buyer = inv.buyerName || '';
        var total = calcTotal(inv);
        var pool = compPaidCopy[buyer] || 0;
        var applied = Math.min(pool, total);
        if (compPaidCopy[buyer] !== undefined) compPaidCopy[buyer] -= applied;
        var balance = total - applied;
        if (balance <= 0.5)               statusPaid++;
        else if (applied > 0)             statusPartial++;
        else                               statusUnpaid++;
      });
      var donutCanvas = document.getElementById('statusDonut');
      if (donutCanvas && typeof Chart !== 'undefined') {
        if (window._kpiDonut) { window._kpiDonut.destroy(); }
        window._kpiDonut = new Chart(donutCanvas, {
          type: 'doughnut',
          data: {
            labels: ['Paid', 'Partial', 'Unpaid'],
            datasets: [{
              data: [statusPaid, statusPartial, statusUnpaid],
              backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
              borderWidth: 0, spacing: 3, borderRadius: 6
            }]
          },
          options: {
            responsive: false, cutout: '65%',
            plugins: { legend: { display: false },
              tooltip: { backgroundColor: 'rgba(12,6,32,0.92)', cornerRadius: 10,
                bodyFont: { family: "'Plus Jakarta Sans',sans-serif", size: 13, weight: '700' } }
            },
            animation: { animateRotate: true, duration: 1200 }
          }
        });
      }
      var legendEl = document.getElementById('donutLegend');
      if (legendEl) {
        legendEl.textContent = '';
        [{ color:'#22c55e', label:'Paid', value:statusPaid },
         { color:'#f59e0b', label:'Partial', value:statusPartial },
         { color:'#ef4444', label:'Unpaid', value:statusUnpaid }
        ].forEach(function (it) {
          var item = document.createElement('div');
          item.className = 'donut-leg-item';
          var dot = document.createElement('div');
          dot.className = 'donut-leg-dot';
          dot.style.background = it.color;
          var lbl = document.createElement('span');
          lbl.className = 'donut-leg-label';
          lbl.textContent = it.label;
          var val = document.createElement('span');
          val.className = 'donut-leg-value';
          val.textContent = it.value;
          item.appendChild(dot);
          item.appendChild(lbl);
          item.appendChild(val);
          legendEl.appendChild(item);
        });
      }

      /* ── 5. Cash Flow (AR vs AP) ───────────────────────── */
      var poRevenue = poInvoices.reduce(function (s, inv) { return s + calcTotal(inv); }, 0);
      var vpaid = 0;
      Object.values(vpayData).forEach(function (rec) {
        if (!rec || typeof rec !== 'object') return;
        vpaid += Number(rec.totalCredited) || 0;
      });
      var payable = Math.max(0, poRevenue - vpaid);
      setText('cfReceivable', fmtMoney(outstanding));
      setText('cfPayable', fmtMoney(payable));
      var netPos = outstanding - payable;
      var cfNetVal = document.getElementById('cfNet');
      if (cfNetVal) {
        var nv = cfNetVal.querySelector('.cf-net-value');
        if (nv) {
          nv.textContent = (netPos >= 0 ? '+' : '-') + fmtMoney(Math.abs(netPos));
          nv.style.color = netPos >= 0 ? '#16a34a' : '#dc2626';
        }
      }

      /* ── 6. GST Summary (this month) ───────────────────── */
      var gstCgst = 0, gstSgst = 0, gstIgst = 0;
      monthInvs.forEach(function (inv) {
        var sub = (inv.items || []).reduce(function (s, it) {
          return s + lineQtyForAmount(it) * (Number(it.rate) || 0);
        }, 0);
        var r = parseFloat(inv.gstRate) || 0;
        var gType = inv.gstType || '';
        if (gType === 'intra' || gType === 'cgst') {
          var half = sub * (r / 100);
          gstCgst += half;
          gstSgst += half;
        } else {
          gstIgst += sub * (r / 100);
        }
      });
      setText('gstCgst', fmtMoney(Math.round(gstCgst)));
      setText('gstSgst', fmtMoney(Math.round(gstSgst)));
      setText('gstIgst', fmtMoney(Math.round(gstIgst)));
      setText('gstTotal', fmtMoney(Math.round(gstCgst + gstSgst + gstIgst)));

      /* ── 7. Recent Activity Feed ───────────────────────── */
      var activities = [];
      invoices.forEach(function (inv) {
        activities.push({
          type: 'invoice',
          label: inv.invoiceNumber || '?',
          detail: inv.buyerName || 'Unknown',
          prefix: 'Invoice ',
          mid: ' for ',
          date: inv.createdAt || inv.invoiceDate || inv.date || ''
        });
      });
      Object.keys(payData).forEach(function (company) {
        var rec = payData[company];
        if (!rec || !rec.credits) return;
        rec.credits.forEach(function (c) {
          activities.push({
            type: 'payment',
            label: fmtMoney(Number(c.amount) || 0),
            detail: company,
            prefix: 'Payment of ',
            mid: ' from ',
            date: c.date || ''
          });
        });
      });
      poInvoices.forEach(function (inv) {
        activities.push({
          type: 'po',
          label: inv.invoiceNumber || '?',
          detail: inv.vendorName || 'Unknown',
          prefix: 'PO ',
          mid: ' for ',
          date: inv.createdAt || inv.invoiceDate || inv.date || ''
        });
      });
      activities.sort(function (a, b) {
        return new Date(b.date || 0) - new Date(a.date || 0);
      });
      activities = activities.slice(0, 12);
      var actList = document.getElementById('activityList');
      if (actList) {
        actList.textContent = '';
        if (activities.length === 0) {
          var emptyA = document.createElement('div');
          emptyA.className = 'activity-empty';
          emptyA.textContent = 'No activity yet';
          actList.appendChild(emptyA);
        } else {
          activities.forEach(function (act, idx) {
            var item = document.createElement('div');
            item.className = 'activity-item';
            item.style.animationDelay = (idx * 50) + 'ms';
            var dot = document.createElement('div');
            dot.className = 'activity-dot activity-dot-' + act.type;
            var textDiv = document.createElement('div');
            textDiv.className = 'activity-text';
            var prefixNode = document.createTextNode(act.prefix);
            var bold = document.createElement('strong');
            bold.textContent = act.label;
            var midNode = document.createTextNode(act.mid);
            var detailNode = document.createTextNode(act.detail);
            var timeSpan = document.createElement('span');
            timeSpan.className = 'activity-time';
            timeSpan.textContent = timeAgo(act.date);
            textDiv.appendChild(prefixNode);
            textDiv.appendChild(bold);
            textDiv.appendChild(midNode);
            textDiv.appendChild(detailNode);
            textDiv.appendChild(timeSpan);
            item.appendChild(dot);
            item.appendChild(textDiv);
            actList.appendChild(item);
          });
        }
      }
      var actCountEl = document.getElementById('activityCount');
      if (actCountEl) actCountEl.textContent = activities.length + ' recent';

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
