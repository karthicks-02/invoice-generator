document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  // ── Set default dates ──
  const today = new Date();
  $('invoiceDate').value = formatDate(today);
  const due = new Date(today);
  due.setDate(due.getDate() + 30);
  $('dueDate').value = formatDate(due);

  // ── Logo handling ──
  let logoDataUrl = null;
  $('companyLogo').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      logoDataUrl = ev.target.result;
      $('logoPreview').src = logoDataUrl;
      $('logoPreview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  // ── Items management ──
  let items = [{ description: '', qty: 1, rate: 0 }];

  function renderItems() {
    const tbody = $('itemsBody');
    tbody.innerHTML = '';
    items.forEach((item, i) => {
      const amount = item.qty * item.rate;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" value="${esc(item.description)}" data-i="${i}" data-f="description" placeholder="Item description" /></td>
        <td><input type="number" value="${item.qty}" data-i="${i}" data-f="qty" min="0" step="1" /></td>
        <td><input type="number" value="${item.rate}" data-i="${i}" data-f="rate" min="0" step="0.01" /></td>
        <td><div class="amount-display">${fmtMoney(amount)}</div></td>
        <td><button type="button" class="btn-delete" data-i="${i}" title="Remove">&times;</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  $('itemsBody').addEventListener('input', e => {
    const inp = e.target;
    const i = +inp.dataset.i;
    const f = inp.dataset.f;
    if (f === 'description') items[i].description = inp.value;
    else if (f === 'qty') items[i].qty = parseFloat(inp.value) || 0;
    else if (f === 'rate') items[i].rate = parseFloat(inp.value) || 0;
    if (f === 'qty' || f === 'rate') {
      const amtDiv = inp.closest('tr').querySelector('.amount-display');
      amtDiv.textContent = fmtMoney(items[i].qty * items[i].rate);
    }
  });

  $('itemsBody').addEventListener('click', e => {
    if (e.target.classList.contains('btn-delete')) {
      const i = +e.target.dataset.i;
      if (items.length > 1) { items.splice(i, 1); renderItems(); }
    }
  });

  $('addItemBtn').addEventListener('click', () => {
    items.push({ description: '', qty: 1, rate: 0 });
    renderItems();
    const rows = $('itemsBody').querySelectorAll('tr');
    rows[rows.length - 1].querySelector('input').focus();
  });

  renderItems();

  // ── Preview ──
  $('previewBtn').addEventListener('click', () => {
    buildInvoice();
    $('formPanel').classList.add('hidden');
    $('previewPanel').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('editBtn').addEventListener('click', () => {
    $('previewPanel').classList.add('hidden');
    $('formPanel').classList.remove('hidden');
  });

  // ── Build the invoice HTML ──
  function buildInvoice() {
    const currency = $('currency').value;
    const taxRate = parseFloat($('taxRate').value) || 0;

    let subtotal = 0;
    const rowsHtml = items.map((item, i) => {
      const amt = item.qty * item.rate;
      subtotal += amt;
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(item.description) || '—'}</td>
        <td class="right">${item.qty}</td>
        <td class="right">${currency}${fmtNum(item.rate)}</td>
        <td class="right">${currency}${fmtNum(amt)}</td>
      </tr>`;
    }).join('');

    const taxAmt = subtotal * (taxRate / 100);
    const total = subtotal + taxAmt;

    const logoHtml = logoDataUrl
      ? `<img src="${logoDataUrl}" class="inv-logo" alt="Logo" />`
      : '';

    const notesHtml = $('notes').value.trim()
      ? `<div class="inv-footer-section"><div class="inv-footer-label">Notes</div><p>${esc($('notes').value)}</p></div>` : '';

    const termsHtml = $('terms').value.trim()
      ? `<div class="inv-footer-section"><div class="inv-footer-label">Terms & Conditions</div><p>${esc($('terms').value)}</p></div>` : '';

    const bankHtml = $('bankDetails').value.trim()
      ? `<div class="inv-footer-section"><div class="inv-footer-label">Payment Details</div><p>${esc($('bankDetails').value)}</p></div>` : '';

    $('invoicePaper').innerHTML = `
      <div class="inv-header">
        <div>
          ${logoHtml}
          <div class="inv-title">${esc($('companyName').value) || 'Your Company'}</div>
        </div>
        <div class="inv-meta">
          <p style="font-size:1.3rem;font-weight:700;color:var(--primary);margin-bottom:.4rem;">INVOICE</p>
          <p><strong>Invoice #:</strong> ${esc($('invoiceNumber').value) || '—'}</p>
          <p><strong>Date:</strong> ${displayDate($('invoiceDate').value)}</p>
          <p><strong>Due:</strong> ${displayDate($('dueDate').value)}</p>
        </div>
      </div>

      <div class="inv-parties">
        <div class="inv-party">
          <div class="inv-party-label">From</div>
          <div class="inv-party-name">${esc($('companyName').value) || '—'}</div>
          <p>${esc($('companyAddress').value)}</p>
          ${$('companyPhone').value ? `<p>${esc($('companyPhone').value)}</p>` : ''}
          ${$('companyEmail').value ? `<p>${esc($('companyEmail').value)}</p>` : ''}
          ${$('companyTax').value ? `<p>Tax ID: ${esc($('companyTax').value)}</p>` : ''}
        </div>
        <div class="inv-party">
          <div class="inv-party-label">Bill To</div>
          <div class="inv-party-name">${esc($('clientName').value) || '—'}</div>
          <p>${esc($('clientAddress').value)}</p>
          ${$('clientEmail').value ? `<p>${esc($('clientEmail').value)}</p>` : ''}
        </div>
      </div>

      <table class="inv-table">
        <thead>
          <tr>
            <th style="width:6%">#</th>
            <th>Description</th>
            <th class="right" style="width:10%">Qty</th>
            <th class="right" style="width:16%">Rate</th>
            <th class="right" style="width:16%">Amount</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div class="inv-totals">
        <table>
          <tr><td>Subtotal</td><td>${currency}${fmtNum(subtotal)}</td></tr>
          <tr><td>Tax (${taxRate}%)</td><td>${currency}${fmtNum(taxAmt)}</td></tr>
          <tr class="grand-total"><td>Total</td><td>${currency}${fmtNum(total)}</td></tr>
        </table>
      </div>

      <div class="inv-footer">
        ${bankHtml}
        ${notesHtml}
        ${termsHtml}
      </div>
    `;
  }

  // ── PDF Download ──
  $('downloadBtn').addEventListener('click', () => {
    const element = $('invoicePaper');
    const invNum = $('invoiceNumber').value || 'invoice';
    const opt = {
      margin:       [0.4, 0.4, 0.4, 0.4],
      filename:     `${invNum}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  });

  // ── Print ──
  $('printBtn').addEventListener('click', () => window.print());

  // ── Helpers ──
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function fmtNum(n) {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtMoney(n) {
    const currency = $('currency').value;
    return currency + fmtNum(n);
  }

  function formatDate(d) {
    return d.toISOString().split('T')[0];
  }

  function displayDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
});
