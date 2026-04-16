/**
 * table-enhance.js  v1
 * - Click anywhere on a data row → opens Edit (or View) for that record
 * - Staggered slide-in animation whenever a tbody is populated
 * Never modifies script.js or db.js.
 */
(function () {
  'use strict';

  /* ── Row click → simulate Edit / View button press ──────── */
  document.addEventListener('click', function (e) {
    /* Ignore real interactive elements */
    if (e.target.closest('button, input, a, select, label, textarea')) return;

    var td = e.target.closest('td');
    if (!td || td.classList.contains('actions')) return;

    var tr = td.closest('tr');
    if (!tr || tr.parentElement.tagName !== 'TBODY') return;

    /* Prefer .btn-edit; fall back to .btn-view */
    var btn = tr.querySelector('.btn-edit') || tr.querySelector('.btn-view');
    if (btn) btn.click();
  });

  /* ── Staggered row entrance animation ───────────────────── */
  function animateRows(tbody) {
    var rows = Array.from(tbody.querySelectorAll('tr'));
    if (!rows.length) return;
    rows.forEach(function (tr, i) {
      tr.classList.remove('tr-enter');
      tr.style.setProperty('--row-delay', (i * 36) + 'ms');
      /* Force reflow so removing then re-adding the class restarts animation */
      void tr.offsetWidth;
      tr.classList.add('tr-enter');
    });
  }

  /* Watch tbody childList mutations (bulk render triggers one batch) */
  var pendingBodies = new Set();
  var flushTimer    = null;

  var tbodyObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.addedNodes.length) pendingBodies.add(m.target);
    });
    clearTimeout(flushTimer);
    /* Delay so ALL rows are added before we animate */
    flushTimer = setTimeout(function () {
      pendingBodies.forEach(function (tbody) { animateRows(tbody); });
      pendingBodies.clear();
    }, 20);
  });

  function observeAllBodies() {
    document.querySelectorAll('tbody').forEach(function (tbody) {
      tbodyObserver.observe(tbody, { childList: true });
    });
  }

  observeAllBodies();

  /* Also pick up tbodies that appear later when views are shown */
  new MutationObserver(function (mutations) {
    var found = false;
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType === 1) {
          if (n.tagName === 'TBODY' || n.querySelector && n.querySelector('tbody')) found = true;
        }
      });
    });
    if (found) observeAllBodies();
  }).observe(document.body, { childList: true, subtree: true });

})();
