document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  const COMPANY = {
    name: 'KARTHICK INDUSTRIES',
    address: 'No. 61, SSOA Complex, Natesan Nagar, Vanagaram Road,\nAthipet, Chennai - 600 058.',
    email: 'karthickindustries18@gmail.com',
    phone: '9003291274',
    gstin: '33AKKPR0176Q1ZK'
  };

  const today = new Date();
  $('invoiceDate').value = today.toISOString().split('T')[0];

  $('sameAsBuyer').addEventListener('change', e => {
    $('consigneeFields').classList.toggle('hidden', e.target.checked);
  });

  $('gstType').addEventListener('change', e => {
    if (e.target.value === 'inter') {
      $('gstRate').value = 18;
    } else {
      $('gstRate').value = 9;
    }
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
    const consigneeAddr = $('sameAsBuyer').checked ? $('buyerAddress').value : $('consigneeAddress').value;

    let subtotal = 0;
    const itemRows = items.map((item, i) => {
      const amt = item.qty * item.rate;
      subtotal += amt;
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="l">${esc(item.description).toUpperCase() || '—'}</td>
        <td class="c">${esc(item.hsn)}</td>
        <td class="c">${formatBags(item.packages)}</td>
        <td class="c">${item.qty}</td>
        <td class="c">${fmtNum(item.rate)}</td>
        <td class="r">${fmtNum(amt)}</td>
      </tr>`;
    }).join('');

    let totalTax = 0;
    let cgstAmt = 0, sgstAmt = 0, igstAmt = 0;
    if (gstType === 'intra') {
      cgstAmt = subtotal * (gstRate / 100);
      sgstAmt = subtotal * (gstRate / 100);
      totalTax = cgstAmt + sgstAmt;
    } else {
      igstAmt = subtotal * (gstRate / 100);
      totalTax = igstAmt;
    }
    const grandTotal = subtotal + totalTax;
    const wordsStr = numberToWords(Math.round(grandTotal));

    $('invoicePaper').innerHTML = `
      <div class="inv">
        <!-- ─── Company Header ─── -->
        <div class="inv-hdr">
          <div class="inv-hdr-name">${COMPANY.name}</div>
          <div class="inv-hdr-addr">${COMPANY.address.replace(/\n/g, '<br>')}</div>
          <div class="inv-hdr-addr">Email.Id. ${COMPANY.email} / Ph.No. ${COMPANY.phone}</div>
        </div>

        <!-- ─── GSTIN Row ─── -->
        <div class="inv-row inv-gstin-row">
          <span><strong>GSTIN : ${COMPANY.gstin}</strong></span>
          <span><strong>${esc($('copyType').value)}</strong></span>
        </div>

        <!-- ─── Buyer + TAX INVOICE ─── -->
        <table class="inv-tbl">
          <colgroup><col style="width:55%"><col style="width:20%"><col style="width:25%"></colgroup>
          <tr>
            <td rowspan="3" class="inv-buyer-cell">
              <div class="inv-lbl">Details of Buyer ( Billed To) :</div>
              <div class="inv-buyer-name">${esc($('buyerName').value).toUpperCase()}</div>
              <div class="inv-buyer-addr">${esc($('buyerAddress').value).replace(/\n/g, '<br>')}</div>
              <div class="inv-lbl" style="margin-top:3px">GSTIN : ${esc($('buyerGstin').value)}</div>
            </td>
            <td colspan="2" class="c inv-tax-title"><strong>TAX INVOICE</strong></td>
          </tr>
          <tr>
            <td class="bld">INVOICE NO. :</td>
            <td class="bld inv-meta-val">${esc($('invoiceNumber').value)}</td>
          </tr>
          <tr>
            <td class="bld">DATE :</td>
            <td class="bld inv-meta-val">${shortDate}</td>
          </tr>
        </table>

        <!-- ─── Consignee ─── -->
        <table class="inv-tbl inv-con">
          <colgroup>
            <col style="width:28%">
            <col style="width:14%">
            <col style="width:22%">
            <col style="width:12%">
            <col style="width:24%">
          </colgroup>
          <tr>
            <td rowspan="3" style="vertical-align:top;padding:8px 10px">
              <div class="inv-lbl" style="margin-bottom:4px">Details of Consignee / shipped to :</div>
              <div style="font-weight:700;margin-bottom:4px">${esc(consigneeName).toUpperCase()}</div>
              <div style="margin-bottom:4px">${esc(consigneeAddr).replace(/\n/g, '<br>')}</div>
              ${$('contactPerson').value.trim() ? `<div style="margin-bottom:4px">Contact Name:${esc($('contactPerson').value).toUpperCase()}</div>` : ''}
              <div style="margin-bottom:4px">Contact:${esc($('contactPhone').value)}</div>
              <div>GSTIN : ${esc($('buyerGstin').value)}</div>
            </td>
            <td class="inv-flbl">P.Order No.</td>
            <td>${esc($('poNumber').value)}</td>
            <td class="inv-flbl">P.O. Date</td>
            <td>${poDate}</td>
          </tr>
          <tr>
            <td class="inv-flbl">Bank name</td>
            <td>${esc($('bankName').value)}</td>
            <td class="inv-flbl">Branch</td>
            <td>${esc($('bankBranch').value)}</td>
          </tr>
          <tr>
            <td class="inv-flbl">Account<br>Number</td>
            <td>${esc($('accountNumber').value)}</td>
            <td class="inv-flbl">IFSC</td>
            <td>${esc($('ifscCode').value)}</td>
          </tr>
        </table>

        <!-- ─── Items ─── -->
        <table class="inv-tbl inv-items">
          <colgroup>
            <col style="width:5%">
            <col style="width:29%">
            <col style="width:11%">
            <col style="width:10%">
            <col style="width:11%">
            <col style="width:10%">
            <col style="width:14%">
          </colgroup>
          <thead>
            <tr>
              <th>SL.No.</th>
              <th>NAME OF THE COMMODITY / SERVICE</th>
              <th>HSN CODE</th>
              <th>No.Of<br>Packages</th>
              <th>Total Qty IN<br>NOS</th>
              <th>Rate Per No.</th>
              <th>GOODS VALUE<br>(in Rs.)</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <!-- ─── Bottom Section (Totals + Footer) ─── -->
        <table class="inv-tbl inv-bottom">
          <colgroup>
            <col style="width:18%">
            <col style="width:32%">
            <col style="width:30%">
            <col style="width:20%">
          </colgroup>
          <tr>
            <td style="white-space:nowrap"><strong>Mode Of Transport :</strong></td>
            <td>${esc($('transportMode').value)}</td>
            <td class="r">TOTAL AMOUNT BEFORE TAX</td>
            <td class="r">${fmtNum(subtotal)}</td>
          </tr>
          ${gstType === 'intra' ? `
          <tr>
            <td rowspan="3" class="c"><strong>INVOICE Value :</strong><br>Rupees</td>
            <td rowspan="3" class="c"><strong>Rupees ${wordsStr} Only</strong></td>
            <td class="r">CGST @ ${gstRate}%</td>
            <td class="r">${fmtNum(cgstAmt)}</td>
          </tr>
          <tr>
            <td class="r">SGST @ ${gstRate}%</td>
            <td class="r">${fmtNum(sgstAmt)}</td>
          </tr>
          <tr>
            <td class="r"><strong>TAX AMOUNT: GST</strong></td>
            <td class="r"><strong>${fmtNum(totalTax)}</strong></td>
          </tr>
          ` : `
          <tr>
            <td rowspan="2" class="c"><strong>INVOICE Value :</strong><br>Rupees</td>
            <td rowspan="2" class="c"><strong>Rupees ${wordsStr} Only</strong></td>
            <td class="r">IGST @ ${gstRate}%</td>
            <td class="r">${fmtNum(igstAmt)}</td>
          </tr>
          <tr>
            <td class="r"><strong>TAX AMOUNT: GST</strong></td>
            <td class="r"><strong>${fmtNum(totalTax)}</strong></td>
          </tr>
          `}
          <tr>
            <td colspan="2" class="inv-cert">
              Certified that the particulars given above are true and correct and the amount
              indicated represents the price actually charged and that is no flow of additional
              consideration directly or indirectly from the Buyer.
            </td>
            <td class="r"><strong>TOTAL AMOUNT<br>AFTER TAX</strong></td>
            <td class="r"><strong>${fmtNum(grandTotal)}</strong></td>
          </tr>
          <tr>
            <td colspan="2" class="inv-recv" style="vertical-align:top;padding:8px 10px">
              <strong>The goods Mentioned in the invoice is received in
              good condition &amp; Completely</strong>
              <div style="margin-top:20px">Receivers Name :</div>
              <div style="margin-top:20px">Receivers Signature :</div>
            </td>
            <td colspan="2" class="inv-sig inv-sig-combined">
              <div>For ${COMPANY.name}</div>
              <div class="inv-sig-space"></div>
              <div>Authorised Signatory</div>
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
