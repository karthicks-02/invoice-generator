document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  const COMPANY = {
    name: 'KARTHICK INDUSTRIES',
    address: 'Regd.office No. C 19, Mogappair West, Ambattur\nNear Srinivasa Perumal Temple, Chennai-600 037, Tamil Nadu, India.',
    email: 'karthickindustries18@gmail.com',
    phone: '9003291274',
    gstin: '33AKKPR0176Q1ZK'
  };

  const today = new Date();
  $('invoiceDate').value = today.toISOString().split('T')[0];

  $('sameAsBuyer').addEventListener('change', e => {
    $('consigneeFields').classList.toggle('hidden', e.target.checked);
  });

  // ── Items management ──
  let items = [{ description: '', hsn: '', packages: 0, qty: 0, rate: 0 }];

  function formatBags(n) {
    if (!n || n <= 0) return '';
    return n === 1 ? '1 Bag' : n + ' Bags';
  }

  function renderItems() {
    const tbody = $('itemsBody');
    tbody.innerHTML = '';
    items.forEach((item, i) => {
      const amount = item.qty * item.rate;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" value="${esc(item.description)}" data-i="${i}" data-f="description" placeholder="SQ WELD NUT M10 X 1.25MM" /></td>
        <td><input type="text" value="${esc(item.hsn)}" data-i="${i}" data-f="hsn" placeholder="73181600" /></td>
        <td><input type="number" value="${item.packages || ''}" data-i="${i}" data-f="packages" min="0" step="1" placeholder="1" /></td>
        <td><input type="number" value="${item.qty}" data-i="${i}" data-f="qty" min="0" step="1" /></td>
        <td><input type="number" value="${item.rate}" data-i="${i}" data-f="rate" min="0" step="0.01" /></td>
        <td><div class="amount-display">₹${fmtNum(amount)}</div></td>
        <td><button type="button" class="btn-delete" data-i="${i}" title="Remove">&times;</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  $('itemsBody').addEventListener('input', e => {
    const inp = e.target;
    const i = +inp.dataset.i;
    const f = inp.dataset.f;
    if (!f) return;
    if (f === 'description' || f === 'hsn') {
      items[i][f] = inp.value;
    } else if (f === 'packages') {
      items[i].packages = parseInt(inp.value) || 0;
    } else if (f === 'qty') {
      items[i].qty = parseFloat(inp.value) || 0;
    } else if (f === 'rate') {
      items[i].rate = parseFloat(inp.value) || 0;
    }
    if (f === 'qty' || f === 'rate') {
      const amtDiv = inp.closest('tr').querySelector('.amount-display');
      amtDiv.textContent = '₹' + fmtNum(items[i].qty * items[i].rate);
    }
  });

  $('itemsBody').addEventListener('click', e => {
    if (e.target.classList.contains('btn-delete')) {
      const i = +e.target.dataset.i;
      if (items.length > 1) { items.splice(i, 1); renderItems(); }
    }
  });

  $('addItemBtn').addEventListener('click', () => {
    items.push({ description: '', hsn: '', packages: 0, qty: 0, rate: 0 });
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

  // ── Build Invoice HTML ──
  function buildInvoice() {
    const gstRate = parseFloat($('gstRate').value) || 0;
    const gstType = $('gstType').value;
    const invoiceDate = $('invoiceDate').value;
    const shortDate = invoiceDate ? formatShortDate(invoiceDate) : '';
    const poDate = $('poDate').value ? formatShortDate($('poDate').value) : '';

    const consigneeName = $('sameAsBuyer').checked ? $('buyerName').value : $('consigneeName').value;

    let subtotal = 0;
    const itemRows = items.map((item, i) => {
      const amt = item.qty * item.rate;
      subtotal += amt;
      return `<tr>
        <td class="center">${i + 1}</td>
        <td>${esc(item.description).toUpperCase() || '—'}</td>
        <td class="center">${esc(item.hsn)}</td>
        <td class="center">${formatBags(item.packages)}</td>
        <td class="right">${item.qty}</td>
        <td class="right">${fmtNum(item.rate)}</td>
        <td class="right">${fmtNum(amt)}</td>
      </tr>`;
    }).join('');

    let taxRows = '';
    let totalTax = 0;
    if (gstType === 'intra') {
      const cgst = subtotal * (gstRate / 100);
      const sgst = subtotal * (gstRate / 100);
      totalTax = cgst + sgst;
      taxRows = `
        <tr>
          <td colspan="2"></td>
          <td class="tax-label">CGST @ ${gstRate}%</td>
          <td class="tax-value">${fmtNum(cgst)}</td>
        </tr>
        <tr>
          <td colspan="2"></td>
          <td class="tax-label">SGST @ ${gstRate}%</td>
          <td class="tax-value">${fmtNum(sgst)}</td>
        </tr>
        <tr>
          <td colspan="2"></td>
          <td class="tax-label tax-total-cell">TAX AMOUNT: GST</td>
          <td class="tax-value tax-total-cell">${fmtNum(totalTax)}</td>
        </tr>`;
    } else {
      const igst = subtotal * ((gstRate * 2) / 100);
      totalTax = igst;
      taxRows = `
        <tr>
          <td colspan="2"></td>
          <td class="tax-label">IGST @ ${gstRate * 2}%</td>
          <td class="tax-value">${fmtNum(igst)}</td>
        </tr>
        <tr>
          <td colspan="2"></td>
          <td class="tax-label tax-total-cell">TAX AMOUNT: GST</td>
          <td class="tax-value tax-total-cell">${fmtNum(totalTax)}</td>
        </tr>`;
    }

    const grandTotal = subtotal + totalTax;
    const totalInWords = numberToWords(Math.round(grandTotal));

    $('invoicePaper').innerHTML = `
      <div class="inv-wrapper">
        <!-- Company Header -->
        <div class="inv-company-header">
          <div class="inv-company-name">${COMPANY.name}</div>
          <div class="inv-company-addr">${COMPANY.address.replace(/\n/g, '<br>')}</div>
          <div class="inv-company-contact">Email.Id. ${COMPANY.email} / Ph.No. ${COMPANY.phone}</div>
        </div>

        <!-- GSTIN & Copy Type Row -->
        <table class="inv-info-table">
          <tr>
            <td class="inv-gstin"><strong>GSTIN : ${COMPANY.gstin}</strong></td>
            <td class="inv-copy-type"><strong>${esc($('copyType').value)}</strong></td>
          </tr>
        </table>

        <!-- Buyer & Invoice Details -->
        <table class="inv-details-table">
          <tr>
            <td class="inv-buyer-section" rowspan="4">
              <div class="inv-small-label">Details of Buyer ( Billed To) :</div>
              <div class="inv-buyer-name"><strong>${esc($('buyerName').value).toUpperCase()}</strong></div>
              <div class="inv-buyer-addr">${esc($('buyerAddress').value).replace(/\n/g, '<br>')}</div>
              <div class="inv-small-label" style="margin-top:4px;">GSTIN : ${esc($('buyerGstin').value)}</div>
            </td>
            <td colspan="2" class="center inv-tax-title"><strong>TAX INVOICE</strong></td>
          </tr>
          <tr>
            <td class="inv-meta-label"><strong>INVOICE NO. :</strong></td>
            <td class="inv-meta-value"><strong>${esc($('invoiceNumber').value)}</strong></td>
          </tr>
          <tr>
            <td class="inv-meta-label"><strong>DATE :</strong></td>
            <td class="inv-meta-value"><strong>${shortDate}</strong></td>
          </tr>
        </table>

        <!-- Consignee / Shipped to -->
        <table class="inv-consignee-table">
          <tr>
            <td colspan="5" class="inv-small-label">Details of Consignee / shipped to :</td>
          </tr>
          <tr>
            <td colspan="2" class="inv-consignee-name"><strong>${esc(consigneeName).toUpperCase()}</strong></td>
            <td class="inv-field-label">P.Order No.</td>
            <td class="inv-field-label">P.O. Date</td>
            <td class="inv-field-label">Date :</td>
          </tr>
          <tr>
            <td>Name: ${esc($('contactPerson').value).toUpperCase()}</td>
            <td class="inv-field-label">Bank name</td>
            <td>${esc($('poNumber').value)}</td>
            <td>${poDate}</td>
            <td>${shortDate}</td>
          </tr>
          <tr>
            <td>Contact No: ${esc($('contactPhone').value)}</td>
            <td class="inv-field-label">Account Number</td>
            <td>${esc($('accountNumber').value)}</td>
            <td class="inv-field-label">IFSC</td>
            <td>${esc($('ifscCode').value)}</td>
          </tr>
          <tr>
            <td></td>
            <td>${esc($('bankName').value)}</td>
            <td></td>
            <td class="inv-field-label">Branch</td>
            <td>${esc($('bankBranch').value)}</td>
          </tr>
        </table>

        <!-- Items Table -->
        <table class="inv-items-table">
          <thead>
            <tr>
              <th class="center" style="width:6%">SL.No.</th>
              <th style="width:28%">NAME OF THE COMMODITY / SERVICE</th>
              <th class="center" style="width:10%">HSN CODE</th>
              <th class="center" style="width:10%">No.Of Packages</th>
              <th class="center" style="width:10%">Total Qty IN NOS</th>
              <th class="center" style="width:10%">Rate Per No.</th>
              <th class="right" style="width:16%">GOODS VALUE (in Rs.)</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <!-- Totals Section -->
        <table class="inv-totals-table">
          <tr>
            <td class="inv-transport-label">Mode Of Transport :</td>
            <td class="inv-transport-value">${esc($('transportMode').value)}</td>
            <td class="tax-label">TOTAL AMOUNT BEFORE TAX</td>
            <td class="tax-value">${fmtNum(subtotal)}</td>
          </tr>
          ${taxRows}
          <tr>
            <td class="inv-words-label"><strong>INVOICE Value :</strong></td>
            <td class="inv-words-value"><strong>Rupees</strong> ${totalInWords} Only</td>
            <td class="tax-label"><strong>TOTAL AMOUNT AFTER TAX</strong></td>
            <td class="tax-value"><strong>${fmtNum(grandTotal)}</strong></td>
          </tr>
        </table>

        <!-- Footer -->
        <table class="inv-footer-table">
          <tr>
            <td class="inv-cert-text">
              Certified that the particulars given above are true and correct and the amount
              indicated represents the price actually charged and that is no flow of additional
              consideration directly or indirectly from the Buyer.
            </td>
            <td class="inv-signature-section" rowspan="2">
              <div>For ${COMPANY.name}</div>
              <div class="inv-sig-space"></div>
              <div>Authorised Signatory</div>
            </td>
          </tr>
          <tr>
            <td class="inv-received-text">
              The goods Mentioned in the invoice is received in<br>
              good condition &amp; Completely
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  // ── PDF Download ──
  $('downloadBtn').addEventListener('click', () => {
    const element = $('invoicePaper');
    const invNum = $('invoiceNumber').value || 'invoice';
    const opt = {
      margin:      [0.3, 0.3, 0.3, 0.3],
      filename:    `${invNum}.pdf`,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF:       { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  });

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

  function formatShortDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function numberToWords(num) {
    if (num === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convert(n) {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
      if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
      if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
      return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
    }

    return convert(num);
  }
});
