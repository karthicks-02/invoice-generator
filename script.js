document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  /** YYYY-MM-DD in local timezone (toISOString() is UTC and shifts the calendar day in IST etc.). */
  function formatDateYMDLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ══════════════════════════════════════
  // ── Auth: Login / Register / Logout ──
  // ══════════════════════════════════════
  $('loginBtn').addEventListener('click', async () => {
    const email = $('authEmail').value.trim();
    const pass = $('authPass').value;
    $('authError').classList.add('hidden');
    if (!email || !pass) { showAuthError('Enter email and password'); return; }
    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
      showAuthError(e.message);
    }
  });

  $('registerBtn').addEventListener('click', async () => {
    const email = $('authEmail').value.trim();
    const pass = $('authPass').value;
    $('authError').classList.add('hidden');
    if (!email || !pass) { showAuthError('Enter email and password'); return; }
    if (pass.length < 6) { showAuthError('Password must be at least 6 characters'); return; }
    try {
      await auth.createUserWithEmailAndPassword(email, pass);
    } catch (e) {
      showAuthError(e.message);
    }
  });

  $('logoutBtn').addEventListener('click', () => auth.signOut());

  $('authPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('loginBtn').click();
  });

  function showAuthError(msg) {
    $('authError').textContent = msg;
    $('authError').classList.remove('hidden');
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      db.setUser(user.uid);
      $('userEmail').textContent = user.email;
      $('userBar').classList.remove('hidden');
      $('authPanel').classList.add('hidden');
      $('loadingPanel').classList.remove('hidden');

      await db.migrateFromLocalStorage();

      customers = await db.loadCustomers();
      products = await db.loadProducts();
      invoices = await db.loadInvoices();
      payments = await db.loadPayments();
      vendors = await db.loadVendors();
      purchaseProducts = await db.loadPurchaseProducts();
      poInvoices = await db.loadPoInvoices();
      vendorPayments = await db.loadVendorPayments();
      migratePaymentCreditIds();
      migrateVendorPaymentCreditIds();

      renderCustomers();
      renderProducts();
      renderPurchaseProducts();
      renderVendors();
      checkReminders();
      checkVendorReminders();

      $('loadingPanel').classList.add('hidden');
      hideCustForm();
      hideProdForm();
      hidePprodForm();
      hideVendForm();
      $('previewPanel').classList.add('hidden');
      $('poPreviewPanel').classList.add('hidden');
      goHome();
    } else {
      customers = [];
      products = [];
      purchaseProducts = [];
      invoices = [];
      payments = {};
      vendors = [];
      poInvoices = [];
      vendorPayments = {};
      db.setUser(null);

      $('userBar').classList.add('hidden');
      $('loadingPanel').classList.add('hidden');
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      $('homePanel').classList.add('hidden');
      $('authPanel').classList.remove('hidden');
    }
  });

  // ══════════════════════════════════════
  // ── Navigation: Home ↔ Views ──
  // ══════════════════════════════════════
  function showView(viewId) {
    $('homePanel').classList.add('hidden');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $(viewId).classList.remove('hidden');
  }

  function goHome() {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('homePanel').classList.remove('hidden');
  }

  let cameFromInvoiceList = false;
  let cameFromPayment = false;
  let cameFromVendorPayment = false;

  $('custBackBtn').addEventListener('click', () => {
    if (!$('custFormWrap').classList.contains('hidden')) {
      hideCustForm();
    } else {
      goHome();
    }
  });
  $('prodBackBtn').addEventListener('click', () => {
    if (!$('prodFormWrap').classList.contains('hidden')) {
      hideProdForm();
    } else {
      goHome();
    }
  });
  $('invBackBtn').addEventListener('click', () => {
    $('previewPanel').classList.add('hidden');
    $('formPanel').classList.remove('hidden');
    if (cameFromPayment) {
      cameFromPayment = false;
      showView('paymentView');
      renderPaymentView();
    } else if (cameFromInvoiceList) {
      cameFromInvoiceList = false;
      showView('invoiceListView');
      renderInvoiceList();
    } else {
      goHome();
    }
  });
  $('invListBackBtn').addEventListener('click', goHome);

  $('payBackBtn').addEventListener('click', goHome);
  $('vpayBackBtn').addEventListener('click', goHome);

  document.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', () => {
      showView(card.dataset.view);
      if (card.dataset.view === 'invoiceListView') renderInvoiceList();
      if (card.dataset.view === 'invoiceView') { resetInvoiceForm(); }
      if (card.dataset.view === 'paymentView') renderPaymentView();
      if (card.dataset.view === 'vendorPayView') renderVendorPaymentView();
      if (card.dataset.view === 'productView') hideProdForm();
      if (card.dataset.view === 'customerView') hideCustForm();
      if (card.dataset.view === 'vendorView') hideVendForm();
      if (card.dataset.view === 'poInvoiceView') { resetPoInvoiceForm(); }
      if (card.dataset.view === 'poInvoiceListView') renderPoInvoiceList();
    });
  });

  // ══════════════════════════════════════
  // ── Customer List CRUD ──
  // ══════════════════════════════════════
  let customers = [];
  let editCustIdx = -1;

  function saveCustomers() {
    db.saveCustomers(customers);
  }

  function customerGstTypeLabel(v) {
    return v === 'inter' ? 'Inter (IGST)' : 'Intra (CGST+SGST)';
  }

  function renderCustomers() {
    const tbody = $('custBody');
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const query = ($('custSearch').value || '').toLowerCase().trim();
    const filtered = customers.map((c, i) => ({ c, i })).filter(({ c }) => {
      if (!query) return true;
      return (c.name || '').toLowerCase().includes(query)
        || (c.gstin || '').toLowerCase().includes(query)
        || (c.contact || '').toLowerCase().includes(query)
        || (c.phone || '').toLowerCase().includes(query);
    });
    $('custEmpty').style.display = filtered.length ? 'none' : 'block';
    $('custEmpty').textContent = customers.length ? 'No matching customers.' : 'No customers added yet.';
    $('custTable').style.display = filtered.length ? 'table' : 'none';
    filtered.forEach(({ c, i }) => {
      const conCount = c.consignees ? c.consignees.length : 0;
      const poParts = [];
      if (c.poNumber) poParts.push(escHtml(c.poNumber));
      if (c.poDate) poParts.push(formatShortDate(c.poDate));
      const poSummary = poParts.length ? poParts.join(' &middot; ') : '&mdash;';
      const waCount = c.waNumbers ? c.waNumbers.length : 0;
      const waDisplay = waCount > 0 ? c.waNumbers.map(n => escHtml(n)).join(', ') : '&mdash;';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="cust-check" data-i="${i}" /></td>
        <td>${escHtml(c.name)}</td>
        <td>${escHtml(c.gstin)}</td>
        <td>${escHtml(customerGstTypeLabel(c.gstType))}</td>
        <td class="cust-po-cell">${poSummary}</td>
        <td>${escHtml(c.contact)}</td>
        <td>${escHtml(c.phone)}</td>
        <td class="wa-col">${waDisplay}</td>
        <td>${conCount}</td>
        <td class="actions">
          <button class="btn-edit" data-i="${i}">Edit</button>
          <button class="btn-del" data-i="${i}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
    if ($('custSelectAll')) $('custSelectAll').checked = false;
  }

  $('custSearch').addEventListener('input', () => renderCustomers());

  $('custSelectAll').addEventListener('change', e => {
    document.querySelectorAll('.cust-check').forEach(cb => cb.checked = e.target.checked);
  });

  let tempConsignees = [];
  let tempWaNumbers = [];

  function renderCustWaNumbers() {
    var list = $('custWaNumbersList');
    while (list.firstChild) list.removeChild(list.firstChild);
    tempWaNumbers.forEach(function(num, i) {
      var chip = document.createElement('span');
      chip.className = 'wa-num-chip';
      chip.textContent = '+91 ' + num;
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'wa-num-chip-del';
      del.textContent = '\u00d7';
      del.addEventListener('click', function() {
        tempWaNumbers.splice(i, 1);
        renderCustWaNumbers();
      });
      chip.appendChild(del);
      list.appendChild(chip);
    });
  }

  $('custWaNumAddBtn').addEventListener('click', function() {
    var val = $('custWaNumInput').value.replace(/\D/g, '');
    if (val.length !== 10) { alert('Enter a valid 10-digit number.'); return; }
    if (tempWaNumbers.indexOf(val) >= 0) { alert('Number already added.'); return; }
    tempWaNumbers.push(val);
    $('custWaNumInput').value = '';
    renderCustWaNumbers();
  });

  $('custWaNumInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); $('custWaNumAddBtn').click(); }
  });

  let editConIdx = -1;

  function renderConsigneeList() {
    const wrap = $('consigneeList');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    tempConsignees.forEach((con, i) => {
      const div = document.createElement('div');
      div.className = 'consignee-item';
      const info = document.createElement('div');
      info.className = 'consignee-item-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'consignee-item-name';
      nameEl.textContent = con.name;
      const addrEl = document.createElement('div');
      addrEl.className = 'consignee-item-addr';
      addrEl.textContent = con.address;
      info.appendChild(nameEl);
      info.appendChild(addrEl);
      div.appendChild(info);
      const actions = document.createElement('div');
      actions.className = 'consignee-item-actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit';
      editBtn.textContent = 'Edit';
      editBtn.dataset.ci = i;
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del';
      delBtn.textContent = 'Delete';
      delBtn.dataset.ci = i;
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      div.appendChild(actions);
      wrap.appendChild(div);
    });
  }

  function resetConsigneeForm() {
    $('conName').value = '';
    $('conAddress').value = '';
    $('consigneeFormRow').classList.add('hidden');
    editConIdx = -1;
    $('saveConsigneeBtn').textContent = 'Add Consignee';
  }

  $('addConsigneeBtn').addEventListener('click', () => {
    resetConsigneeForm();
    $('consigneeFormRow').classList.remove('hidden');
  });

  $('cancelConsigneeBtn').addEventListener('click', () => {
    resetConsigneeForm();
  });

  $('saveConsigneeBtn').addEventListener('click', () => {
    const name = $('conName').value.trim();
    const address = $('conAddress').value.trim();
    if (!name) { alert('Consignee Name is required'); return; }
    if (editConIdx >= 0) {
      tempConsignees[editConIdx] = { name, address };
    } else {
      tempConsignees.push({ name, address });
    }
    renderConsigneeList();
    resetConsigneeForm();
  });

  $('consigneeList').addEventListener('click', e => {
    const btn = e.target;
    const ci = +btn.dataset.ci;
    if (btn.classList.contains('btn-edit')) {
      editConIdx = ci;
      const con = tempConsignees[ci];
      $('conName').value = con.name;
      $('conAddress').value = con.address;
      $('saveConsigneeBtn').textContent = 'Update Consignee';
      $('consigneeFormRow').classList.remove('hidden');
    }
    if (btn.classList.contains('btn-del')) {
      tempConsignees.splice(ci, 1);
      renderConsigneeList();
      if (editConIdx === ci) resetConsigneeForm();
    }
  });

  function showCustForm() {
    $('custFormWrap').classList.remove('hidden');
    $('custTableWrap').classList.add('hidden');
  }
  function hideCustForm() {
    $('custFormWrap').classList.add('hidden');
    $('custTableWrap').classList.remove('hidden');
  }

  function downloadCSV(rows, filename) {
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  $('downloadCustBtn').addEventListener('click', () => {
    if (!customers.length) { alert('No customers to download'); return; }
    const checked = document.querySelectorAll('.cust-check:checked');
    const selected = checked.length
      ? Array.from(checked).map(cb => ({ c: customers[+cb.dataset.i], i: +cb.dataset.i }))
      : customers.map((c, i) => ({ c, i }));
    const header = ['#', 'Company Name', 'GSTIN', 'GST Type', 'Address', 'Contact Person', 'Phone', 'P.Order No.', 'P.O. Date', 'Consignees'];
    const rows = [header];
    selected.forEach(({ c, i }) => {
      const conNames = (c.consignees || []).map(cn => cn.name).join('; ');
      rows.push([
        i + 1, c.name, c.gstin,
        c.gstType === 'inter' ? 'Inter-State' : 'Intra-State',
        c.address, c.contact, c.phone,
        c.poNumber || '', c.poDate || '', conNames
      ]);
    });
    downloadCSV(rows, checked.length ? 'customers-selected.csv' : 'customers.csv');
  });

  $('addCustBtn').addEventListener('click', () => {
    editCustIdx = -1;
    $('custFormTitle').textContent = 'Add Customer';
    $('custName').value = '';
    $('custGstin').value = '';
    $('custAddress').value = '';
    $('custContact').value = '';
    $('custPhone').value = '';
    $('custPoNumber').value = '';
    $('custPoDate').value = '';
    $('custGstType').value = 'intra';
    tempConsignees = [];
    tempCustProducts = [];
    tempWaNumbers = [];
    renderConsigneeList();
    renderCustProdList();
    renderCustWaNumbers();
    resetConsigneeForm();
    $('custProdFormRow').classList.add('hidden');
    showCustForm();
  });

  $('cancelCustBtn').addEventListener('click', () => {
    hideCustForm();
  });

  $('saveCustBtn').addEventListener('click', () => {
    const obj = {
      name: $('custName').value.trim(),
      gstin: $('custGstin').value.trim(),
      address: $('custAddress').value.trim(),
      contact: $('custContact').value.trim(),
      phone: $('custPhone').value.trim(),
      poNumber: $('custPoNumber').value.trim(),
      poDate: $('custPoDate').value,
      gstType: $('custGstType').value,
      consignees: [...tempConsignees],
      associatedProducts: [...tempCustProducts],
      waNumbers: [...tempWaNumbers]
    };
    if (!obj.name) { alert('Company Name is required'); return; }
    if (editCustIdx >= 0) {
      customers[editCustIdx] = obj;
    } else {
      customers.push(obj);
    }
    saveCustomers();
    renderCustomers();
    hideCustForm();
  });

  $('custBody').addEventListener('click', e => {
    const i = +e.target.dataset.i;
    if (e.target.classList.contains('btn-edit')) {
      editCustIdx = i;
      const c = customers[i];
      $('custFormTitle').textContent = 'Edit Customer';
      $('custName').value = c.name;
      $('custGstin').value = c.gstin;
      $('custAddress').value = c.address;
      $('custContact').value = c.contact;
      $('custPhone').value = c.phone;
      $('custPoNumber').value = c.poNumber || '';
      $('custPoDate').value = c.poDate || '';
      $('custGstType').value = c.gstType === 'inter' ? 'inter' : 'intra';
      tempConsignees = c.consignees ? c.consignees.map(x => ({...x})) : [];
      tempCustProducts = c.associatedProducts ? [...c.associatedProducts] : [];
      tempWaNumbers = c.waNumbers ? [...c.waNumbers] : [];
      renderConsigneeList();
      renderCustProdList();
      renderCustWaNumbers();
      resetConsigneeForm();
      $('custProdFormRow').classList.add('hidden');
      showCustForm();
    }
    if (e.target.classList.contains('btn-del')) {
      if (confirm('Delete this customer?')) {
        customers.splice(i, 1);
        saveCustomers();
        renderCustomers();
      }
    }
  });

  // ══════════════════════════════════════
  // ── Customer Associated Products ──
  // ══════════════════════════════════════
  let tempCustProducts = [];

  function renderCustProdList() {
    const wrap = $('custProdList');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    tempCustProducts.forEach((pName, i) => {
      const prod = products.find(p => p.name === pName);
      const div = document.createElement('div');
      div.className = 'consignee-item';
      const info = document.createElement('div');
      info.className = 'consignee-item-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'consignee-item-name';
      nameEl.textContent = pName;
      info.appendChild(nameEl);
      if (prod) {
        const detailEl = document.createElement('div');
        detailEl.className = 'consignee-item-addr';
        detailEl.textContent = 'HSN: ' + (prod.hsn || '—') + '  |  Rate: ₹' + Number(prod.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        info.appendChild(detailEl);
      }
      div.appendChild(info);
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del';
      delBtn.textContent = 'Remove';
      delBtn.dataset.cpi = i;
      div.appendChild(delBtn);
      wrap.appendChild(div);
    });
  }

  function resetCustProdForm() {
    $('custProdNameInput').value = '';
    $('custProdHsnInput').value = '';
    $('custProdRateInput').value = '';
    $('custProdFormRow').classList.add('hidden');
  }

  $('addCustProdBtn').addEventListener('click', () => {
    resetCustProdForm();
    $('custProdFormRow').classList.remove('hidden');
    $('custProdNameInput').focus();
  });

  $('cancelCustProdBtn').addEventListener('click', resetCustProdForm);

  $('saveCustProdBtn').addEventListener('click', () => {
    const name = $('custProdNameInput').value.trim();
    const hsn = $('custProdHsnInput').value.trim();
    const parsedRate = parseRateToStore($('custProdRateInput').value);
    const rate = parsedRate == null ? 0 : parsedRate;
    if (!name) { alert('Product Name is required'); return; }

    const existIdx = products.findIndex(p => p.name.trim().toLowerCase() === name.toLowerCase());
    if (existIdx >= 0) {
      products[existIdx].hsn = hsn || products[existIdx].hsn;
      products[existIdx].rate = rate || products[existIdx].rate;
    } else {
      products.push({ name, hsn, rate });
    }
    saveProducts();
    renderProducts();

    const canonical = existIdx >= 0 ? products[existIdx].name : name;
    if (!tempCustProducts.includes(canonical)) {
      tempCustProducts.push(canonical);
      renderCustProdList();
    }
    resetCustProdForm();
  });

  $('custProdList').addEventListener('click', e => {
    if (e.target.classList.contains('btn-del')) {
      tempCustProducts.splice(+e.target.dataset.cpi, 1);
      renderCustProdList();
    }
  });

  // ══════════════════════════════════════
  // ── Product List CRUD ──
  // ══════════════════════════════════════
  let products = [];
  let editProdIdx = -1;

  function saveProducts() {
    db.saveProducts(products);
  }

  function renderProducts() {
    const tbody = $('prodBody');
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const query = ($('prodSearch').value || '').toLowerCase().trim();
    const filtered = products.map((p, i) => ({ p, i })).filter(({ p }) => {
      if (!query) return true;
      return (p.name || '').toLowerCase().includes(query)
        || (p.hsn || '').toLowerCase().includes(query)
        || String(p.rate).includes(query);
    });
    $('prodEmpty').style.display = filtered.length ? 'none' : 'block';
    $('prodEmpty').textContent = products.length ? 'No matching products.' : 'No products added yet.';
    $('prodTable').style.display = filtered.length ? 'table' : 'none';
    filtered.forEach(({ p, i }) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="prod-check" data-i="${i}" /></td>
        <td>${escHtml(p.name)}</td>
        <td>${escHtml(p.hsn)}</td>
        <td>${Number(p.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="actions">
          <button class="btn-edit" data-i="${i}">Edit</button>
          <button class="btn-del" data-i="${i}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
    if ($('prodSelectAll')) $('prodSelectAll').checked = false;
  }

  $('prodSearch').addEventListener('input', () => renderProducts());

  $('prodSelectAll').addEventListener('change', e => {
    document.querySelectorAll('.prod-check').forEach(cb => cb.checked = e.target.checked);
  });

  function showProdForm() {
    $('prodFormWrap').classList.remove('hidden');
    $('prodTableWrap').classList.add('hidden');
  }
  function hideProdForm() {
    $('prodFormWrap').classList.add('hidden');
    $('prodTableWrap').classList.remove('hidden');
  }

  function openProdEdit(i) {
    editProdIdx = i;
    const p = products[i];
    $('prodFormTitle').textContent = 'Edit Product';
    $('prodName').value = p.name;
    $('prodHsn').value = p.hsn;
    const pr = Number(p.rate);
    $('prodRate').value = Number.isFinite(pr) ? String(Math.round(pr * 100) / 100) : '';
    showProdForm();
  }

  function updateProdSuggestions() {
    const box = $('prodSuggestions');
    if (editProdIdx >= 0) { box.classList.add('hidden'); return; }
    const q = $('prodName').value.trim().toLowerCase();
    if (!q) { box.classList.add('hidden'); return; }
    const matches = products
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
    if (!matches.length) { box.classList.add('hidden'); return; }
    while (box.firstChild) box.removeChild(box.firstChild);
    matches.forEach(({ p, i }) => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.dataset.i = i;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'suggestion-item-name';
      nameSpan.textContent = p.name;
      const detailSpan = document.createElement('span');
      detailSpan.className = 'suggestion-item-detail';
      detailSpan.textContent = 'HSN: ' + (p.hsn || '—') + '  |  ₹' + Number(p.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      div.appendChild(nameSpan);
      div.appendChild(detailSpan);
      box.appendChild(div);
    });
    box.classList.remove('hidden');
  }

  $('prodName').addEventListener('input', updateProdSuggestions);
  $('prodName').addEventListener('focus', updateProdSuggestions);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#prodSuggestions') && e.target !== $('prodName')) {
      $('prodSuggestions').classList.add('hidden');
    }
  });
  $('prodSuggestions').addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    openProdEdit(+item.dataset.i);
    $('prodSuggestions').classList.add('hidden');
  });

  $('downloadProdBtn').addEventListener('click', () => {
    if (!products.length) { alert('No products to download'); return; }
    const checked = document.querySelectorAll('.prod-check:checked');
    const selected = checked.length
      ? Array.from(checked).map(cb => ({ p: products[+cb.dataset.i], i: +cb.dataset.i }))
      : products.map((p, i) => ({ p, i }));
    const header = ['#', 'Product Name', 'HSN Code', 'Rate'];
    const rows = [header];
    selected.forEach(({ p, i }) => {
      rows.push([i + 1, p.name, p.hsn, Number(p.rate).toFixed(2)]);
    });
    downloadCSV(rows, checked.length ? 'products-selected.csv' : 'products.csv');
  });

  $('addProdBtn').addEventListener('click', () => {
    editProdIdx = -1;
    $('prodFormTitle').textContent = 'Add Product';
    $('prodName').value = '';
    $('prodHsn').value = '';
    $('prodRate').value = '';
    $('prodSuggestions').classList.add('hidden');
    showProdForm();
  });

  $('cancelProdBtn').addEventListener('click', () => {
    $('prodSuggestions').classList.add('hidden');
    hideProdForm();
  });

  $('saveProdBtn').addEventListener('click', () => {
    const parsedRate = parseRateToStore($('prodRate').value);
    const obj = {
      name: $('prodName').value.trim(),
      hsn: $('prodHsn').value.trim(),
      rate: parsedRate == null ? 0 : parsedRate
    };
    if (!obj.name) { alert('Product Name is required'); return; }
    if (editProdIdx < 0) {
      const dupIdx = products.findIndex(p => p.name.trim().toLowerCase() === obj.name.toLowerCase());
      if (dupIdx >= 0) {
        if (confirm('A product named "' + products[dupIdx].name + '" already exists. Edit it instead?')) {
          openProdEdit(dupIdx);
          return;
        }
      }
    }
    if (editProdIdx >= 0) {
      products[editProdIdx] = obj;
    } else {
      products.push(obj);
    }
    saveProducts();
    renderProducts();
    hideProdForm();
  });

  $('prodBody').addEventListener('click', e => {
    const i = +e.target.dataset.i;
    if (e.target.classList.contains('btn-edit')) {
      openProdEdit(i);
    }
    if (e.target.classList.contains('btn-del')) {
      if (confirm('Delete this product?')) {
        products.splice(i, 1);
        saveProducts();
        renderProducts();
      }
    }
  });

  // ══════════════════════════════════════
  // ── Invoice Storage ──
  // ══════════════════════════════════════
  let invoices = [];
  let editingInvoiceId = null;

  function normalizeInvoiceNo(s) {
    return (s || '').trim().toLowerCase();
  }

  /** Another saved invoice (not excludeId) already uses this number — comparison is case-insensitive, trimmed. */
  function getInvoiceNumberConflict(rawNo, excludeId) {
    const key = normalizeInvoiceNo(rawNo);
    if (!key) return null;
    return invoices.find(inv => normalizeInvoiceNo(inv.invoiceNumber) === key && inv.id !== excludeId) || null;
  }

  function refreshInvoiceNumberDuplicateHint() {
    const errEl = $('invoiceNumberError');
    const inp = $('invoiceNumber');
    if (!errEl || !inp) return;
    const conflict = getInvoiceNumberConflict(inp.value, editingInvoiceId);
    if (conflict) {
      errEl.textContent = 'This invoice number is already used. Pick a new number or edit the existing invoice in All Invoices.';
      errEl.classList.remove('hidden');
      inp.setAttribute('aria-invalid', 'true');
    } else {
      errEl.textContent = '';
      errEl.classList.add('hidden');
      inp.removeAttribute('aria-invalid');
    }
  }

  function saveInvoices() {
    db.saveInvoices(invoices);
  }

  function collectInvoiceData() {
    return {
      invoiceNumber: $('invoiceNumber').value.trim(),
      invoiceDate: $('invoiceDate').value,
      copyTypes: getSelectedCopyTypes('copyType'),
      buyerName: $('buyerName').value.trim(),
      buyerGstin: $('buyerGstin').value.trim(),
      buyerAddress: $('buyerAddress').value.trim(),
      sameAsBuyer: $('sameAsBuyer').checked,
      consigneeName: $('consigneeName').value.trim(),
      consigneeAddress: $('consigneeAddress').value.trim(),
      contactPerson: $('contactPerson').value.trim(),
      contactPhone: $('contactPhone').value.trim(),
      poNumber: $('poNumber').value.trim(),
      poDate: $('poDate').value,
      bankName: $('bankName').value.trim(),
      bankBranch: $('bankBranch').value.trim(),
      accountNumber: $('accountNumber').value.trim(),
      ifscCode: $('ifscCode').value.trim(),
      items: items.map(it => ({ ...it })),
      transportMode: $('transportMode').value.trim(),
      gstRate: parseFloat($('gstRate').value) || 0,
      gstType: $('gstType').value,
      reminderDate: $('invoiceReminder').value || ''
    };
  }

  function saveCurrentInvoice() {
    if (getInvoiceNumberConflict($('invoiceNumber').value, editingInvoiceId)) return false;
    const data = collectInvoiceData();
    if (editingInvoiceId) {
      const idx = invoices.findIndex(inv => inv.id === editingInvoiceId);
      if (idx >= 0) {
        data.id = editingInvoiceId;
        data.createdAt = invoices[idx].createdAt;
        data.updatedAt = new Date().toISOString();
        invoices[idx] = data;
      }
    } else {
      data.id = Date.now().toString();
      data.createdAt = new Date().toISOString();
      invoices.push(data);
      editingInvoiceId = data.id;
    }
    saveInvoices();
    return true;
  }

  function loadInvoiceIntoForm(inv) {
    editingInvoiceId = inv.id;
    $('invoiceNumber').value = inv.invoiceNumber || '';
    $('invoiceDate').value = inv.invoiceDate || '';
    $('buyerName').value = inv.buyerName || '';
    $('buyerGstin').value = inv.buyerGstin || '';
    $('buyerAddress').value = inv.buyerAddress || '';
    $('sameAsBuyer').checked = inv.sameAsBuyer !== false;
    $('consigneeFields').classList.toggle('hidden', inv.sameAsBuyer !== false);
    $('consigneeName').value = inv.consigneeName || '';
    $('consigneeAddress').value = inv.consigneeAddress || '';
    $('contactPerson').value = inv.contactPerson || '';
    $('contactPhone').value = inv.contactPhone || '';
    $('poNumber').value = inv.poNumber || '';
    $('poDate').value = inv.poDate || '';
    $('bankName').value = inv.bankName || '';
    $('bankBranch').value = inv.bankBranch || '';
    $('accountNumber').value = inv.accountNumber || '';
    $('ifscCode').value = inv.ifscCode || '';
    $('transportMode').value = inv.transportMode || '';
    $('gstRate').value = inv.gstRate || 0;
    $('gstType').value = inv.gstType || 'intra';
    $('invoiceReminder').value = inv.reminderDate || '';

    items = (inv.items && inv.items.length)
      ? inv.items.map(it => {
          const row = { ...it };
          if (row.qty != null && row.qty !== '') {
            const n = Math.round(Number(row.qty));
            row.qty = Number.isFinite(n) ? n : null;
          }
          const pk = Math.round(Number(row.packages));
          row.packages = Number.isFinite(pk) && pk >= 0 ? pk : 0;
          if (row.rate != null && row.rate !== '') {
            const r = Math.round(Number(row.rate) * 100) / 100;
            row.rate = Number.isFinite(r) && r >= 0 ? r : null;
          }
          return row;
        })
      : [{ description: '', hsn: '', packages: 0, qty: null, rate: null }];
    renderItems();

    if (inv.copyTypes && inv.copyTypes.length) {
      document.querySelectorAll('.copyType').forEach(cb => {
        cb.checked = inv.copyTypes.includes(cb.value);
      });
    }
    refreshInvoiceNumberDuplicateHint();
  }

  function getNextInvoiceNumber() {
    if (!invoices.length) return '';
    let maxNum = 0;
    let prefix = '';
    invoices.forEach(inv => {
      const m = (inv.invoiceNumber || '').match(/^(.*?)(\d+)$/);
      if (m) {
        const n = parseInt(m[2], 10);
        if (n > maxNum) { maxNum = n; prefix = m[1]; }
      }
    });
    if (!maxNum) return '';
    return prefix + (maxNum + 1);
  }

  function resetInvoiceForm() {
    editingInvoiceId = null;
    cameFromInvoiceList = false;
    cameFromPayment = false;
    $('invoiceNumber').value = getNextInvoiceNumber();
    const invNoErr = $('invoiceNumberError');
    if (invNoErr) {
      invNoErr.textContent = '';
      invNoErr.classList.add('hidden');
    }
    $('invoiceNumber').removeAttribute('aria-invalid');
    $('invoiceDate').value = formatDateYMDLocal(new Date());
    $('buyerName').value = '';
    $('buyerGstin').value = '';
    $('buyerAddress').value = '';
    $('sameAsBuyer').checked = true;
    $('consigneeFields').classList.add('hidden');
    $('consigneeName').value = '';
    $('consigneeAddress').value = '';
    $('contactPerson').value = '';
    $('contactPhone').value = '';
    $('poNumber').value = '';
    $('poDate').value = '';
    $('bankName').value = 'Bank of Baroda';
    $('bankBranch').value = 'Noothancheri Branch';
    $('accountNumber').value = '69550200000025';
    $('ifscCode').value = 'BARBOVJNOOT';
    $('transportMode').value = 'By Road';
    $('gstRate').value = 9;
    $('gstType').value = 'intra';
    const rem30 = new Date();
    rem30.setDate(rem30.getDate() + 30);
    $('invoiceReminder').value = formatDateYMDLocal(rem30);
    items = [{ description: '', hsn: '', packages: 0, qty: null, rate: null }];
    renderItems();
    document.querySelectorAll('.copyType').forEach(cb => {
      cb.checked = cb.value === 'ORIGINAL FOR BUYER';
    });
    $('formPanel').classList.remove('hidden');
    $('previewPanel').classList.add('hidden');
  }

  function computeGrandTotal(inv) {
    let subtotal = 0;
    (inv.items || []).forEach(it => {
      const q = Math.round(Number(it.qty) || 0);
      subtotal += q * (Number(it.rate) || 0);
    });
    const rate = inv.gstRate || 0;
    const tax = inv.gstType === 'intra' ? subtotal * rate / 100 * 2 : subtotal * rate / 100;
    return Math.round(subtotal + tax);
  }

  // ── Invoice List rendering + filtering ──
  function renderInvoiceList() {
    const tbody = $('invListBody');
    const query = ($('invSearch').value || '').trim().toLowerCase();
    const from = $('invDateFrom').value;
    const to = $('invDateTo').value;

    const filtered = invoices.filter(inv => {
      if (query) {
        const productInfo = (inv.items || []).map(it => `${it.description || ''} ${it.hsn || ''}`).join(' ');
        const haystack = [inv.invoiceNumber, inv.buyerName, productInfo].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (from && inv.invoiceDate < from) return false;
      if (to && inv.invoiceDate > to) return false;
      return true;
    });

    const sortAsc = ($('invSortOrder').value === 'asc');
    filtered.sort((a, b) => {
      const da = a.invoiceDate || a.createdAt || '';
      const db = b.invoiceDate || b.createdAt || '';
      const dateCmp = da.localeCompare(db);
      if (dateCmp !== 0) return sortAsc ? dateCmp : -dateCmp;
      const na = getInvSortNum(a.invoiceNumber);
      const nb = getInvSortNum(b.invoiceNumber);
      return sortAsc ? na - nb : nb - na;
    });

    tbody.innerHTML = '';
    $('invListEmpty').style.display = filtered.length ? 'none' : 'block';
    $('invListTable').style.display = filtered.length ? 'table' : 'none';

    filtered.forEach(inv => {
      const tr = document.createElement('tr');
      const total = computeGrandTotal(inv);
      tr.innerHTML = `
        <td><input type="checkbox" class="inv-check" data-inv-id="${inv.id}" /></td>
        <td>${escHtml(inv.invoiceNumber)}</td>
        <td>${inv.invoiceDate ? formatShortDate(inv.invoiceDate) : ''}</td>
        <td>${escHtml(inv.buyerName)}</td>
        <td class="r">₹${fmtNum(total)}</td>
        <td class="actions">
          <button class="btn-view" data-inv-id="${inv.id}">View</button>
          <button class="btn-edit" data-inv-id="${inv.id}">Edit</button>
          <button class="btn-print" data-inv-id="${inv.id}">Print</button>
          <button class="btn-download" data-inv-id="${inv.id}">PDF</button>
          <button class="btn-del" data-inv-id="${inv.id}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
    if ($('invSelectAll')) $('invSelectAll').checked = false;

    const sum = filtered.reduce((s, inv) => s + computeGrandTotal(inv), 0);
    const periodEl = $('invTotalSummaryPeriod');
    const valueEl = $('invTotalSummaryValue');
    const countEl = $('invTotalSummaryCount');
    if (periodEl) periodEl.textContent = getInvoiceListSummaryPeriodLabel();
    if (valueEl) valueEl.textContent = '₹' + fmtNum(sum);
    if (countEl) {
      countEl.textContent = filtered.length + ' invoice' + (filtered.length !== 1 ? 's' : '');
    }
  }

  function getInvoiceListSummaryPeriodLabel() {
    const presetLabels = {
      invPresetToday: 'Today',
      invPresetYesterday: 'Yesterday',
      invPresetThisWeek: 'This week',
      invPresetLastWeek: 'Last week',
      invPresetThisMonth: 'This month',
      invPresetLastMonth: 'Last month',
      invPresetThisYear: 'This year',
      invPresetLastYear: 'Last year',
      invPresetCustom: 'Custom date range'
    };
    if (activePreset && presetLabels[activePreset]) return presetLabels[activePreset];
    const from = $('invDateFrom').value;
    const to = $('invDateTo').value;
    if (from && to) return `${formatShortDate(from)} – ${formatShortDate(to)}`;
    if (from) return `From ${formatShortDate(from)}`;
    if (to) return `Until ${formatShortDate(to)}`;
    return 'All dates';
  }

  function clearPresetHighlightOnly() {
    document.querySelectorAll('#invoiceListView .preset-btn').forEach(b => b.classList.remove('active'));
    activePreset = null;
    const from = $('invDateFrom').value;
    const to = $('invDateTo').value;
    const hasAnyDate = !!(from || to);
    const hasFullRange = !!(from && to);
    if ($('invPresetClear')) $('invPresetClear').style.display = hasAnyDate ? 'inline-flex' : 'none';
    if ($('downloadFilteredBtn')) $('downloadFilteredBtn').style.display = hasFullRange ? 'inline-flex' : 'none';
  }

  function onInvListDateRangeChange() {
    clearPresetHighlightOnly();
    renderInvoiceList();
  }

  $('invSearch').addEventListener('input', renderInvoiceList);
  $('invDateFrom').addEventListener('change', onInvListDateRangeChange);
  $('invDateTo').addEventListener('change', onInvListDateRangeChange);
  $('invSortOrder').addEventListener('change', renderInvoiceList);

  $('invListBody').addEventListener('click', e => {
    const id = e.target.dataset.invId;
    if (!id) return;

    if (e.target.classList.contains('btn-view')) {
      const inv = invoices.find(x => x.id === id);
      if (!inv) return;
      cameFromInvoiceList = true;
      loadInvoiceIntoForm(inv);
      syncCopyChecks('copyType', 'copyTypePreview');
      buildAllInvoices();
      showView('invoiceView');
      $('formPanel').classList.add('hidden');
      $('previewPanel').classList.remove('hidden');
    }

    if (e.target.classList.contains('btn-edit')) {
      const inv = invoices.find(x => x.id === id);
      if (!inv) return;
      cameFromInvoiceList = true;
      loadInvoiceIntoForm(inv);
      showView('invoiceView');
      $('formPanel').classList.remove('hidden');
      $('previewPanel').classList.add('hidden');
    }

    if (e.target.classList.contains('btn-print')) {
      const inv = invoices.find(x => x.id === id);
      if (!inv) return;
      cameFromInvoiceList = true;
      loadInvoiceIntoForm(inv);
      syncCopyChecks('copyType', 'copyTypePreview');
      buildAllInvoices();
      showView('invoiceView');
      $('formPanel').classList.add('hidden');
      $('previewPanel').classList.remove('hidden');
      setTimeout(() => window.print(), 300);
    }

    if (e.target.classList.contains('btn-download')) {
      const inv = invoices.find(x => x.id === id);
      if (inv) downloadInvoicePDF(inv);
    }

    if (e.target.classList.contains('btn-del')) {
      if (confirm('Delete this invoice?')) {
        invoices = invoices.filter(x => x.id !== id);
        saveInvoices();
        renderInvoiceList();
      }
    }
  });

  // ── Select All checkbox ──
  $('invSelectAll').addEventListener('change', e => {
    document.querySelectorAll('.inv-check').forEach(cb => { cb.checked = e.target.checked; });
  });

  // ── Date preset helpers ──
  /** Sunday–Saturday week (matches typical calendar; Mon-start ISO week confused users on Sundays). */
  function getWeekRange(offset) {
    const now = new Date();
    const day = now.getDay(); // 0 = Sun … 6 = Sat
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - day + offset * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return { from: formatDateYMDLocal(weekStart), to: formatDateYMDLocal(weekEnd) };
  }

  function getMonthRange(offset) {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return { from: formatDateYMDLocal(first), to: formatDateYMDLocal(last) };
  }

  function getDayRange(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const s = formatDateYMDLocal(d);
    return { from: s, to: s };
  }

  function getYearRange(offset) {
    const y = new Date().getFullYear() + offset;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }

  let activePreset = null;
  let poCustomRangeOpen = false;

  function clearPresetActive() {
    document.querySelectorAll('#invoiceListView .preset-btn').forEach(b => b.classList.remove('active'));
    activePreset = null;
    $('invPresetClear').style.display = 'none';
    $('downloadFilteredBtn').style.display = 'none';
  }

  function applyPresetFilter(range, btnId) {
    if (activePreset === btnId) {
      clearPresetActive();
      $('invDateFrom').value = '';
      $('invDateTo').value = '';
      renderInvoiceList();
      return;
    }
    clearPresetActive();
    activePreset = btnId;
    $(btnId).classList.add('active');
    $('invDateFrom').value = range.from;
    $('invDateTo').value = range.to;
    renderInvoiceList();
    $('invPresetClear').style.display = 'inline-flex';
    $('downloadFilteredBtn').style.display = 'inline-flex';
  }

  $('invPresetToday').addEventListener('click', () => applyPresetFilter(getDayRange(0), 'invPresetToday'));
  $('invPresetYesterday').addEventListener('click', () => applyPresetFilter(getDayRange(-1), 'invPresetYesterday'));
  $('invPresetThisWeek').addEventListener('click', () => applyPresetFilter(getWeekRange(0), 'invPresetThisWeek'));
  $('invPresetLastWeek').addEventListener('click', () => applyPresetFilter(getWeekRange(-1), 'invPresetLastWeek'));
  $('invPresetThisMonth').addEventListener('click', () => applyPresetFilter(getMonthRange(0), 'invPresetThisMonth'));
  $('invPresetLastMonth').addEventListener('click', () => applyPresetFilter(getMonthRange(-1), 'invPresetLastMonth'));
  $('invPresetThisYear').addEventListener('click', () => applyPresetFilter(getYearRange(0), 'invPresetThisYear'));
  $('invPresetLastYear').addEventListener('click', () => applyPresetFilter(getYearRange(-1), 'invPresetLastYear'));

  $('invPresetClear').addEventListener('click', () => {
    clearPresetActive();
    $('invDateFrom').value = '';
    $('invDateTo').value = '';
    renderInvoiceList();
  });

  function getInvSortNum(invNumber) {
    const m = (invNumber || '').match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function applySortOrder(list) {
    const sortAsc = ($('invSortOrder').value === 'asc');
    return list.sort((a, b) => {
      const da = a.invoiceDate || a.createdAt || '';
      const db = b.invoiceDate || b.createdAt || '';
      const dateCmp = da.localeCompare(db);
      if (dateCmp !== 0) return sortAsc ? dateCmp : -dateCmp;
      const na = getInvSortNum(a.invoiceNumber);
      const nb = getInvSortNum(b.invoiceNumber);
      return sortAsc ? na - nb : nb - na;
    });
  }

  function getFilteredInvoices() {
    const from = $('invDateFrom').value;
    const to = $('invDateTo').value;
    const result = (!from || !to)
      ? invoices.slice()
      : invoices.filter(inv => inv.invoiceDate && inv.invoiceDate >= from && inv.invoiceDate <= to);
    return applySortOrder(result);
  }

  $('downloadFilteredBtn').addEventListener('click', () => {
    const filtered = getFilteredInvoices();
    if (!filtered.length) { alert('No invoices in the current filter'); return; }
    const from = $('invDateFrom').value;
    const to = $('invDateTo').value;
    downloadBulkPDF(filtered, `invoices-${from}-to-${to}.pdf`);
  });

  $('invPresetCustom').addEventListener('click', () => {
    $('customFrom').value = $('invDateFrom').value || '';
    $('customTo').value = $('invDateTo').value || '';
    $('customRangeCount').textContent = '';
    updateCustomCount();
    $('customRangeOverlay').classList.remove('hidden');
    $('customFrom').focus();
  });

  function getCustomFilteredInvoices() {
    const from = $('customFrom').value;
    const to = $('customTo').value;
    if (!from || !to) return [];
    return invoices.filter(inv => inv.invoiceDate && inv.invoiceDate >= from && inv.invoiceDate <= to);
  }

  function updateCustomCount() {
    if (poCustomRangeOpen) {
      const from = $('customFrom').value;
      const to = $('customTo').value;
      const list = (from && to) ? poInvoices.filter(inv => inv.invoiceDate && inv.invoiceDate >= from && inv.invoiceDate <= to) : [];
      $('customRangeCount').textContent = list.length ? `${list.length} PO invoice${list.length > 1 ? 's' : ''} found` : '';
    } else {
      const list = getCustomFilteredInvoices();
      $('customRangeCount').textContent = list.length ? `${list.length} invoice${list.length > 1 ? 's' : ''} found` : '';
    }
  }

  $('customFrom').addEventListener('change', updateCustomCount);
  $('customTo').addEventListener('change', updateCustomCount);

  $('customCancelBtn').addEventListener('click', () => {
    $('customRangeOverlay').classList.add('hidden');
  });

  $('customApplyBtn').addEventListener('click', () => {
    const from = $('customFrom').value;
    const to = $('customTo').value;
    if (!from || !to) { alert('Please select both From and To dates'); return; }
    $('customRangeOverlay').classList.add('hidden');
    if (typeof poCustomRangeOpen !== 'undefined' && poCustomRangeOpen) {
      poCustomRangeOpen = false;
      clearPoPresetActive();
      poActivePreset = 'poPresetCustom';
      $('poPresetCustom').classList.add('active');
      $('poInvDateFrom').value = from;
      $('poInvDateTo').value = to;
      renderPoInvoiceList();
      $('poPresetClear').style.display = 'inline-flex';
      $('poDownloadFilteredBtn').style.display = 'inline-flex';
    } else {
      clearPresetActive();
      activePreset = 'invPresetCustom';
      $('invPresetCustom').classList.add('active');
      $('invDateFrom').value = from;
      $('invDateTo').value = to;
      renderInvoiceList();
      $('invPresetClear').style.display = 'inline-flex';
      $('downloadFilteredBtn').style.display = 'inline-flex';
    }
  });

  $('customDownloadBtn').addEventListener('click', () => {
    if (typeof poCustomRangeOpen !== 'undefined' && poCustomRangeOpen) {
      const from = $('customFrom').value;
      const to = $('customTo').value;
      if (!from || !to) return;
      const selected = poInvoices.filter(inv => inv.invoiceDate && inv.invoiceDate >= from && inv.invoiceDate <= to);
      if (!selected.length) { alert('No PO invoices found in this date range'); return; }
      $('customRangeOverlay').classList.add('hidden');
      poCustomRangeOpen = false;
      downloadBulkPoPDF(selected, `po-invoices-${from}-to-${to}.pdf`);
    } else {
      const selected = getCustomFilteredInvoices();
      if (!selected.length) { alert('No invoices found in this date range'); return; }
      $('customRangeOverlay').classList.add('hidden');
      downloadBulkPDF(selected, `invoices-${$('customFrom').value}-to-${$('customTo').value}.pdf`);
    }
  });

  // ── Bulk PDF download ──
  $('bulkDownloadBtn').addEventListener('click', () => {
    const checked = document.querySelectorAll('.inv-check:checked');
    if (!checked.length) { alert('Select at least one invoice'); return; }
    const ids = Array.from(checked).map(cb => cb.dataset.invId);
    const selected = applySortOrder(invoices.filter(inv => ids.includes(inv.id)));
    if (!selected.length) return;
    const filename = selected.length === 1 ? `${selected[0].invoiceNumber || 'invoice'}.pdf` : `invoices-${formatDateYMDLocal(new Date())}.pdf`;
    downloadBulkPDF(selected, filename);
  });

  // ── Revenue Graph (Dialog) ──
  let revenueChart = null;
  let graphMode = 'monthly';
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function populateChartYear() {
    const sel = $('chartYear');
    const years = [...new Set(invoices.map(inv => {
      const d = inv.invoiceDate || inv.createdAt;
      return d ? new Date(d).getFullYear() : null;
    }).filter(Boolean))].sort((a, b) => b - a);
    if (!years.length) years.push(new Date().getFullYear());
    const cur = sel.value;
    sel.innerHTML = '';
    years.forEach(y => {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      if (String(y) === cur) o.selected = true;
      sel.appendChild(o);
    });
    if (!cur) sel.value = years[0];
  }

  function populateChartMonth() {
    const sel = $('chartMonth');
    const cur = sel.value;
    sel.innerHTML = '';
    MONTHS_SHORT.forEach((m, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = m;
      sel.appendChild(o);
    });
    sel.value = cur || new Date().getMonth();
  }

  function renderGraph() {
    const ctx = $('revenueChart').getContext('2d');
    if (revenueChart) revenueChart.destroy();

    const isPo = typeof poGraphMode !== 'undefined' && poGraphMode;
    const srcList = isPo ? poInvoices : invoices;
    const calcTotal = isPo ? computePoGrandTotal : computeGrandTotal;
    const chartLabel = isPo ? 'PO Invoice Total (₹)' : 'Revenue (₹)';

    let labels = [], data = [];

    if (graphMode === 'monthly') {
      const year = parseInt($('chartYear').value);
      labels = [...MONTHS_SHORT];
      data = new Array(12).fill(0);
      srcList.forEach(inv => {
        const ds = inv.invoiceDate || inv.createdAt;
        if (!ds) return;
        const d = new Date(ds);
        if (d.getFullYear() === year) data[d.getMonth()] += calcTotal(inv);
      });

    } else if (graphMode === 'weekly') {
      const year = parseInt($('chartYear').value);
      const month = parseInt($('chartMonth').value);
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      let weekStart = new Date(firstDay);
      let weekNum = 1;
      while (weekStart <= lastDay) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const wEnd = weekEnd > lastDay ? lastDay : weekEnd;
        const wsStr = formatDateYMDLocal(weekStart);
        const weStr = formatDateYMDLocal(wEnd);
        labels.push('W' + weekNum);
        let total = 0;
        srcList.forEach(inv => {
          const ds = inv.invoiceDate;
          if (ds && ds >= wsStr && ds <= weStr) total += calcTotal(inv);
        });
        data.push(total);
        weekStart.setDate(weekStart.getDate() + 7);
        weekNum++;
      }

    } else if (graphMode === 'yearly') {
      const yearSet = [...new Set(srcList.map(inv => {
        const d = inv.invoiceDate || inv.createdAt;
        return d ? new Date(d).getFullYear() : null;
      }).filter(Boolean))].sort();
      if (!yearSet.length) yearSet.push(new Date().getFullYear());
      labels = yearSet.map(String);
      data = yearSet.map(y => {
        let total = 0;
        srcList.forEach(inv => {
          const ds = inv.invoiceDate || inv.createdAt;
          if (ds && new Date(ds).getFullYear() === y) total += calcTotal(inv);
        });
        return total;
      });

    } else if (graphMode === 'custom') {
      const from = $('graphCustomFrom').value;
      const to = $('graphCustomTo').value;
      if (!from || !to) {
        revenueChart = new Chart(ctx, { type: 'line', data: { labels: [], datasets: [] }, options: { responsive: true } });
        return;
      }
      const filtered = srcList.filter(inv => inv.invoiceDate && inv.invoiceDate >= from && inv.invoiceDate <= to);
      const dayMap = {};
      filtered.forEach(inv => {
        dayMap[inv.invoiceDate] = (dayMap[inv.invoiceDate] || 0) + calcTotal(inv);
      });
      const days = Object.keys(dayMap).sort();
      labels = days.map(d => formatShortDate(d));
      data = days.map(d => dayMap[d]);
    }

    revenueChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: chartLabel,
          data,
          borderColor: '#1a3a5c',
          backgroundColor: 'rgba(26, 58, 92, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: '#1a3a5c',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => '₹' + c.raw.toLocaleString('en-IN', { minimumFractionDigits: 2 })
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => '₹' + (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v)
            }
          }
        }
      }
    });
  }

  function updateGraphFilters() {
    $('chartYear').classList.toggle('hidden', graphMode === 'custom');
    $('chartMonth').classList.toggle('hidden', graphMode !== 'weekly');
    $('graphCustomRow').classList.toggle('hidden', graphMode !== 'custom');
    $('graphFilters').classList.toggle('hidden', graphMode === 'custom');
  }

  $('openGraphBtn').addEventListener('click', () => {
    if (typeof poGraphMode !== 'undefined') poGraphMode = false;
    populateChartYear();
    populateChartMonth();
    updateGraphFilters();
    $('graphOverlay').classList.remove('hidden');
    renderGraph();
  });

  $('graphCloseBtn').addEventListener('click', () => {
    $('graphOverlay').classList.add('hidden');
    if (typeof poGraphMode !== 'undefined') poGraphMode = false;
  });

  document.querySelectorAll('.graph-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.graph-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      graphMode = tab.dataset.mode;
      updateGraphFilters();
      renderGraph();
    });
  });

  $('chartYear').addEventListener('change', renderGraph);
  $('chartMonth').addEventListener('change', renderGraph);
  $('graphCustomFrom').addEventListener('change', renderGraph);
  $('graphCustomTo').addEventListener('change', renderGraph);

  $('graphDownloadBtn').addEventListener('click', () => {
    const canvas = $('revenueChart');
    const link = document.createElement('a');
    link.download = `revenue-${graphMode}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // ══════════════════════════════════════
  // ── Payment Tracking (Company-Level) ──
  // ══════════════════════════════════════
  let payments = {};

  function savePayments() { db.savePayments(payments); }

  function genCreditId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  }

  function migratePaymentCreditIds() {
    let changed = false;
    Object.keys(payments).forEach(name => {
      const rec = payments[name];
      if (!rec || !Array.isArray(rec.credits)) return;
      rec.credits.forEach(c => {
        if (!c.id) {
          c.id = genCreditId();
          changed = true;
        }
      });
      const sum = rec.credits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      if (Math.abs((rec.totalCredited || 0) - sum) > 0.001) {
        rec.totalCredited = sum;
        changed = true;
      }
    });
    if (changed) savePayments();
  }

  function getCompanyPayment(name) {
    if (!payments[name]) payments[name] = { credits: [], totalCredited: 0, reminder: null };
    return payments[name];
  }

  function addCompanyCredit(name, amount, note, dateIso, tdsAmounts) {
    const rec = getCompanyPayment(name);
    const entry = {
      id: genCreditId(),
      amount: Number(amount),
      date: dateIso || new Date().toISOString(),
      note: note || ''
    };
    if (tdsAmounts && tdsAmounts.length) entry.tdsAmounts = tdsAmounts;
    rec.credits.push(entry);
    rec.totalCredited = rec.credits.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    savePayments();
  }

  function updateCompanyCredit(name, creditId, amount, note, dateIso, tdsAmounts) {
    const rec = getCompanyPayment(name);
    const c = rec.credits.find(x => x.id === creditId);
    if (!c) return false;
    c.amount = Number(amount);
    c.note = note || '';
    c.date = dateIso;
    if (tdsAmounts && tdsAmounts.length) c.tdsAmounts = tdsAmounts;
    else delete c.tdsAmounts;
    rec.totalCredited = rec.credits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    savePayments();
    return true;
  }

  function deleteCompanyCredit(name, creditId) {
    const rec = payments[name];
    if (!rec || !Array.isArray(rec.credits)) return false;
    const next = rec.credits.filter(x => x.id !== creditId);
    if (next.length === rec.credits.length) return false;
    rec.credits = next;
    rec.totalCredited = rec.credits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    savePayments();
    return true;
  }

  function isoToDatetimeLocal(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function datetimeLocalToIso(localStr) {
    if (!localStr) return new Date().toISOString();
    const d = new Date(localStr);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  function setCompanyReminder(name, date, note) {
    const rec = getCompanyPayment(name);
    rec.reminder = { date, note: note || '' };
    savePayments();
  }

  function getCompanyInvoiceTotal(name) {
    return invoices.filter(inv => inv.buyerName === name).reduce((s, inv) => s + computeGrandTotal(inv), 0);
  }

  /** Oldest invoice date first; ties broken by invoice no. then id */
  function sortInvoicesFifo(invs) {
    return [...invs].sort((a, b) => {
      const da = (a.invoiceDate || a.createdAt || '').toString();
      const db = (b.invoiceDate || b.createdAt || '').toString();
      const cmp = da.localeCompare(db);
      if (cmp !== 0) return cmp;
      const na = (a.invoiceNumber || '').toString();
      const nb = (b.invoiceNumber || '').toString();
      const c2 = na.localeCompare(nb);
      if (c2 !== 0) return c2;
      return (a.id || '').toString().localeCompare((b.id || '').toString());
    });
  }

  /** Apply total credited amount to invoices in FIFO order; returns per-invoice applied & balance */
  function fifoAllocationsForCompany(name) {
    const invs = sortInvoicesFifo(invoices.filter(inv => inv.buyerName === name));
    const rec = payments[name];
    let pool = rec ? Number(rec.totalCredited) : 0;
    if (Number.isNaN(pool) || pool < 0) pool = 0;
    return invs.map(inv => {
      const gross = computeGrandTotal(inv);
      const applied = Math.min(pool, gross);
      pool = Math.max(0, pool - applied);
      return {
        inv,
        gross,
        applied: Math.round(applied * 100) / 100,
        balance: Math.round((gross - applied) * 100) / 100
      };
    });
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) {
      const day = String(isoStr).split('T')[0];
      return formatShortDate(day) || '—';
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let h = d.getHours();
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${dd}/${mm}/${yyyy} ${h}:${mi} ${ampm}`;
  }

  /** Whole days from invoice date until today (aging). Uses invoiceDate, else createdAt. Future dates → 0. */
  function daysSince(dateStr) {
    if (!dateStr) return 0;
    const n = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    return Math.max(0, n);
  }

  function getPaymentSummarySnapshot(companyName) {
    migratePaymentCreditIds();
    const invs = invoices.filter(inv => inv.buyerName === companyName);
    const totalAmt = getCompanyInvoiceTotal(companyName);
    const rec = payments[companyName];
    const credited = rec ? rec.totalCredited : 0;
    const totalTds = rec && rec.credits ? rec.credits.reduce((s, c) => s + (Array.isArray(c.tdsAmounts) ? c.tdsAmounts.reduce((a, v) => a + v, 0) : 0), 0) : 0;
    const outstanding = Math.max(totalAmt - credited, 0);
    const creditEntries = rec && rec.credits ? [...rec.credits].sort((a, b) => new Date(a.date) - new Date(b.date)) : [];
    const fifoRows = fifoAllocationsForCompany(companyName);
    const openFifo = fifoRows.filter(r => r.balance > 0.005);
    return {
      companyName,
      invCount: invs.length,
      totalAmt,
      credited,
      totalTds,
      outstanding,
      payCount: creditEntries.length,
      pendCount: openFifo.length,
      creditEntries,
      fifoRows,
      openFifo,
      generatedAt: formatDateTime(new Date().toISOString())
    };
  }

  let expandedCompany = null;

  // ── Render Payment View ──
  function renderPaymentView() {
    const query = ($('paySearch').value || '').trim().toLowerCase();
    const companyNames = [...new Set(invoices.map(inv => inv.buyerName).filter(Boolean))].sort();

    const companies = companyNames.map(name => {
      const invs = invoices.filter(inv => inv.buyerName === name);
      const totalAmt = invs.reduce((s, inv) => s + computeGrandTotal(inv), 0);
      const rec = payments[name];
      const credited = rec ? rec.totalCredited : 0;
      const totalTds = rec && rec.credits ? rec.credits.reduce((s, c) => s + (Array.isArray(c.tdsAmounts) ? c.tdsAmounts.reduce((a, v) => a + v, 0) : 0), 0) : 0;
      const outstanding = Math.max(totalAmt - credited, 0);
      const reminder = rec ? rec.reminder : null;
      const oldestDate = invs.reduce((oldest, inv) => {
        const d = inv.invoiceDate || inv.createdAt || '';
        return (!oldest || d < oldest) ? d : oldest;
      }, '');
      return { name, invs, totalAmt, credited, totalTds, outstanding, reminder, oldestDate, count: invs.length };
    }).filter(c => !query || c.name.toLowerCase().includes(query));

    companies.sort((a, b) => (b.outstanding > 0 ? 1 : 0) - (a.outstanding > 0 ? 1 : 0) || a.name.localeCompare(b.name));

    const totalOutstanding = companies.reduce((s, c) => s + c.outstanding, 0);
    $('totalOutstanding').textContent = '₹' + fmtNum(totalOutstanding);

    const container = $('payCompanyList');
    container.innerHTML = '';
    $('payEmpty').classList.toggle('hidden', companies.length > 0);

    const todayStr = formatDateYMDLocal(new Date());

    companies.forEach(co => {
      const isPaid = co.outstanding <= 0;
      const isOverdue = co.reminder && co.reminder.date <= todayStr && !isPaid;
      const isExpanded = expandedCompany === co.name;

      const section = document.createElement('div');
      section.className = 'pay-company-section' + (isPaid ? ' paid' : '') + (isOverdue ? ' overdue' : '');

      let reminderBadge = '';
      if (co.reminder && !isPaid) {
        const cls = isOverdue ? 'reminder-badge overdue' : 'reminder-badge';
        reminderBadge = `<span class="${cls}" title="Reminder: ${formatShortDate(co.reminder.date)}${co.reminder.note ? ' - ' + escHtml(co.reminder.note) : ''}"></span>`;
      }

      const rec = payments[co.name];
      const lastCredit = rec && rec.credits && rec.credits.length ? rec.credits[rec.credits.length - 1] : null;
      const lastCreditDate = lastCredit ? formatDateTime(lastCredit.date) : '';
      const fifoRows = fifoAllocationsForCompany(co.name);
      const openFifo = fifoRows.filter(r => r.balance > 0.005);
      const creditEntries = rec && rec.credits && rec.credits.length
        ? [...rec.credits].sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
      let runningCred = 0;
      const creditLogRows = creditEntries.map((c, i) => {
        runningCred += Number(c.amount) || 0;
        const outstandingAfter = Math.max(0, co.totalAmt - runningCred);
        const cid = escHtml(c.id || '');
        const cTds = Array.isArray(c.tdsAmounts) ? c.tdsAmounts.reduce((s, v) => s + v, 0) : 0;
        const baseAmt = c.amount - cTds;
        return `<tr>
          <td class="c pay-col-idx">${i + 1}</td>
          <td class="pay-col-when">${formatDateTime(c.date)}</td>
          <td class="r">₹${fmtNum(baseAmt)}</td>
          <td class="r">${cTds > 0 ? '₹' + fmtNum(cTds) : '—'}</td>
          <td class="r">₹${fmtNum(c.amount)}</td>
          <td class="pay-col-note">${escHtml(c.note || '—')}</td>
          <td class="r pay-col-outstanding">₹${fmtNum(outstandingAfter)}</td>
          <td class="pay-credit-actions"><button type="button" class="btn-edit-credit btn btn-sm btn-secondary" data-company="${escHtml(co.name)}" data-credit-id="${cid}">Edit</button></td>
        </tr>`;
      }).join('');
      const creditLogBlock = creditEntries.length
        ? `<div class="pay-credit-log">
            <h4 class="pay-subhead">Credits recorded</h4>
            <p class="pay-fifo-hint">Each payment shows date &amp; time. <strong>Outstanding</strong> is billed total minus credits recorded up to that row (chronological). Use Edit to correct an amount. Use <strong>Summary PDF</strong> in the row above for a full printable report.</p>
            <div class="pay-table-scroll">
              <table class="data-table pay-table-tight">
                <thead><tr><th class="c">#</th><th>Date &amp; time</th><th class="r">Credit</th><th class="r">TDS</th><th class="r">Total</th><th>Note</th><th class="r">Outstanding</th><th></th></tr></thead>
                <tbody>${creditLogRows}</tbody>
              </table>
            </div>
          </div>`
        : `<p class="pay-fifo-hint">No credits yet. Open invoices show full amounts until you add credits (applied to oldest invoice dates first).</p>`;

      const invoiceRows = openFifo.map(r => {
        const days = daysSince(r.inv.invoiceDate || r.inv.createdAt);
        return `<tr data-days="${days}">
          <td>${escHtml(r.inv.invoiceNumber)}</td>
          <td class="pay-col-date">${r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '—'}</td>
          <td class="r">₹${fmtNum(r.gross)}</td>
          <td class="r pay-col-settled">₹${fmtNum(r.applied)}</td>
          <td class="r pay-col-balance">₹${fmtNum(r.balance)}</td>
          <td class="c${days >= 30 ? ' days-overdue' : ''}">${days}d</td>
          <td><button class="btn-view" data-inv-id="${r.inv.id}" style="font-size:.78rem">View</button></td>
        </tr>`;
      }).join('');
      const eName = escHtml(co.name);
      const coFilterBar = openFifo.length
        ? `<div class="co-days-filter" data-company="${eName}">
            <span class="co-days-label">Filter:</span>
            <button type="button" class="preset-pill co-days-btn" data-from="0" data-to="">All</button>
            <button type="button" class="preset-pill co-days-btn active" data-from="30" data-to="">30d+</button>
            <button type="button" class="preset-pill co-days-btn" data-from="45" data-to="">45d+</button>
            <button type="button" class="preset-pill co-days-btn" data-from="60" data-to="">60d+</button>
            <input type="number" class="days-input co-days-from" min="0" value="30" placeholder="0" title="From days" />
            <span class="co-days-sep">to</span>
            <input type="number" class="days-input co-days-to" min="0" value="" placeholder="∞" title="To days" />
            <span class="co-days-hint">days</span>
            <label class="days-filter-toggle co-days-inv-toggle"><input type="checkbox" class="co-days-include-inv" /><span>+Invoices</span></label>
            <button type="button" class="btn btn-sm btn-primary co-days-view" data-company="${eName}">View</button>
            <button type="button" class="btn btn-sm btn-secondary co-days-pdf" data-company="${eName}">PDF</button>
            <button type="button" class="btn btn-sm btn-whatsapp co-days-wa" data-company="${eName}">WhatsApp</button>
          </div>`
        : '';
      const invoiceTable = openFifo.length
        ? `<div class="pay-table-scroll">
            <table class="data-table pay-table-tight" style="margin:0">
              <thead><tr>
                <th>Invoice No.</th>
                <th class="pay-col-date">Invoice date</th>
                <th class="r">Invoice total</th>
                <th class="r">Settled by credits</th>
                <th class="r">Balance due</th>
                <th class="c">Days</th>
                <th></th>
              </tr></thead>
              <tbody>${invoiceRows}</tbody>
            </table>
          </div>`
        : `<p class="pay-all-settled">No open balances — credits (oldest invoices first) cover every invoice for this company.</p>`;

      section.innerHTML = `
        <div class="pay-company-header" data-company="${escHtml(co.name)}">
          <div class="pay-company-top">
            <span class="pay-company-toggle">${isExpanded ? '▾' : '▸'}</span>
            <span class="pay-company-name">${escHtml(co.name)}</span> ${reminderBadge}
            <span class="pay-company-meta">${openFifo.length} with balance · ${co.count} invoice${co.count !== 1 ? 's' : ''} billed</span>
            ${lastCreditDate ? `<span class="pay-company-date">Last credit: ${lastCreditDate}</span>` : ''}
          </div>
          <div class="pay-company-actions">
            ${!isPaid ? `<button class="btn-pay btn btn-sm btn-primary" data-company="${escHtml(co.name)}">+ Credit</button>` : ''}
            <button type="button" class="btn-pay-summary-pdf btn btn-sm btn-secondary" data-company="${escHtml(co.name)}" title="Download PDF: payments, outstanding, pending invoices">Summary PDF</button>
            <button class="btn-history btn btn-sm btn-secondary" data-company="${escHtml(co.name)}">Summary</button>
            ${!isPaid ? `<button class="btn-remind btn btn-sm btn-secondary" data-company="${escHtml(co.name)}">Remind</button>` : ''}
          </div>
          <div class="pay-company-nums">
            <span class="pay-num-group">Total <strong>₹${fmtNum(co.totalAmt)}</strong></span>
            <span class="pay-num-group">Credited <strong>₹${fmtNum(co.credited)}</strong></span>
            <span class="pay-num-group">TDS <strong>₹${fmtNum(co.totalTds)}</strong></span>
            <span class="pay-num-group pay-outstanding">${isPaid ? '<span style="color:#059669">Fully Paid</span>' : `Outstanding <strong>₹${fmtNum(co.outstanding)}</strong>`}</span>
          </div>
        </div>
        <div class="pay-company-invoices ${isExpanded ? '' : 'hidden'}">
          <p class="pay-fifo-hint pay-fifo-hint-strong">Credits are applied in order of invoice date (oldest first) until the recorded credits are used up.</p>
          ${creditLogBlock}
          <h4 class="pay-subhead pay-subhead-spaced">Invoices still due</h4>
          ${coFilterBar}
          ${invoiceTable}
        </div>`;
      container.appendChild(section);
    });

    attachCompanyDaysFilterListeners();
  }

  function attachCompanyDaysFilterListeners() {
    document.querySelectorAll('.co-days-filter').forEach(bar => {
      const company = bar.dataset.company;
      const section = bar.closest('.pay-company-section');
      if (!section) return;
      const tbody = section.querySelector('.pay-table-tight tbody');
      const fromInput = bar.querySelector('.co-days-from');
      const toInput = bar.querySelector('.co-days-to');

      function applyCoFilter() {
        if (!tbody) return;
        const f = parseInt(fromInput.value, 10);
        const t = parseInt(toInput.value, 10);
        const from = Number.isNaN(f) ? 0 : Math.max(0, f);
        const to = (toInput.value === '' || Number.isNaN(t)) ? Infinity : Math.max(0, t);
        tbody.querySelectorAll('tr[data-days]').forEach(tr => {
          const d = parseInt(tr.dataset.days, 10);
          tr.style.display = (d >= from && (to === Infinity || d <= to)) ? '' : 'none';
        });
      }

      bar.querySelectorAll('.co-days-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          bar.querySelectorAll('.co-days-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          fromInput.value = btn.dataset.from === '0' ? '' : btn.dataset.from;
          toInput.value = btn.dataset.to || '';
          applyCoFilter();
        });
      });

      fromInput.addEventListener('input', () => {
        bar.querySelectorAll('.co-days-btn').forEach(b => b.classList.remove('active'));
        applyCoFilter();
      });
      toInput.addEventListener('input', () => {
        bar.querySelectorAll('.co-days-btn').forEach(b => b.classList.remove('active'));
        applyCoFilter();
      });

      bar.querySelector('.co-days-view').addEventListener('click', () => {
        const f = parseInt(fromInput.value, 10);
        const t = parseInt(toInput.value, 10);
        const from = Number.isNaN(f) ? 0 : Math.max(0, f);
        const to = (toInput.value === '' || Number.isNaN(t)) ? Infinity : Math.max(0, t);
        showCompanyDaysFilterOverlay(company, from, to);
      });

      bar.querySelector('.co-days-pdf').addEventListener('click', () => {
        const f = parseInt(fromInput.value, 10);
        const t = parseInt(toInput.value, 10);
        const from = Number.isNaN(f) ? 0 : Math.max(0, f);
        const to = (toInput.value === '' || Number.isNaN(t)) ? Infinity : Math.max(0, t);
        const withInv = bar.querySelector('.co-days-include-inv').checked;
        downloadCompanyDaysFilterPdf(company, from, to, withInv);
      });

      bar.querySelector('.co-days-wa').addEventListener('click', () => {
        const f = parseInt(fromInput.value, 10);
        const t = parseInt(toInput.value, 10);
        const from = Number.isNaN(f) ? 0 : Math.max(0, f);
        const to = (toInput.value === '' || Number.isNaN(t)) ? Infinity : Math.max(0, t);
        const withInv = bar.querySelector('.co-days-include-inv').checked;
        openWhatsappDialog(
          company + ' \u2014 due invoices',
          function(asBlob) {
            return asBlob
              ? downloadCompanyDaysFilterPdfBlob(company, from, to, withInv)
              : downloadCompanyDaysFilterPdf(company, from, to, withInv);
          },
          company
        );
      });

      applyCoFilter();
    });
  }

  function getCompanyFilteredDueInvoices(companyName, fromDays, toDays) {
    const fifoRows = fifoAllocationsForCompany(companyName);
    const results = [];
    fifoRows.forEach(r => {
      if (r.balance <= 0.005) return;
      const days = daysSince(r.inv.invoiceDate || r.inv.createdAt);
      if (days >= fromDays && (toDays === Infinity || days <= toDays)) {
        results.push({ inv: r.inv, balance: r.balance, days, company: companyName });
      }
    });
    results.sort((a, b) => b.days - a.days);
    return results;
  }

  function showCompanyDaysFilterOverlay(companyName, fromDays, toDays) {
    daysFilterOverlayCtx = { company: companyName, from: fromDays, to: toDays };
    const rows = getCompanyFilteredDueInvoices(companyName, fromDays, toDays);
    const rangeText = (fromDays === 0 && toDays === Infinity) ? 'All'
      : toDays === Infinity ? fromDays + ' days and older'
      : fromDays + ' to ' + toDays + ' days';
    $('daysFilterTitle').textContent = companyName + ' \u2014 ' + rangeText;
    const totalBal = rows.reduce((s, r) => s + r.balance, 0);
    $('daysFilterSummary').textContent = rows.length + ' invoice' + (rows.length !== 1 ? 's' : '') + ' \u00b7 Total Balance Due: \u20b9' + fmtNum(totalBal);
    const content = $('daysFilterContent');
    content.textContent = '';
    if (rows.length === 0) {
      const p = document.createElement('p');
      p.style.cssText = 'text-align:center;padding:1.5rem;color:var(--text-muted)';
      p.textContent = 'No invoices in this range.';
      content.appendChild(p);
    } else {
      const tbl = document.createElement('table');
      tbl.className = 'data-table pay-table-tight';
      const thead = document.createElement('thead');
      const headTr = document.createElement('tr');
      ['Invoice No.', 'Invoice Date', 'Balance Due', 'Days'].forEach((t, i) => {
        const th = document.createElement('th');
        if (i === 1) th.className = 'pay-col-date';
        if (i === 2) th.className = 'r';
        if (i === 3) th.className = 'c';
        th.textContent = t;
        headTr.appendChild(th);
      });
      thead.appendChild(headTr);
      tbl.appendChild(thead);
      const tbody = document.createElement('tbody');
      rows.forEach(r => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td'); td1.textContent = r.inv.invoiceNumber; tr.appendChild(td1);
        const td2 = document.createElement('td'); td2.className = 'pay-col-date'; td2.textContent = r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '\u2014'; tr.appendChild(td2);
        const td3 = document.createElement('td'); td3.className = 'r'; td3.textContent = '\u20b9' + fmtNum(r.balance); tr.appendChild(td3);
        const td4 = document.createElement('td'); td4.className = 'c' + (r.days >= 30 ? ' days-overdue' : ''); td4.textContent = r.days + 'd'; tr.appendChild(td4);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      const wrap = document.createElement('div');
      wrap.className = 'pay-table-scroll';
      wrap.appendChild(tbl);
      content.appendChild(wrap);
    }
    $('daysFilterTotals').textContent = '';
    const strong1 = document.createElement('strong'); strong1.textContent = 'Total: \u20b9' + fmtNum(totalBal);
    const strong2 = document.createElement('strong'); strong2.textContent = rows.length.toString();
    $('daysFilterTotals').append(strong1, ' across ', strong2, ' invoice' + (rows.length !== 1 ? 's' : ''));
    $('daysFilterOverlay').classList.remove('hidden');
  }

  function buildCompanyDaysFilterPdfHtml(companyName, fromDays, toDays) {
    const rows = getCompanyFilteredDueInvoices(companyName, fromDays, toDays);
    const rangeText = (fromDays === 0 && toDays === Infinity) ? 'All'
      : toDays === Infinity ? fromDays + ' days and older'
      : fromDays + ' to ' + toDays + ' days';
    const totalBal = rows.reduce((s, r) => s + r.balance, 0);
    const now = formatDateTime(new Date().toISOString());
    const container = document.createElement('div');
    container.style.cssText = 'box-sizing:border-box;width:100%;padding:16px 12px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;';
    const hdr = document.createElement('div');
    hdr.style.cssText = 'border-bottom:2px solid #1e3a5f;padding-bottom:10px;margin-bottom:14px';
    const hTitle = document.createElement('div');
    hTitle.style.cssText = 'font-size:16px;font-weight:700;color:#1e3a5f';
    hTitle.textContent = COMPANY.name;
    const hAddr = document.createElement('div');
    hAddr.style.cssText = 'font-size:8px;color:#64748b;margin-top:2px';
    hAddr.textContent = COMPANY.address.replace(/\n/g, ', ');
    hdr.append(hTitle, hAddr);
    container.appendChild(hdr);
    const meta = document.createElement('div');
    meta.style.cssText = 'margin-bottom:12px';
    const mTitle = document.createElement('div');
    mTitle.style.cssText = 'font-size:13px;font-weight:700;margin-bottom:4px';
    mTitle.textContent = companyName + ' \u2014 Invoices Due (' + rangeText + ')';
    const mSub = document.createElement('div');
    mSub.style.cssText = 'font-size:9px;color:#64748b';
    mSub.textContent = 'Generated: ' + now + ' \u00b7 ' + rows.length + ' invoice' + (rows.length !== 1 ? 's' : '') + ' \u00b7 Total: \u20b9' + fmtNum(totalBal);
    meta.append(mTitle, mSub);
    container.appendChild(meta);
    const tdStyle = 'padding:5px 6px;vertical-align:top;border-bottom:1px solid #e2e8f0;';
    const thStyle = 'padding:5px 6px;font-weight:700;text-align:left;border-bottom:2px solid #94a3b8;background:#f1f5f9;';
    const tbl = document.createElement('table');
    tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:9px;line-height:1.3;border:1px solid #94a3b8;';
    const thead = document.createElement('thead');
    const headTr = document.createElement('tr');
    ['Invoice No.', 'Invoice Date', 'Balance Due', 'Days'].forEach((t, i) => {
      const th = document.createElement('th');
      th.style.cssText = thStyle + (i === 2 ? 'text-align:right;' : '') + (i === 3 ? 'text-align:center;' : '');
      th.textContent = t;
      headTr.appendChild(th);
    });
    thead.appendChild(headTr);
    tbl.appendChild(thead);
    const tbodyEl = document.createElement('tbody');
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4; td.style.cssText = 'padding:12px;text-align:center;color:#64748b'; td.textContent = 'No invoices in this range.';
      tr.appendChild(td); tbodyEl.appendChild(tr);
    } else {
      rows.forEach((r, i) => {
        const tr = document.createElement('tr');
        if (i % 2 === 1) tr.style.background = '#f8fafc';
        const c1 = document.createElement('td'); c1.style.cssText = tdStyle; c1.textContent = r.inv.invoiceNumber; tr.appendChild(c1);
        const c2 = document.createElement('td'); c2.style.cssText = tdStyle; c2.textContent = r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '\u2014'; tr.appendChild(c2);
        const c3 = document.createElement('td'); c3.style.cssText = tdStyle + 'text-align:right;font-variant-numeric:tabular-nums;'; c3.textContent = '\u20b9' + fmtNum(r.balance); tr.appendChild(c3);
        const c4 = document.createElement('td'); c4.style.cssText = tdStyle + 'text-align:center;'; c4.textContent = r.days + 'd'; tr.appendChild(c4);
        tbodyEl.appendChild(tr);
      });
    }
    tbl.appendChild(tbodyEl);
    const tfoot = document.createElement('tfoot');
    const footTr = document.createElement('tr');
    footTr.style.cssText = 'background:#f1f5f9;font-weight:700;border-top:2px solid #94a3b8';
    const ft1 = document.createElement('td'); ft1.colSpan = 2; ft1.style.cssText = tdStyle; ft1.textContent = 'Total (' + rows.length + ' invoice' + (rows.length !== 1 ? 's' : '') + ')'; footTr.appendChild(ft1);
    const ft2 = document.createElement('td'); ft2.style.cssText = tdStyle + 'text-align:right;font-variant-numeric:tabular-nums;font-weight:700;'; ft2.textContent = '\u20b9' + fmtNum(totalBal); footTr.appendChild(ft2);
    const ft3 = document.createElement('td'); ft3.style.cssText = tdStyle; footTr.appendChild(ft3);
    tfoot.appendChild(footTr);
    tbl.appendChild(tfoot);
    container.appendChild(tbl);
    return container;
  }

  async function downloadCompanyDaysFilterPdf(companyName, fromDays, toDays, withInvoices) {
    const rows = getCompanyFilteredDueInvoices(companyName, fromDays, toDays);
    if (withInvoices && rows.length === 0) { alert('No invoices to include in this range.'); return; }
    const state = saveViewState();
    const paper = $('invoicePaper');
    const safe = (companyName || 'company').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(0, 48);
    const rangeLabel = (fromDays === 0 && toDays === Infinity) ? 'all' : toDays === Infinity ? fromDays + 'd-plus' : fromDays + 'd-to-' + toDays + 'd';
    const fname = 'due-' + safe + '-' + rangeLabel + '.pdf';
    const summaryOpt = { ...PDF_OPT, margin: [0.35, 0.42, 0.35, 0.42], html2canvas: { ...PDF_OPT.html2canvas, scale: 1.65, scrollX: 0, scrollY: 0 } };
    if (!withInvoices) {
      paper.textContent = '';
      paper.appendChild(buildCompanyDaysFilterPdfHtml(companyName, fromDays, toDays));
      paper.classList.add('payment-summary-pdf');
      const shield = showPaperForCapture();
      window.scrollTo(0, 0);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 80));
      try { await html2pdf().set({ ...summaryOpt, filename: fname }).from(paper).save(); }
      finally { shield.remove(); restoreViewState(state); paper.classList.remove('payment-summary-pdf'); const tmp = document.getElementById('html2pdf__container'); if (tmp) tmp.remove(); }
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'pdfBulkOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:100000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;';
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#fff;font-size:1.1rem;font-weight:600;font-family:Inter,system-ui,sans-serif;';
    msg.textContent = 'Generating summary page...';
    const bar = document.createElement('div');
    bar.style.cssText = 'width:220px;height:6px;background:rgba(255,255,255,.25);border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:0%;background:#fff;border-radius:3px;transition:width .3s;';
    bar.appendChild(fill); overlay.append(msg, bar); document.body.appendChild(overlay);
    paper.textContent = '';
    paper.appendChild(buildCompanyDaysFilterPdfHtml(companyName, fromDays, toDays));
    paper.classList.add('payment-summary-pdf');
    const shield = showPaperForCapture();
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 80));
    let pdf = await html2pdf().set({ ...summaryOpt, filename: fname }).from(paper).toPdf().get('pdf');
    shield.remove(); paper.classList.remove('payment-summary-pdf');
    let tmpC = document.getElementById('html2pdf__container'); if (tmpC) tmpC.remove();
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('homePanel').classList.add('hidden');
    $('invoiceView').classList.remove('hidden');
    $('formPanel').classList.add('hidden');
    $('previewPanel').classList.remove('hidden');
    paper.style.overflow = 'visible';
    for (let i = 0; i < rows.length; i++) {
      msg.textContent = 'Generating invoice ' + (i + 1) + ' of ' + rows.length + '...';
      fill.style.width = Math.round(((i + 1) / rows.length) * 100) + '%';
      const matchedInv = invoices.find(x => x.id === rows[i].inv.id);
      if (!matchedInv) continue;
      prepareInvoiceForCapture(matchedInv);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2pdf().set(PDF_OPT).from(paper).toContainer().toCanvas().get('canvas');
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 0.3; const usableW = pageW - margin * 2;
      const imgH = (canvas.height * usableW) / canvas.width;
      pdf.addPage(); pdf.addImage(imgData, 'JPEG', margin, margin, usableW, imgH);
      tmpC = document.getElementById('html2pdf__container'); if (tmpC) tmpC.remove();
    }
    pdf.save(fname); overlay.remove(); restoreViewState(state);
  }

  $('paySearch').addEventListener('input', renderPaymentView);

  // ── Payment actions (delegated) ──
  let payFormCompany = null;
  let payEditCreditId = null;
  let payHistoryOpenCompany = null;
  let reminderCompany = null;

  function setPayFormMode(edit) {
    $('payFormHeading').textContent = edit ? 'Edit credit' : 'Add Credit';
    $('payFormFifoHint').classList.toggle('hidden', edit);
    $('payDateField').classList.remove('hidden');
    $('payFormDeleteBtn').classList.toggle('hidden', !edit);
    $('payFormOutstanding').classList.toggle('hidden', edit);
  }

  function addTdsEntry(value) {
    const container = $('tdsEntries');
    const row = document.createElement('div');
    row.className = 'tds-entry';
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.step = '0.01';
    inp.placeholder = 'TDS amount'; inp.value = value || '';
    inp.addEventListener('input', updateTdsTotals);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'tds-remove-btn'; btn.textContent = '×';
    btn.addEventListener('click', () => { row.remove(); updateTdsTotals(); });
    row.appendChild(inp);
    row.appendChild(btn);
    container.appendChild(row);
    updateTdsTotals();
    inp.focus();
  }

  function getTdsValues() {
    return Array.from($('tdsEntries').querySelectorAll('input')).map(i => parseFloat(i.value) || 0);
  }

  function getTdsTotal() {
    return getTdsValues().reduce((s, v) => s + v, 0);
  }

  function updateTdsTotals() {
    const tdsTotal = getTdsTotal();
    const creditAmt = parseFloat($('payAmtInput').value) || 0;
    const hasTds = $('tdsEntries').children.length > 0;
    $('tdsTotalRow').style.display = hasTds ? 'flex' : 'none';
    $('tdsTotalDisplay').textContent = '₹' + fmtNum(tdsTotal);
    $('tdsEffectiveDisplay').textContent = '₹' + fmtNum(creditAmt + tdsTotal);
  }

  function clearTdsEntries() {
    $('tdsEntries').innerHTML = '';
    $('tdsTotalRow').style.display = 'none';
  }

  function loadTdsEntries(arr) {
    clearTdsEntries();
    if (Array.isArray(arr)) arr.forEach(v => addTdsEntry(v));
  }

  $('addTdsBtn').addEventListener('click', () => addTdsEntry());
  $('payAmtInput').addEventListener('input', updateTdsTotals);

  function buildPaymentSummaryDialogHtmlFromSnapshot(s) {
    const ne = escHtml(s.companyName);
    let runningCred = 0;
    const payRows = s.creditEntries.map((c, i) => {
      runningCred += Number(c.amount) || 0;
      const outstandingAfter = Math.max(0, s.totalAmt - runningCred);
      const cid = escHtml(c.id || '');
      const cTds = Array.isArray(c.tdsAmounts) ? c.tdsAmounts.reduce((a, v) => a + v, 0) : 0;
      const baseAmt = c.amount - cTds;
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="pay-sum-nowrap">${formatDateTime(c.date)}</td>
        <td class="r pay-sum-num">₹${fmtNum(baseAmt)}</td>
        <td class="r pay-sum-num">${cTds > 0 ? '₹' + fmtNum(cTds) : '—'}</td>
        <td class="r pay-sum-num">₹${fmtNum(c.amount)}</td>
        <td>${escHtml(c.note || '—')}</td>
        <td class="r pay-sum-num pay-sum-strong">₹${fmtNum(outstandingAfter)}</td>
        <td class="pay-sum-act"><button type="button" class="btn-edit-credit btn btn-sm btn-secondary" data-company="${ne}" data-credit-id="${cid}">Edit</button></td>
      </tr>`;
    }).join('');

    const pendRows = s.openFifo.length
      ? s.openFifo.map(r => `<tr>
          <td>${escHtml(r.inv.invoiceNumber)}</td>
          <td class="pay-sum-nowrap">${r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '—'}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.gross)}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.applied)}</td>
          <td class="r pay-sum-num pay-sum-strong">₹${fmtNum(r.balance)}</td>
          <td class="c">${daysSince(r.inv.invoiceDate || r.inv.createdAt)}d</td>
          <td class="pay-sum-act"><button type="button" class="btn-view" data-inv-id="${r.inv.id}">View</button></td>
        </tr>`).join('')
      : `<tr><td colspan="7" class="pay-sum-empty">No pending balances — all covered (FIFO).</td></tr>`;

    const fifoRowsHtml = s.fifoRows.length
      ? s.fifoRows.map(r => `<tr class="${r.balance <= 0.005 ? 'pay-sum-row-cleared' : ''}">
          <td>${escHtml(r.inv.invoiceNumber)}</td>
          <td class="pay-sum-nowrap">${r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '—'}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.gross)}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.applied)}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.balance)}</td>
          <td class="c">${r.balance <= 0.005 ? 'Cleared' : 'Due'}</td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="pay-sum-empty">No invoices.</td></tr>`;

    const paymentsTbody = s.payCount
      ? payRows
      : `<tr><td colspan="8" class="pay-sum-empty">No credits recorded yet.</td></tr>`;

    return `<div class="pay-sum-dialog">
        <div class="pay-sum-toolbar">
          <button type="button" class="btn btn-primary btn-sm btn-pay-summary-pdf" data-company="${ne}">Download summary PDF</button>
          <button type="button" class="btn btn-sm btn-whatsapp btn-pay-wa" data-company="${ne}">WhatsApp</button>
        </div>
        <div class="pay-sum-hdr">
          <div class="pay-sum-co">${escHtml(COMPANY.name)}</div>
          <div class="pay-sum-title">Payment summary — outstanding &amp; credits</div>
          <div class="pay-sum-meta"><strong>Customer:</strong> ${ne}</div>
          <div class="pay-sum-gen">Generated: ${escHtml(s.generatedAt)}</div>
        </div>

        <h4 class="pay-sum-h4">Figures at a glance</h4>
        <table class="pay-sum-table pay-sum-figures">
          <colgroup><col style="width:58%"><col style="width:42%"></colgroup>
          <tbody>
            <tr class="pay-sum-zebra"><td>Invoices billed (no.)</td><td class="r pay-sum-strong">${s.invCount}</td></tr>
            <tr><td>Total billed</td><td class="r pay-sum-num">₹${fmtNum(s.totalAmt)}</td></tr>
            <tr class="pay-sum-zebra"><td>Payments recorded (no.)</td><td class="r pay-sum-strong">${s.payCount}</td></tr>
            <tr><td>Total credited</td><td class="r pay-sum-num">₹${fmtNum(s.credited)}</td></tr>
            ${s.totalTds > 0 ? `<tr class="pay-sum-zebra"><td>Total TDS</td><td class="r pay-sum-num">₹${fmtNum(s.totalTds)}</td></tr>` : ''}
            <tr class="pay-sum-out-row"><td><strong>Outstanding</strong></td><td class="r pay-sum-strong">₹${fmtNum(s.outstanding)}</td></tr>
            <tr><td>Invoices with balance due (no.)</td><td class="r pay-sum-strong">${s.pendCount}</td></tr>
          </tbody>
        </table>
        <p class="pay-sum-fifo-note">Credits apply oldest invoice date first (FIFO).</p>

        <h4 class="pay-sum-h4">Payments (chronological)</h4>
        <div class="pay-table-scroll pay-sum-scroll">
          <table class="pay-sum-table pay-sum-payments">
            <colgroup><col style="width:4%"><col style="width:16%"><col style="width:13%"><col style="width:10%"><col style="width:13%"><col style="width:18%"><col style="width:14%"><col style="width:8%"></colgroup>
            <thead><tr><th class="c">#</th><th>When</th><th class="r">Credit</th><th class="r">TDS</th><th class="r">Total</th><th>Note</th><th class="r">Outstanding</th><th></th></tr></thead>
            <tbody>${paymentsTbody}</tbody>
          </table>
        </div>

        <h4 class="pay-sum-h4">Invoices pending</h4>
        <div class="pay-table-scroll pay-sum-scroll">
          <table class="pay-sum-table pay-sum-pending">
            <colgroup><col class="pay-sum-p17"><col class="pay-sum-p14"><col class="pay-sum-p16"><col class="pay-sum-p17"><col class="pay-sum-p18"><col class="pay-sum-p10"><col class="pay-sum-p8"></colgroup>
            <thead><tr><th>Inv. no.</th><th>Date</th><th class="r">Total</th><th class="r">Settled</th><th class="r">Balance</th><th class="c">Days</th><th></th></tr></thead>
            <tbody>${pendRows}</tbody>
          </table>
        </div>

        <h4 class="pay-sum-h4">All invoices — FIFO allocation</h4>
        <div class="pay-table-scroll pay-sum-scroll">
          <table class="pay-sum-table pay-sum-fifoalloc">
            <colgroup><col class="pay-sum-p17"><col class="pay-sum-p14"><col class="pay-sum-p16"><col class="pay-sum-p17"><col class="pay-sum-p18"><col class="pay-sum-p18"></colgroup>
            <thead><tr><th>Inv. no.</th><th>Date</th><th class="r">Total</th><th class="r">Settled</th><th class="r">Balance</th><th class="c">Status</th></tr></thead>
            <tbody>${fifoRowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }

  function fillPayHistoryOverlay(name) {
    $('payHistoryLabel').textContent = name;
    const snapshot = getPaymentSummarySnapshot(name);
    $('payHistoryList').innerHTML = buildPaymentSummaryDialogHtmlFromSnapshot(snapshot);
    $('payHistorySummary').textContent = `Billed ₹${fmtNum(snapshot.totalAmt)} · Credits ₹${fmtNum(snapshot.credited)} · Outstanding ₹${fmtNum(snapshot.outstanding)}`;
  }

  function viewInvoiceFromPayment(id) {
    const inv = invoices.find(x => x.id === id);
    if (!inv) return;
    cameFromPayment = true;
    loadInvoiceIntoForm(inv);
    syncCopyChecks('copyType', 'copyTypePreview');
    buildAllInvoices();
    showView('invoiceView');
    $('formPanel').classList.add('hidden');
    $('previewPanel').classList.remove('hidden');
  }

  $('payCompanyList').addEventListener('click', e => {
    const btn = e.target.closest('button');
    const header = e.target.closest('.pay-company-header');

    if (btn && btn.classList.contains('btn-view')) {
      viewInvoiceFromPayment(btn.dataset.invId);
      return;
    }

    if (btn && btn.classList.contains('btn-pay')) {
      const name = btn.dataset.company;
      payFormCompany = name;
      payEditCreditId = null;
      setPayFormMode(false);
      const outstanding = Math.max(getCompanyInvoiceTotal(name) - (payments[name] ? payments[name].totalCredited : 0), 0);
      $('payFormCompanyLabel').textContent = name;
      $('payFormOutstanding').textContent = `Outstanding: ₹${fmtNum(outstanding)}`;
      $('payAmtInput').value = '';
      $('payNoteInput').value = '';
      clearTdsEntries();
      $('payDateInput').value = isoToDatetimeLocal(new Date().toISOString());
      $('payFormOverlay').classList.remove('hidden');
      $('payAmtInput').focus();
      return;
    }

    if (btn && btn.classList.contains('btn-history')) {
      const name = btn.dataset.company;
      payHistoryOpenCompany = name;
      fillPayHistoryOverlay(name);
      $('payHistoryOverlay').classList.remove('hidden');
      return;
    }

    if (btn && btn.classList.contains('btn-remind')) {
      const name = btn.dataset.company;
      reminderCompany = name;
      $('reminderInvLabel').textContent = name;
      const rec = payments[name];
      $('reminderDateInput').value = (rec && rec.reminder) ? rec.reminder.date : '';
      $('reminderNoteInput').value = (rec && rec.reminder) ? rec.reminder.note : '';
      $('reminderOverlay').classList.remove('hidden');
      $('reminderDateInput').focus();
      return;
    }

    if (header && !btn) {
      const name = header.dataset.company;
      expandedCompany = expandedCompany === name ? null : name;
      renderPaymentView();
    }
  });

  $('payHistoryCloseBtn').addEventListener('click', () => {
    $('payHistoryOverlay').classList.add('hidden');
    payHistoryOpenCompany = null;
  });

  function closePayCreditForm() {
    $('payFormOverlay').classList.add('hidden');
    payFormCompany = null;
    payEditCreditId = null;
    setPayFormMode(false);
  }

  function openEditCreditForm(company, creditId) {
    migratePaymentCreditIds();
    const rec = payments[company];
    const c = rec && rec.credits && rec.credits.find(x => x.id === creditId);
    if (!c) { alert('Credit entry not found'); return; }
    payFormCompany = company;
    payEditCreditId = creditId;
    setPayFormMode(true);
    $('payFormCompanyLabel').textContent = company;
    const baseAmt = c.tdsAmounts && c.tdsAmounts.length ? c.amount - c.tdsAmounts.reduce((s, v) => s + v, 0) : c.amount;
    $('payAmtInput').value = String(baseAmt);
    loadTdsEntries(c.tdsAmounts || []);
    $('payNoteInput').value = c.note || '';
    $('payDateInput').value = isoToDatetimeLocal(c.date);
    $('payFormOverlay').classList.remove('hidden');
    $('payAmtInput').focus();
  }

  $('paymentView').addEventListener('click', e => {
    const pdfBtn = e.target.closest('.btn-pay-summary-pdf');
    if (pdfBtn && pdfBtn.dataset.company) {
      e.stopPropagation();
      e.preventDefault();
      downloadCompanyPaymentSummaryPDF(pdfBtn.dataset.company).catch(() => alert('Could not generate PDF. Try again.'));
      return;
    }
    const waBtn = e.target.closest('.btn-pay-wa');
    if (waBtn && waBtn.dataset.company) {
      e.stopPropagation();
      e.preventDefault();
      var co = waBtn.dataset.company;
      openWhatsappDialog(
        co + ' \u2014 payment summary',
        function(asBlob) { return asBlob ? downloadCompanyPaymentSummaryPDF(co, true) : downloadCompanyPaymentSummaryPDF(co); },
        co
      );
      return;
    }
    const vw = e.target.closest('.btn-view');
    if (vw && vw.dataset.invId && e.target.closest('#payHistoryOverlay')) {
      e.stopPropagation();
      viewInvoiceFromPayment(vw.dataset.invId);
      $('payHistoryOverlay').classList.add('hidden');
      payHistoryOpenCompany = null;
      return;
    }
    const ed = e.target.closest('.btn-edit-credit');
    if (!ed || !ed.dataset.company || !ed.dataset.creditId) return;
    e.stopPropagation();
    openEditCreditForm(ed.dataset.company, ed.dataset.creditId);
  });

  $('payFormSaveBtn').addEventListener('click', () => {
    const baseAmount = parseFloat($('payAmtInput').value);
    if (!baseAmount || baseAmount <= 0) { alert('Enter a valid amount'); return; }
    const d = $('payDateInput').value;
    if (!d) { alert(payEditCreditId ? 'Select credit date and time' : 'Select created date and time'); return; }
    const tdsValues = getTdsValues().filter(v => v > 0);
    const tdsTotal = tdsValues.reduce((s, v) => s + v, 0);
    const effectiveAmount = baseAmount + tdsTotal;
    const dateIso = datetimeLocalToIso(d);
    if (payEditCreditId) {
      updateCompanyCredit(payFormCompany, payEditCreditId, effectiveAmount, $('payNoteInput').value.trim(), dateIso, tdsValues);
    } else {
      addCompanyCredit(payFormCompany, effectiveAmount, $('payNoteInput').value.trim(), dateIso, tdsValues);
    }
    const savedCompany = payFormCompany;
    closePayCreditForm();
    renderPaymentView();
    if (payHistoryOpenCompany === savedCompany) fillPayHistoryOverlay(savedCompany);
  });

  $('payFormDeleteBtn').addEventListener('click', () => {
    if (!payEditCreditId || !payFormCompany) return;
    if (!confirm('Delete this credit entry? Totals and FIFO allocation will update.')) return;
    const savedCompany = payFormCompany;
    deleteCompanyCredit(payFormCompany, payEditCreditId);
    closePayCreditForm();
    renderPaymentView();
    if (payHistoryOpenCompany === savedCompany) fillPayHistoryOverlay(savedCompany);
  });

  $('payFormCancelBtn').addEventListener('click', () => { closePayCreditForm(); });

  $('reminderSaveBtn').addEventListener('click', () => {
    const date = $('reminderDateInput').value;
    if (!date) { alert('Select a reminder date'); return; }
    setCompanyReminder(reminderCompany, date, $('reminderNoteInput').value.trim());
    $('reminderOverlay').classList.add('hidden');
    reminderCompany = null;
    renderPaymentView();
  });
  $('reminderCancelBtn').addEventListener('click', () => { $('reminderOverlay').classList.add('hidden'); reminderCompany = null; });

  // ── Reminder Preset Buttons ──
  function addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return formatDateYMDLocal(d);
  }

  document.querySelectorAll('#reminderOverlay .preset-pill').forEach(btn => {
    btn.addEventListener('click', () => { $('reminderDateInput').value = addDays(+btn.dataset.days); });
  });

  document.querySelectorAll('#invReminderPresets .preset-pill').forEach(btn => {
    btn.addEventListener('click', () => { $('invoiceReminder').value = addDays(+btn.dataset.days); });
  });

  // ── Email Reminder ──
  $('reminderEmailBtn').addEventListener('click', () => {
    if (!reminderCompany) return;
    if (typeof EMAILJS_CONFIG === 'undefined' || EMAILJS_CONFIG.publicKey === 'YOUR_PUBLIC_KEY') {
      alert('EmailJS is not configured yet.\n\nEdit emailjs-config.js with your EmailJS credentials.');
      return;
    }
    const outstanding = Math.max(getCompanyInvoiceTotal(reminderCompany) - (payments[reminderCompany] ? payments[reminderCompany].totalCredited : 0), 0);
    const dueDate = $('reminderDateInput').value ? formatShortDate($('reminderDateInput').value) : 'Not set';
    const userEmail = auth.currentUser ? auth.currentUser.email : '';

    emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_email: userEmail,
      invoice_no: 'All',
      buyer_name: reminderCompany,
      amount: '₹' + fmtNum(outstanding),
      due_date: dueDate
    }).then(() => { alert('Reminder email sent to ' + userEmail); })
      .catch(err => { alert('Failed to send email: ' + (err.text || err.message || err)); });
  });

  // ── Days Aging Filter ──
  let daysFilterFromVal = 30;
  let daysFilterToVal = Infinity;
  let daysFilterOverlayCtx = null;

  function getFilteredDueInvoices(fromDays, toDays) {
    const companyNames = [...new Set(invoices.map(inv => inv.buyerName).filter(Boolean))];
    const results = [];
    companyNames.forEach(name => {
      const fifoRows = fifoAllocationsForCompany(name);
      fifoRows.forEach(r => {
        if (r.balance <= 0.005) return;
        const days = daysSince(r.inv.invoiceDate || r.inv.createdAt);
        if (days >= fromDays && (toDays === Infinity || days <= toDays)) {
          results.push({ inv: r.inv, balance: r.balance, days, company: name });
        }
      });
    });
    results.sort((a, b) => b.days - a.days);
    return results;
  }

  function syncDaysFilterInputs() {
    $('daysFilterFrom').value = daysFilterFromVal;
    $('daysFilterTo').value = daysFilterToVal === Infinity ? '' : daysFilterToVal;
  }

  document.querySelectorAll('.days-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.days-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      daysFilterFromVal = parseInt(btn.dataset.from, 10) || 0;
      daysFilterToVal = btn.dataset.to ? parseInt(btn.dataset.to, 10) : Infinity;
      syncDaysFilterInputs();
    });
  });

  $('daysFilterFrom').addEventListener('input', () => {
    const v = parseInt($('daysFilterFrom').value, 10);
    daysFilterFromVal = Number.isNaN(v) ? 0 : Math.max(0, v);
    document.querySelectorAll('.days-preset').forEach(b => b.classList.remove('active'));
  });

  $('daysFilterTo').addEventListener('input', () => {
    const v = parseInt($('daysFilterTo').value, 10);
    daysFilterToVal = ($('daysFilterTo').value === '' || Number.isNaN(v)) ? Infinity : Math.max(0, v);
    document.querySelectorAll('.days-preset').forEach(b => b.classList.remove('active'));
  });

  function renderDaysFilterResult() {
    const rows = getFilteredDueInvoices(daysFilterFromVal, daysFilterToVal);
    const rangeText = daysFilterToVal === Infinity
      ? daysFilterFromVal + ' days and older'
      : daysFilterFromVal + ' to ' + daysFilterToVal + ' days';
    $('daysFilterTitle').textContent = 'Invoices Due \u2014 ' + rangeText;
    const totalBal = rows.reduce((s, r) => s + r.balance, 0);
    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.company]) grouped[r.company] = [];
      grouped[r.company].push(r);
    });
    const companies = Object.keys(grouped).sort();
    $('daysFilterSummary').textContent = rows.length + ' invoice' + (rows.length !== 1 ? 's' : '') + ' across ' + companies.length + ' customer' + (companies.length !== 1 ? 's' : '') + ' \u00b7 Total: \u20b9' + fmtNum(totalBal);
    const content = $('daysFilterContent');
    content.textContent = '';
    if (rows.length === 0) {
      const p = document.createElement('p');
      p.style.cssText = 'text-align:center;padding:1.5rem;color:var(--text-muted)';
      p.textContent = 'No invoices in this range.';
      content.appendChild(p);
    } else {
      companies.forEach(coName => {
        const coRows = grouped[coName];
        const coTotal = coRows.reduce((s, r) => s + r.balance, 0);
        const block = document.createElement('div');
        block.className = 'df-company-block';
        const header = document.createElement('div');
        header.className = 'df-company-header';
        const nameEl = document.createElement('span');
        nameEl.className = 'df-company-name';
        nameEl.textContent = coName;
        const meta = document.createElement('span');
        meta.className = 'df-company-meta';
        meta.textContent = coRows.length + ' invoice' + (coRows.length !== 1 ? 's' : '') + ' \u00b7 \u20b9' + fmtNum(coTotal);
        header.append(nameEl, meta);
        block.appendChild(header);
        const tbl = document.createElement('table');
        tbl.className = 'data-table pay-table-tight df-company-table';
        const thead = document.createElement('thead');
        const headTr = document.createElement('tr');
        ['Invoice No.', 'Invoice Date', 'Balance Due', 'Days'].forEach((t, i) => {
          const th = document.createElement('th');
          if (i === 2) th.className = 'r';
          if (i === 3) th.className = 'c';
          if (i === 1) th.className = 'pay-col-date';
          th.textContent = t;
          headTr.appendChild(th);
        });
        thead.appendChild(headTr);
        tbl.appendChild(thead);
        const tbody = document.createElement('tbody');
        coRows.forEach(r => {
          const tr = document.createElement('tr');
          const td1 = document.createElement('td'); td1.textContent = r.inv.invoiceNumber; tr.appendChild(td1);
          const td2 = document.createElement('td'); td2.className = 'pay-col-date'; td2.textContent = r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '\u2014'; tr.appendChild(td2);
          const td3 = document.createElement('td'); td3.className = 'r'; td3.textContent = '\u20b9' + fmtNum(r.balance); tr.appendChild(td3);
          const td4 = document.createElement('td'); td4.className = 'c' + (r.days >= 30 ? ' days-overdue' : ''); td4.textContent = r.days + 'd'; tr.appendChild(td4);
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        const wrap = document.createElement('div');
        wrap.className = 'pay-table-scroll';
        wrap.appendChild(tbl);
        block.appendChild(wrap);
        content.appendChild(block);
      });
    }
    $('daysFilterTotals').textContent = '';
    const strong1 = document.createElement('strong'); strong1.textContent = 'Total: \u20b9' + fmtNum(totalBal);
    const strong2 = document.createElement('strong'); strong2.textContent = companies.length.toString();
    const strong3 = document.createElement('strong'); strong3.textContent = rows.length.toString();
    $('daysFilterTotals').append(strong1, ' \u00b7 ', strong3, ' invoice' + (rows.length !== 1 ? 's' : '') + ' across ', strong2, ' customer' + (companies.length !== 1 ? 's' : ''));
  }

  $('daysFilterViewBtn').addEventListener('click', () => {
    daysFilterOverlayCtx = null;
    renderDaysFilterResult();
    $('daysFilterOverlay').classList.remove('hidden');
  });

  $('daysFilterCloseBtn').addEventListener('click', () => {
    $('daysFilterOverlay').classList.add('hidden');
    daysFilterOverlayCtx = null;
  });

  function buildDaysFilterPdfHtml(fromDays, toDays) {
    const rows = getFilteredDueInvoices(fromDays, toDays);
    const rangeText = toDays === Infinity
      ? fromDays + ' days and older'
      : fromDays + ' to ' + toDays + ' days';
    const totalBal = rows.reduce((s, r) => s + r.balance, 0);
    const now = formatDateTime(new Date().toISOString());
    const grouped = {};
    rows.forEach(r => { if (!grouped[r.company]) grouped[r.company] = []; grouped[r.company].push(r); });
    const companies = Object.keys(grouped).sort();
    const tdS = 'padding:4px 6px;vertical-align:top;border-bottom:1px solid #e2e8f0;';
    const thS = 'padding:4px 6px;font-weight:700;text-align:left;border-bottom:2px solid #94a3b8;background:#f1f5f9;';

    const container = document.createElement('div');
    container.style.cssText = 'box-sizing:border-box;width:100%;padding:16px 12px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;';
    const hdr = document.createElement('div');
    hdr.style.cssText = 'border-bottom:2px solid #1e3a5f;padding-bottom:10px;margin-bottom:14px';
    const hTitle = document.createElement('div');
    hTitle.style.cssText = 'font-size:16px;font-weight:700;color:#1e3a5f';
    hTitle.textContent = COMPANY.name;
    const hAddr = document.createElement('div');
    hAddr.style.cssText = 'font-size:8px;color:#64748b;margin-top:2px';
    hAddr.textContent = COMPANY.address.replace(/\n/g, ', ');
    hdr.append(hTitle, hAddr);
    container.appendChild(hdr);
    const meta = document.createElement('div');
    meta.style.cssText = 'margin-bottom:14px';
    const mTitle = document.createElement('div');
    mTitle.style.cssText = 'font-size:13px;font-weight:700;margin-bottom:4px';
    mTitle.textContent = 'Invoices Due \u2014 ' + rangeText;
    const mSub = document.createElement('div');
    mSub.style.cssText = 'font-size:9px;color:#64748b';
    mSub.textContent = 'Generated: ' + now + ' \u00b7 ' + rows.length + ' invoice' + (rows.length !== 1 ? 's' : '') + ' across ' + companies.length + ' customer' + (companies.length !== 1 ? 's' : '') + ' \u00b7 Total: \u20b9' + fmtNum(totalBal);
    meta.append(mTitle, mSub);
    container.appendChild(meta);

    companies.forEach(coName => {
      const coRows = grouped[coName];
      const coTotal = coRows.reduce((s, r) => s + r.balance, 0);
      const coHdr = document.createElement('div');
      coHdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 6px;background:#e2e8f0;border:1px solid #94a3b8;border-bottom:none;margin-top:10px;font-size:9px;';
      const coN = document.createElement('span');
      coN.style.cssText = 'font-weight:700;font-size:10px;';
      coN.textContent = coName;
      const coM = document.createElement('span');
      coM.style.cssText = 'font-weight:600;color:#1e3a5f;';
      coM.textContent = coRows.length + ' invoice' + (coRows.length !== 1 ? 's' : '') + ' \u00b7 \u20b9' + fmtNum(coTotal);
      coHdr.append(coN, coM);
      container.appendChild(coHdr);
      const tbl = document.createElement('table');
      tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:9px;line-height:1.3;border:1px solid #94a3b8;';
      const thead = document.createElement('thead');
      const headTr = document.createElement('tr');
      ['Invoice No.', 'Invoice Date', 'Balance Due', 'Days'].forEach((t, i) => {
        const th = document.createElement('th');
        th.style.cssText = thS + (i === 2 ? 'text-align:right;' : '') + (i === 3 ? 'text-align:center;' : '');
        th.textContent = t;
        headTr.appendChild(th);
      });
      thead.appendChild(headTr); tbl.appendChild(thead);
      const tbody = document.createElement('tbody');
      coRows.forEach((r, i) => {
        const tr = document.createElement('tr');
        if (i % 2 === 1) tr.style.background = '#f8fafc';
        const c1 = document.createElement('td'); c1.style.cssText = tdS; c1.textContent = r.inv.invoiceNumber; tr.appendChild(c1);
        const c2 = document.createElement('td'); c2.style.cssText = tdS; c2.textContent = r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '\u2014'; tr.appendChild(c2);
        const c3 = document.createElement('td'); c3.style.cssText = tdS + 'text-align:right;font-variant-numeric:tabular-nums;'; c3.textContent = '\u20b9' + fmtNum(r.balance); tr.appendChild(c3);
        const c4 = document.createElement('td'); c4.style.cssText = tdS + 'text-align:center;' + (r.days >= 30 ? 'color:#dc2626;font-weight:700;' : ''); c4.textContent = r.days + 'd'; tr.appendChild(c4);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      container.appendChild(tbl);
    });

    const grandTotal = document.createElement('div');
    grandTotal.style.cssText = 'margin-top:12px;padding:6px;text-align:right;font-size:10px;font-weight:700;border-top:2px solid #1e3a5f;';
    grandTotal.textContent = 'Grand Total: \u20b9' + fmtNum(totalBal) + ' \u00b7 ' + rows.length + ' invoice' + (rows.length !== 1 ? 's' : '') + ' across ' + companies.length + ' customer' + (companies.length !== 1 ? 's' : '');
    container.appendChild(grandTotal);
    return container;
  }

  $('daysFilterWithInvoices').addEventListener('change', () => {
    $('daysFilterWithInvoicesOverlay').checked = $('daysFilterWithInvoices').checked;
  });
  $('daysFilterWithInvoicesOverlay').addEventListener('change', () => {
    $('daysFilterWithInvoices').checked = $('daysFilterWithInvoicesOverlay').checked;
  });

  function isIncludeFullInvoices() {
    return $('daysFilterWithInvoices').checked || $('daysFilterWithInvoicesOverlay').checked;
  }

  async function downloadDaysFilterPdf(returnBlob) {
    const fromD = daysFilterFromVal;
    const toD = daysFilterToVal;
    const withInvoices = isIncludeFullInvoices();
    const rows = getFilteredDueInvoices(fromD, toD);

    if (withInvoices && rows.length === 0) {
      alert('No invoices to include in this range.');
      return;
    }

    const state = saveViewState();
    const paper = $('invoicePaper');
    const rangeLabel = toD === Infinity ? fromD + 'd-plus' : fromD + 'd-to-' + toD + 'd';
    const fname = 'invoices-due-' + rangeLabel + '.pdf';
    const summaryOpt = {
      ...PDF_OPT,
      margin: [0.35, 0.42, 0.35, 0.42],
      html2canvas: { ...PDF_OPT.html2canvas, scale: 1.65, scrollX: 0, scrollY: 0 }
    };

    if (!withInvoices) {
      paper.textContent = '';
      paper.appendChild(buildDaysFilterPdfHtml(fromD, toD));
      paper.classList.add('payment-summary-pdf');
      const shield = showPaperForCapture();
      window.scrollTo(0, 0);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 80));
      try {
        if (returnBlob) {
          const pdfObj = await html2pdf().set({ ...summaryOpt, filename: fname }).from(paper).toPdf().get('pdf');
          return { blob: pdfObj.output('blob'), fname };
        }
        await html2pdf().set({ ...summaryOpt, filename: fname }).from(paper).save();
      } finally {
        shield.remove();
        restoreViewState(state);
        paper.classList.remove('payment-summary-pdf');
        const tmp = document.getElementById('html2pdf__container');
        if (tmp) tmp.remove();
      }
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'pdfBulkOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:100000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;';
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#fff;font-size:1.1rem;font-weight:600;font-family:Inter,system-ui,sans-serif;';
    msg.textContent = 'Generating summary page...';
    const bar = document.createElement('div');
    bar.style.cssText = 'width:220px;height:6px;background:rgba(255,255,255,.25);border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:0%;background:#fff;border-radius:3px;transition:width .3s;';
    bar.appendChild(fill);
    overlay.append(msg, bar);
    document.body.appendChild(overlay);

    paper.textContent = '';
    paper.appendChild(buildDaysFilterPdfHtml(fromD, toD));
    paper.classList.add('payment-summary-pdf');
    const shield = showPaperForCapture();
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 80));

    let pdf = await html2pdf().set({ ...summaryOpt, filename: fname }).from(paper).toPdf().get('pdf');
    shield.remove();
    paper.classList.remove('payment-summary-pdf');
    let tmpC = document.getElementById('html2pdf__container');
    if (tmpC) tmpC.remove();

    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('homePanel').classList.add('hidden');
    $('invoiceView').classList.remove('hidden');
    $('formPanel').classList.add('hidden');
    $('previewPanel').classList.remove('hidden');
    paper.style.overflow = 'visible';

    const total = rows.length;
    for (let i = 0; i < total; i++) {
      msg.textContent = 'Generating invoice ' + (i + 1) + ' of ' + total + '...';
      fill.style.width = Math.round(((i + 1) / total) * 100) + '%';
      const inv = rows[i].inv;
      const matchedInv = invoices.find(x => x.id === inv.id);
      if (!matchedInv) continue;
      prepareInvoiceForCapture(matchedInv);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2pdf().set(PDF_OPT).from(paper).toContainer().toCanvas().get('canvas');
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 0.3;
      const usableW = pageW - margin * 2;
      const imgH = (canvas.height * usableW) / canvas.width;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, margin, usableW, imgH);
      tmpC = document.getElementById('html2pdf__container');
      if (tmpC) tmpC.remove();
    }

    if (returnBlob) {
      const blob = pdf.output('blob');
      overlay.remove();
      restoreViewState(state);
      return { blob, fname };
    }
    pdf.save(fname);
    overlay.remove();
    restoreViewState(state);
  }

  async function downloadCompanyDaysFilterPdfBlob(companyName, fromDays, toDays, withInvoices) {
    const rows = getCompanyFilteredDueInvoices(companyName, fromDays, toDays);
    if (withInvoices && rows.length === 0) { alert('No invoices to include in this range.'); return; }
    const state = saveViewState();
    const paper = $('invoicePaper');
    const safe = (companyName || 'company').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(0, 48);
    const rangeLabel = (fromDays === 0 && toDays === Infinity) ? 'all' : toDays === Infinity ? fromDays + 'd-plus' : fromDays + 'd-to-' + toDays + 'd';
    const fname = 'due-' + safe + '-' + rangeLabel + '.pdf';
    const summaryOpt = { ...PDF_OPT, margin: [0.35, 0.42, 0.35, 0.42], html2canvas: { ...PDF_OPT.html2canvas, scale: 1.65, scrollX: 0, scrollY: 0 } };
    if (!withInvoices) {
      paper.textContent = '';
      paper.appendChild(buildCompanyDaysFilterPdfHtml(companyName, fromDays, toDays));
      paper.classList.add('payment-summary-pdf');
      const shield = showPaperForCapture();
      window.scrollTo(0, 0);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 80));
      try {
        const pdfObj = await html2pdf().set({ ...summaryOpt, filename: fname }).from(paper).toPdf().get('pdf');
        return { blob: pdfObj.output('blob'), fname };
      } finally { shield.remove(); restoreViewState(state); paper.classList.remove('payment-summary-pdf'); const tmp = document.getElementById('html2pdf__container'); if (tmp) tmp.remove(); }
    }
    const overlay = document.createElement('div');
    overlay.id = 'pdfBulkOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:100000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;';
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#fff;font-size:1.1rem;font-weight:600;font-family:Inter,system-ui,sans-serif;';
    msg.textContent = 'Generating summary page...';
    const bar = document.createElement('div');
    bar.style.cssText = 'width:220px;height:6px;background:rgba(255,255,255,.25);border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:0%;background:#fff;border-radius:3px;transition:width .3s;';
    bar.appendChild(fill); overlay.append(msg, bar); document.body.appendChild(overlay);
    paper.textContent = '';
    paper.appendChild(buildCompanyDaysFilterPdfHtml(companyName, fromDays, toDays));
    paper.classList.add('payment-summary-pdf');
    const shield = showPaperForCapture();
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 80));
    let pdf = await html2pdf().set({ ...summaryOpt, filename: fname }).from(paper).toPdf().get('pdf');
    shield.remove(); paper.classList.remove('payment-summary-pdf');
    let tmpC = document.getElementById('html2pdf__container'); if (tmpC) tmpC.remove();
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('homePanel').classList.add('hidden');
    $('invoiceView').classList.remove('hidden');
    $('formPanel').classList.add('hidden');
    $('previewPanel').classList.remove('hidden');
    paper.style.overflow = 'visible';
    for (let i = 0; i < rows.length; i++) {
      msg.textContent = 'Generating invoice ' + (i + 1) + ' of ' + rows.length + '...';
      fill.style.width = Math.round(((i + 1) / rows.length) * 100) + '%';
      const matchedInv = invoices.find(x => x.id === rows[i].inv.id);
      if (!matchedInv) continue;
      prepareInvoiceForCapture(matchedInv);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2pdf().set(PDF_OPT).from(paper).toContainer().toCanvas().get('canvas');
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pageW = pdf.internal.pageSize.getWidth();
      const m = 0.3; const usableW = pageW - m * 2;
      const imgH = (canvas.height * usableW) / canvas.width;
      pdf.addPage(); pdf.addImage(imgData, 'JPEG', m, m, usableW, imgH);
      tmpC = document.getElementById('html2pdf__container'); if (tmpC) tmpC.remove();
    }
    const blob = pdf.output('blob');
    overlay.remove(); restoreViewState(state);
    return { blob, fname };
  }

  // ── WhatsApp Share Dialog ──
  let whatsappPdfGenerator = null;
  var waDialogNumbers = [];

  function getCustomerWaNumbers(companyName) {
    if (!companyName) return [];
    var lc = companyName.toLowerCase();
    var cust = customers.find(function(c) { return (c.name || '').toLowerCase() === lc; });
    return (cust && cust.waNumbers && cust.waNumbers.length) ? cust.waNumbers.slice() : [];
  }

  function getWaRecentNumbers() {
    try {
      var arr = JSON.parse(localStorage.getItem('wa_recent_phones') || '[]');
      return Array.isArray(arr) ? arr.slice(0, 10) : [];
    } catch (e) { return []; }
  }

  function saveWaRecentNumbers(phoneArr) {
    var existing = getWaRecentNumbers();
    phoneArr.forEach(function(p) {
      existing = existing.filter(function(n) { return n !== p; });
      existing.unshift(p);
    });
    if (existing.length > 10) existing.length = 10;
    try { localStorage.setItem('wa_recent_phones', JSON.stringify(existing)); } catch (e) {}
  }

  function renderWaCheckList() {
    var list = $('waCheckList');
    while (list.firstChild) list.removeChild(list.firstChild);
    if (waDialogNumbers.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'wa-check-empty';
      empty.textContent = 'No numbers added yet. Add a number below.';
      list.appendChild(empty);
    }
    waDialogNumbers.forEach(function(entry, idx) {
      var item = document.createElement('div');
      item.className = 'wa-check-item';
      var lbl = document.createElement('label');
      lbl.className = 'wa-check-item-left';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = entry.checked;
      cb.addEventListener('change', function() {
        waDialogNumbers[idx].checked = cb.checked;
        updateWaSendBtn();
      });
      var numSpan = document.createElement('span');
      numSpan.className = 'wa-check-item-num';
      numSpan.textContent = '+91 ' + entry.phone;
      lbl.appendChild(cb);
      lbl.appendChild(numSpan);
      item.appendChild(lbl);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'wa-check-item-del';
      del.textContent = '\u00d7';
      del.title = 'Remove';
      del.addEventListener('click', function() {
        if (entry.source === 'Recent') {
          var recents = getWaRecentNumbers().filter(function(n) { return n !== entry.phone; });
          try { localStorage.setItem('wa_recent_phones', JSON.stringify(recents)); } catch (e) {}
        }
        waDialogNumbers.splice(idx, 1);
        renderWaCheckList();
      });
      item.appendChild(del);
      list.appendChild(item);
    });
    updateWaSendBtn();
  }

  function addWaDialogNumber(phone, source, autoCheck) {
    if (waDialogNumbers.some(function(e) { return e.phone === phone; })) return false;
    waDialogNumbers.push({ phone: phone, source: source || '', checked: autoCheck !== false });
    return true;
  }

  function updateWaSendBtn() {
    var count = waDialogNumbers.filter(function(e) { return e.checked; }).length;
    var btn = $('whatsappSendBtn');
    btn.disabled = count === 0;
    if (count === 0) {
      btn.textContent = 'Send to WhatsApp';
    } else if (count === 1) {
      btn.textContent = 'Send to WhatsApp';
    } else {
      btn.textContent = 'Send to ' + count + ' numbers';
    }
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function canShareFiles() {
    if (!isMobileDevice()) return false;
    if (!navigator.share) return false;
    try {
      var testFile = new File(['x'], 't.pdf', { type: 'application/pdf' });
      return navigator.canShare ? navigator.canShare({ files: [testFile] }) : false;
    } catch (e) { return false; }
  }

  async function mobileDirectShare(pdfGeneratorFn) {
    try {
      var result = await pdfGeneratorFn(true);
      if (!result || !result.blob) { alert('Could not generate PDF.'); return; }
      var file = new File([result.blob], result.fname, { type: 'application/pdf' });
      showWaReadyOverlay(file, []);
    } catch (e) {
      alert('Could not generate PDF. Try again.');
    }
  }

  function openWhatsappDialog(label, pdfGeneratorFn, companyName) {
    if (canShareFiles()) {
      mobileDirectShare(pdfGeneratorFn);
      return;
    }

    whatsappPdfGenerator = pdfGeneratorFn;
    $('whatsappPdfLabel').textContent = label || 'Invoice report';
    waDialogNumbers = [];

    var custNums = getCustomerWaNumbers(companyName);
    custNums.forEach(function(n) { addWaDialogNumber(n, 'Customer', true); });

    var recent = getWaRecentNumbers();
    recent.forEach(function(n) { addWaDialogNumber(n, 'Recent', custNums.length === 0); });

    $('whatsappPhoneInput').value = '';
    renderWaCheckList();
    $('whatsappOverlay').classList.remove('hidden');
    if (waDialogNumbers.length === 0) {
      setTimeout(function() { $('whatsappPhoneInput').focus(); }, 100);
    }
  }

  function closeWhatsappDialog() {
    $('whatsappOverlay').classList.add('hidden');
    whatsappPdfGenerator = null;
  }

  var waReadyFile = null;
  var waReadyPhones = [];

  function showWaReadyOverlay(file, phones) {
    waReadyFile = file;
    waReadyPhones = phones;

    if (canShareFiles()) {
      $('waReadyHint').textContent = 'Tap below \u2192 choose WhatsApp \u2192 pick the contact \u2192 PDF is attached!';
      $('waReadyShareBtn').textContent = '\u{1F4E4} Share PDF via WhatsApp';
    } else {
      $('waReadyHint').textContent = 'PDF downloaded. Tap below to open WhatsApp chats, then attach the file.';
      $('waReadyShareBtn').textContent = 'Open WhatsApp';
    }
    $('waReadyOverlay').classList.remove('hidden');
  }

  $('waReadyCloseBtn').addEventListener('click', function() {
    $('waReadyOverlay').classList.add('hidden');
    waReadyFile = null;
    waReadyPhones = [];
  });

  $('waReadyShareBtn').addEventListener('click', async function() {
    if (!waReadyFile) return;
    var phones = waReadyPhones;
    var freshFile = new File([waReadyFile], waReadyFile.name, { type: 'application/pdf' });

    $('waReadyOverlay').classList.add('hidden');
    waReadyFile = null;
    waReadyPhones = [];

    if (canShareFiles()) {
      try {
        await navigator.share({ files: [freshFile] });
        return;
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') return;
      }
    }

    var blobUrl = URL.createObjectURL(freshFile);
    var a = document.createElement('a');
    a.href = blobUrl; a.download = freshFile.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 15000);

    if (phones.length > 0) {
      var waBase = 'https://wa.me/';
      for (var pi = 0; pi < phones.length; pi++) {
        window.open(waBase + '91' + phones[pi], '_blank');
      }
    }
  });

  $('waAddNumBtn').addEventListener('click', function() {
    var val = $('whatsappPhoneInput').value.replace(/\D/g, '');
    if (val.length !== 10) { alert('Enter a valid 10-digit number.'); return; }
    if (!addWaDialogNumber(val, 'Manual', true)) { alert('Number already in the list.'); return; }
    $('whatsappPhoneInput').value = '';
    renderWaCheckList();
  });

  $('whatsappPhoneInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); $('waAddNumBtn').click(); }
  });

  $('whatsappCancelBtn').addEventListener('click', closeWhatsappDialog);

  $('whatsappDownloadOnlyBtn').addEventListener('click', async function() {
    if (!whatsappPdfGenerator) return;
    var gen = whatsappPdfGenerator;
    closeWhatsappDialog();
    try { await gen(false); }
    catch (e) { alert('Could not generate PDF. Try again.'); }
  });

  $('whatsappSendBtn').addEventListener('click', async function() {
    var selected = waDialogNumbers.filter(function(e) { return e.checked; });
    if (selected.length === 0) { alert('Select at least one number.'); return; }

    var gen = whatsappPdfGenerator;
    if (!gen) return;

    var phones = selected.map(function(e) { return e.phone; });
    saveWaRecentNumbers(phones);
    closeWhatsappDialog();

    try {
      var result = await gen(true);
      if (!result || !result.blob) {
        alert('Could not generate PDF.');
        return;
      }
      var blob = result.blob;
      var fname = result.fname;
      var file = new File([blob], fname, { type: 'application/pdf' });

      showWaReadyOverlay(file, phones);

    } catch (e) {
      alert('Could not generate PDF. Try again.');
    }
  });

  $('daysFilterPdfBtn').addEventListener('click', function() {
    downloadDaysFilterPdf(false);
  });

  $('daysFilterWaBtn').addEventListener('click', function() {
    var fromD = daysFilterFromVal;
    var toD = daysFilterToVal;
    var rangeLabel = toD === Infinity ? fromD + 'd+' : fromD + 'd\u2013' + toD + 'd';
    openWhatsappDialog(
      'All customers \u2014 invoices due (' + rangeLabel + ')',
      function(asBlob) { return asBlob ? downloadDaysFilterPdf(true) : downloadDaysFilterPdf(false); },
      null
    );
  });

  $('daysFilterResultPdfBtn').addEventListener('click', function() {
    if (daysFilterOverlayCtx) {
      var ctx = daysFilterOverlayCtx;
      var withInv = $('daysFilterWithInvoicesOverlay').checked;
      downloadCompanyDaysFilterPdf(ctx.company, ctx.from, ctx.to, withInv);
    } else {
      downloadDaysFilterPdf(false);
    }
  });

  $('daysFilterResultWaBtn').addEventListener('click', function() {
    if (daysFilterOverlayCtx) {
      var ctx = daysFilterOverlayCtx;
      var withInv = $('daysFilterWithInvoicesOverlay').checked;
      openWhatsappDialog(
        ctx.company + ' \u2014 due invoices',
        function(asBlob) {
          return asBlob
            ? downloadCompanyDaysFilterPdfBlob(ctx.company, ctx.from, ctx.to, withInv)
            : downloadCompanyDaysFilterPdf(ctx.company, ctx.from, ctx.to, withInv);
        },
        ctx.company
      );
    } else {
      openWhatsappDialog(
        'Invoices due report',
        function(asBlob) { return asBlob ? downloadDaysFilterPdf(true) : downloadDaysFilterPdf(false); },
        null
      );
    }
  });

  // ── Browser Notifications for Due Reminders ──
  // Company reminders (Payments → Remind) and per-invoice Reminder Date both trigger when date ≤ today
  // and there is still an outstanding balance (FIFO for invoice-level).
  function checkReminders() {
    const todayStr = formatDateYMDLocal(new Date());
    const items = [];
    Object.entries(payments).forEach(([name, rec]) => {
      if (!rec.reminder || rec.reminder.date > todayStr) return;
      const outstanding = Math.max(getCompanyInvoiceTotal(name) - (rec.totalCredited || 0), 0);
      if (outstanding > 0) {
        items.push({ title: 'Payment reminder', body: `${name} — Outstanding ₹${fmtNum(outstanding)}` });
      }
    });
    const invoiceDueByCompany = new Map();
    invoices.forEach(inv => {
      if (!inv.reminderDate || inv.reminderDate > todayStr || !inv.buyerName) return;
      const rows = fifoAllocationsForCompany(inv.buyerName);
      const row = rows.find(r => r.inv.id === inv.id);
      const balance = row ? row.balance : computeGrandTotal(inv);
      if (balance <= 0.005) return;
      if (!invoiceDueByCompany.has(inv.buyerName)) invoiceDueByCompany.set(inv.buyerName, []);
      invoiceDueByCompany.get(inv.buyerName).push({
        num: inv.invoiceNumber || inv.id,
        balance
      });
    });
    invoiceDueByCompany.forEach((list, name) => {
      const parts = list.map(x => `${x.num} (₹${fmtNum(x.balance)})`);
      items.push({
        title: 'Invoice reminder due',
        body: `${name}: ${parts.join(', ')}`
      });
    });
    if (!items.length || !('Notification' in window)) return;
    const notify = () => items.forEach(it => new Notification(it.title, { body: it.body }));
    if (Notification.permission === 'granted') notify();
    else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') notify(); });
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  // ══════════════════════════════════════
  // ── Autocomplete Helper ──
  // ══════════════════════════════════════
  function createAutocomplete(input, getItems, onSelect, opts) {
    const showOnEmpty = opts && opts.showOnEmpty !== undefined ? opts.showOnEmpty : true;
    const wrap = document.createElement('div');
    wrap.className = 'ac-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const list = document.createElement('div');
    list.className = 'ac-list hidden';
    wrap.appendChild(list);

    let activeIdx = -1;

    function show(items) {
      list.innerHTML = '';
      activeIdx = -1;
      if (!items.length) { list.classList.add('hidden'); return; }
      items.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'ac-item';
        div.innerHTML = item.label;
        div.addEventListener('mousedown', e => {
          e.preventDefault();
          onSelect(item.data);
          list.classList.add('hidden');
        });
        list.appendChild(div);
      });
      list.classList.remove('hidden');
    }

    function showSuggestions() {
      const val = input.value.trim().toLowerCase();
      if (val) {
        show(getItems(val));
      } else if (showOnEmpty) {
        show(getItems('').slice(0, 5));
      } else {
        list.classList.add('hidden');
      }
    }

    input.addEventListener('input', showSuggestions);

    input.addEventListener('keydown', e => {
      const items = list.querySelectorAll('.ac-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        items[activeIdx].dispatchEvent(new Event('mousedown'));
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => list.classList.add('hidden'), 150);
    });

    input.addEventListener('focus', showSuggestions);
  }

  // ── Customer Form: Autocomplete on Company Name & GSTIN (only on typing) ──
  createAutocomplete(
    $('custName'),
    val => customers
      .filter((c, i) => i !== editCustIdx && c.name.toLowerCase().includes(val))
      .map(c => ({ label: `${escHtml(c.name)}<small>${escHtml(c.gstin)}</small>`, data: c })),
    c => {
      $('custName').value = c.name;
      $('custGstin').value = c.gstin;
      $('custAddress').value = c.address;
      $('custContact').value = c.contact;
      $('custPhone').value = c.phone;
      $('custPoNumber').value = c.poNumber || '';
      $('custPoDate').value = c.poDate || '';
      $('custGstType').value = c.gstType === 'inter' ? 'inter' : 'intra';
      tempConsignees = c.consignees ? c.consignees.map(x => ({...x})) : [];
      tempCustProducts = c.associatedProducts ? [...c.associatedProducts] : [];
      tempWaNumbers = c.waNumbers ? [...c.waNumbers] : [];
      renderConsigneeList();
      renderCustProdList();
      renderCustWaNumbers();
    },
    { showOnEmpty: false }
  );

  createAutocomplete(
    $('custGstin'),
    val => customers
      .filter((c, i) => i !== editCustIdx && c.gstin.toLowerCase().includes(val))
      .map(c => ({ label: `${escHtml(c.gstin)}<small>${escHtml(c.name)}</small>`, data: c })),
    c => {
      $('custName').value = c.name;
      $('custGstin').value = c.gstin;
      $('custAddress').value = c.address;
      $('custContact').value = c.contact;
      $('custPhone').value = c.phone;
      $('custPoNumber').value = c.poNumber || '';
      $('custPoDate').value = c.poDate || '';
      $('custGstType').value = c.gstType === 'inter' ? 'inter' : 'intra';
      tempConsignees = c.consignees ? c.consignees.map(x => ({...x})) : [];
      tempCustProducts = c.associatedProducts ? [...c.associatedProducts] : [];
      tempWaNumbers = c.waNumbers ? [...c.waNumbers] : [];
      renderConsigneeList();
      renderCustProdList();
      renderCustWaNumbers();
    },
    { showOnEmpty: false }
  );

  // ── Associated Products Autocomplete (in customer form) ──
  createAutocomplete(
    $('custProdNameInput'),
    val => products
      .filter(p => !tempCustProducts.includes(p.name) &&
        (p.name.toLowerCase().includes(val) || p.hsn.toLowerCase().includes(val)))
      .map(p => ({ label: escHtml(p.name) + '<small>HSN: ' + escHtml(p.hsn) + ' | \u20B9' + Number(p.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</small>', data: p })),
    p => {
      $('custProdNameInput').value = p.name;
      $('custProdHsnInput').value = p.hsn;
      const pr = Number(p.rate);
      $('custProdRateInput').value = Number.isFinite(pr) ? String(Math.round(pr * 100) / 100) : '';
    }
  );

  // ══════════════════════════════════════
  // ── Invoice Generator ──
  // ══════════════════════════════════════
  const COMPANY = {
    name: 'KARTHICK INDUSTRIES',
    address: 'No. 61, SSOA Complex, Natesan Nagar, Vanagaram Road,\nAthipet, Chennai - 600 058.',
    email: 'karthickindustries18@gmail.com',
    phone: '9003291274',
    gstin: '33AKKPR0176Q1ZK'
  };

  /** GST state/UT codes (first 2 digits of GSTIN) — for e-way bill text helper */
  const GST_STATE_NAMES = {
    '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
    '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
    '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
    '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
    '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '32': 'Kerala', '33': 'Tamil Nadu',
    '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
    '38': 'Ladakh', '97': 'Other Territory', '99': 'Foreign / Other'
  };

  function extractPincode(addr) {
    if (!addr) return '';
    const m = String(addr).match(/\b(\d{6})\b/);
    return m ? m[1] : '';
  }

  function stateNameFromGstin(gstin) {
    const g = (gstin || '').trim().toUpperCase();
    if (g.length < 2) return '—';
    return GST_STATE_NAMES[g.slice(0, 2)] || `State code ${g.slice(0, 2)}`;
  }

  /** Plain text aligned with common e-way bill fields; portal is filled manually (no API/login from this app). */
  function buildEwayBillClipboardText() {
    const data = collectInvoiceData();
    const invNo = data.invoiceNumber.trim();
    const buyer = data.buyerName.trim();
    if (!invNo || !buyer) return null;
    const gstRate = Number(data.gstRate) || 0;
    const gstType = data.gstType || 'intra';
    const dmy = data.invoiceDate ? formatShortDate(data.invoiceDate) : '—';
    const shipName = data.sameAsBuyer !== false ? buyer : (data.consigneeName || '').trim();
    const shipAddr = data.sameAsBuyer !== false ? (data.buyerAddress || '').trim() : (data.consigneeAddress || '').trim();
    const lines = [];
    lines.push('E-WAY BILL — GST portal (manual entry helper)');
    lines.push('Portal: https://ewaybillgst.gov.in/BillGeneration/BillGeneration.aspx');
    lines.push('');
    lines.push('Supply type: Outward  |  Sub type: Supply  |  Document type: Tax Invoice');
    lines.push(`Document No: ${invNo}`);
    lines.push(`Document Date: ${dmy}`);
    lines.push('Transaction type: Regular');
    lines.push('');
    lines.push('--- Bill from / Dispatch from ---');
    lines.push(`Name: ${COMPANY.name}`);
    lines.push(`GSTIN: ${COMPANY.gstin}`);
    lines.push(`Address: ${COMPANY.address.replace(/\n/g, ', ')}`);
    lines.push(`Pincode: ${extractPincode(COMPANY.address) || '—'}`);
    lines.push(`State: ${stateNameFromGstin(COMPANY.gstin)}`);
    lines.push('');
    lines.push('--- Bill to ---');
    lines.push(`Name: ${buyer}`);
    lines.push(`GSTIN: ${(data.buyerGstin || '').trim() || '—'}`);
    lines.push(`Address: ${(data.buyerAddress || '').replace(/\n/g, ', ')}`);
    lines.push(`Pincode: ${extractPincode(data.buyerAddress) || '—'}`);
    lines.push(`State: ${stateNameFromGstin(data.buyerGstin)}`);
    lines.push('');
    lines.push('--- Ship to ---');
    lines.push(`Name: ${shipName || '—'}`);
    lines.push(`Address: ${String(shipAddr || '').replace(/\n/g, ', ')}`);
    lines.push(`Pincode: ${extractPincode(shipAddr) || '—'}`);
    if (data.sameAsBuyer !== false) {
      lines.push(`GSTIN: ${(data.buyerGstin || '').trim() || '—'}`);
      lines.push(`State: ${stateNameFromGstin(data.buyerGstin)}`);
    } else {
      lines.push('GSTIN: — (not on invoice when ship-to differs; add on portal if needed)');
      lines.push('State: — (from consignee on portal)');
    }
    lines.push('');
    lines.push('--- Line items (taxable = qty × rate) ---');
    let subtotal = 0;
    let lineNo = 0;
    (data.items || []).forEach(it => {
      const qty = Math.round(Number(it.qty) || 0);
      const rate = Number(it.rate) || 0;
      const taxable = qty * rate;
      const hasLine = ((it.description || '').trim() || (it.hsn || '').trim()) || taxable > 0;
      if (!hasLine) return;
      subtotal += taxable;
      lineNo += 1;
      const unit = (it.packages || 0) > 0 ? 'BAG' : 'NOS';
      lines.push(`${lineNo}. ${(it.description || '').trim() || '—'} | HSN: ${(it.hsn || '').trim() || '—'} | Qty: ${qty} ${unit} | Taxable ₹: ${fmtNum(taxable)}`);
    });
    lines.push(`Subtotal (taxable): ₹${fmtNum(subtotal)}`);
    if (gstType === 'intra') {
      lines.push(`GST: CGST ${gstRate}% + SGST ${gstRate}% (intra-state)`);
    } else {
      lines.push(`GST: IGST ${gstRate}% (inter-state)`);
    }
    lines.push('');
    lines.push('--- Transport (complete distance / vehicle on portal) ---');
    lines.push(`Mode / note: ${(data.transportMode || '').trim() || 'By Road'}`);
    lines.push('On portal: Approx. distance (km), Transporter ID & name, Vehicle no., Part-B as applicable.');
    return lines.join('\n');
  }

  const today = new Date();
  $('invoiceDate').value = formatDateYMDLocal(today);

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
  let items = [{ description: '', hsn: '', packages: 0, qty: null, rate: null }];

  /** Integer qty for NOS; avoids float noise (e.g. 1599.999…) and matches invoice display. */
  function qtyInputDisplay(v) {
    if (v == null || v === '') return '';
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n === 0) return '';
    return String(n);
  }

  function rateInputDisplay(v) {
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return '';
    const r = Math.round(n * 100) / 100;
    return String(r);
  }

  function parseRateToStore(raw) {
    const t = String(raw).trim().replace(/,/g, '');
    if (t === '' || t === '.') return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n === 0) return 0;
    return Math.round(n * 100) / 100;
  }

  function parseQtyToStore(raw) {
    const t = String(raw).trim().replace(/,/g, '');
    if (t === '') return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
  }

  function packagesInputDisplay(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return '';
    return String(n);
  }

  function parsePackagesToStore(raw) {
    const t = String(raw).trim().replace(/,/g, '');
    if (t === '') return 0;
    const n = Math.round(Number(t));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  function formatBags(n) {
    if (!n || n <= 0) return '';
    return n === 1 ? '1 Bag' : n + ' Bags';
  }

  function renderItems() {
    const tbody = $('itemsBody');
    tbody.innerHTML = '';
    items.forEach((item, i) => {
      const amount = (Math.round(Number(item.qty) || 0)) * (Number(item.rate) || 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" value="${esc(item.description)}" data-i="${i}" data-f="description" /></td>
        <td><input type="text" value="${esc(item.hsn)}" data-i="${i}" data-f="hsn" /></td>
        <td><input type="text" class="inv-qty-input" inputmode="numeric" autocomplete="off" value="${esc(packagesInputDisplay(item.packages))}" data-i="${i}" data-f="packages" /></td>
        <td><input type="text" class="inv-qty-input" inputmode="numeric" autocomplete="off" value="${esc(qtyInputDisplay(item.qty))}" data-i="${i}" data-f="qty" /></td>
        <td><input type="text" class="inv-qty-input inv-rate-input" inputmode="decimal" autocomplete="off" value="${esc(rateInputDisplay(item.rate))}" data-i="${i}" data-f="rate" /></td>
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
      items[i].packages = parsePackagesToStore(inp.value);
    } else if (f === 'qty') {
      items[i].qty = parseQtyToStore(inp.value);
    } else if (f === 'rate') {
      items[i].rate = parseRateToStore(inp.value);
    }
    if (f === 'qty' || f === 'rate') {
      const amtDiv = inp.closest('tr').querySelector('.amount-display');
      const q = Math.round(Number(items[i].qty) || 0);
      amtDiv.textContent = '₹' + fmtNum(q * (Number(items[i].rate) || 0));
    }
  });

  $('itemsBody').addEventListener('click', e => {
    if (e.target.classList.contains('btn-delete')) {
      const i = +e.target.dataset.i;
      if (items.length > 1) { items.splice(i, 1); renderItems(); }
    }
  });

  $('addItemBtn').addEventListener('click', () => {
    items.push({ description: '', hsn: '', packages: 0, qty: null, rate: null });
    renderItems();
    const rows = $('itemsBody').querySelectorAll('tr');
    rows[rows.length - 1].querySelector('input').focus();
  });

  renderItems();

  // ── Customer Autocomplete on Buyer Name ──
  createAutocomplete(
    $('buyerName'),
    val => customers
      .filter(c => c.name.toLowerCase().includes(val))
      .map(c => ({ label: `${escHtml(c.name)}<small>${escHtml(c.gstin)}</small>`, data: c })),
    c => {
      $('buyerName').value = c.name;
      $('buyerGstin').value = c.gstin;
      $('buyerAddress').value = c.address;
      $('contactPerson').value = c.contact;
      $('contactPhone').value = c.phone;
      $('poNumber').value = c.poNumber || '';
      $('poDate').value = c.poDate || '';
      $('gstType').value = c.gstType === 'inter' ? 'inter' : 'intra';
      $('gstType').dispatchEvent(new Event('change'));
      if (c.consignees && c.consignees.length > 0) {
        $('sameAsBuyer').checked = false;
        $('consigneeFields').classList.remove('hidden');
        $('consigneeName').value = c.consignees[0].name;
        $('consigneeAddress').value = c.consignees[0].address;
      } else {
        $('sameAsBuyer').checked = true;
        $('consigneeFields').classList.add('hidden');
        $('consigneeName').value = '';
        $('consigneeAddress').value = '';
      }
    }
  );

  // ── Consignee Autocomplete: show consignees of the selected buyer ──
  createAutocomplete(
    $('consigneeName'),
    val => {
      const buyerName = $('buyerName').value.trim().toLowerCase();
      const buyer = customers.find(c => c.name.toLowerCase() === buyerName);
      const list = buyer && buyer.consignees ? buyer.consignees : [];
      return list
        .filter(con => con.name.toLowerCase().includes(val))
        .map(con => ({ label: `${escHtml(con.name)}<small>${escHtml(con.address)}</small>`, data: con }));
    },
    con => {
      $('consigneeName').value = con.name;
      $('consigneeAddress').value = con.address;
    }
  );

  // ── Product Autocomplete on Item Description & HSN fields ──
  function getAssociatedProductNames() {
    const buyerName = $('buyerName').value.trim().toLowerCase();
    const buyer = customers.find(c => c.name.toLowerCase() === buyerName);
    return (buyer && buyer.associatedProducts) ? buyer.associatedProducts : [];
  }

  function matchProducts(val) {
    const assocNames = getAssociatedProductNames();
    const matched = products
      .filter(p => p.name.toLowerCase().includes(val) || p.hsn.toLowerCase().includes(val));
    const assoc = matched.filter(p => assocNames.includes(p.name));
    const rest = matched.filter(p => !assocNames.includes(p.name));
    return [...assoc, ...rest]
      .map(p => {
        const isAssoc = assocNames.includes(p.name);
        return { label: `${escHtml(p.name)}<small>${isAssoc ? '★ ' : ''}HSN: ${escHtml(p.hsn)}</small>`, data: p };
      });
  }

  function fillProduct(inp, p) {
    const i = +inp.dataset.i;
    items[i].description = p.name;
    items[i].hsn = p.hsn;
    items[i].rate = p.rate;
    renderItems();
  }

  $('itemsBody').addEventListener('focusin', e => {
    const inp = e.target;
    if ((inp.dataset.f === 'description' || inp.dataset.f === 'hsn') && !inp.dataset.acInit) {
      inp.dataset.acInit = '1';
      createAutocomplete(inp, matchProducts, p => fillProduct(inp, p));
      inp.focus();
    }
  });

  $('invoiceNumber').addEventListener('input', refreshInvoiceNumberDuplicateHint);
  $('invoiceNumber').addEventListener('blur', refreshInvoiceNumberDuplicateHint);

  // ── Preview ──
  $('previewBtn').addEventListener('click', () => {
    const invNo = $('invoiceNumber').value.trim();
    const buyer = $('buyerName').value.trim();
    const reminder = $('invoiceReminder').value;
    if (!invNo) { alert('Invoice No. is required'); $('invoiceNumber').focus(); return; }
    if (!buyer) { alert('Buyer Company Name is required'); $('buyerName').focus(); return; }
    if (!reminder) { alert('Reminder Date is required'); $('invoiceReminder').focus(); return; }
    if (getInvoiceNumberConflict(invNo, editingInvoiceId)) {
      refreshInvoiceNumberDuplicateHint();
      alert('This invoice number already exists. Enter a different invoice number.');
      $('invoiceNumber').focus();
      return;
    }

    syncCopyChecks('copyType', 'copyTypePreview');
    if (!saveCurrentInvoice()) return;
    checkReminders();
    buildAllInvoices();
    $('formPanel').classList.add('hidden');
    $('previewPanel').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('editBtn').addEventListener('click', () => {
    $('previewPanel').classList.add('hidden');
    $('formPanel').classList.remove('hidden');
  });

  // ── Copy type helpers ──
  function getSelectedCopyTypes(cls) {
    return Array.from(document.querySelectorAll('.' + cls + ':checked')).map(cb => cb.value);
  }

  function syncCopyChecks(fromCls, toCls) {
    const selected = getSelectedCopyTypes(fromCls);
    document.querySelectorAll('.' + toCls).forEach(cb => {
      cb.checked = selected.includes(cb.value);
    });
  }

  document.querySelectorAll('.copyType').forEach(cb => {
    cb.addEventListener('change', () => syncCopyChecks('copyType', 'copyTypePreview'));
  });
  document.querySelectorAll('.copyTypePreview').forEach(cb => {
    cb.addEventListener('change', () => {
      syncCopyChecks('copyTypePreview', 'copyType');
      buildAllInvoices();
    });
  });

  function buildAllInvoices() {
    const types = getSelectedCopyTypes('copyType');
    if (!types.length) types.push('');
    $('invoicePaper').innerHTML = types.map(t => buildInvoice(t)).join('<div class="copy-separator"></div>');
  }

  // ── Build Invoice HTML ──
  function buildInvoice(copyType) {
    const gstRate = parseFloat($('gstRate').value) || 0;
    const gstType = $('gstType').value;
    const invoiceDate = $('invoiceDate').value;
    const shortDate = invoiceDate ? formatShortDate(invoiceDate) : '';
    const poDate = $('poDate').value ? formatShortDate($('poDate').value) : '';

    const sameAsBuyerShip = $('sameAsBuyer').checked;
    const consigneeName = sameAsBuyerShip ? $('buyerName').value : $('consigneeName').value;
    const consigneeAddr = sameAsBuyerShip ? $('buyerAddress').value : $('consigneeAddress').value;

    let subtotal = 0;
    const itemRows = items.map((item, i) => {
      const q = Math.round(Number(item.qty) || 0);
      const r = Number(item.rate) || 0;
      const amt = q * r;
      subtotal += amt;
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="l">${esc(item.description).toUpperCase() || '—'}</td>
        <td class="c">${esc(item.hsn)}</td>
        <td class="c">${formatBags(item.packages)}</td>
        <td class="c">${q}</td>
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
    const grandTotal = Math.round(subtotal + totalTax);
    const wordsStr = numberToWords(grandTotal);

    return `
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
          <span><strong>${esc(copyType)}</strong></span>
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
            <col style="width:40%">
            <col style="width:12%">
            <col style="width:18%">
            <col style="width:12%">
            <col style="width:18%">
          </colgroup>
          <tr>
            <td rowspan="3" class="inv-buyer-cell">
              <div class="inv-lbl" style="margin-bottom:4px">Details of Consignee / shipped to :</div>
              <div style="font-weight:700;margin-bottom:4px">${esc(consigneeName).toUpperCase()}</div>
              <div style="margin-bottom:4px">${esc(consigneeAddr).replace(/\n/g, '<br>')}</div>
              ${$('contactPerson').value.trim() ? `<div style="margin-bottom:4px">Contact Name : ${esc($('contactPerson').value).toUpperCase()}</div>` : ''}
              <div style="margin-bottom:4px">Contact : ${esc($('contactPhone').value)}</div>
              ${sameAsBuyerShip ? `<div>GSTIN : ${esc($('buyerGstin').value)}</div>` : ''}
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
            <col style="width:4%">
            <col style="width:43%">
            <col style="width:10%">
            <col style="width:7%">
            <col style="width:7%">
            <col style="width:8%">
            <col style="width:21%">
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
            <col style="width:22%">
            <col style="width:33%">
            <col style="width:22.5%">
            <col style="width:22.5%">
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

  // ── Build Invoice from stored data (no DOM dependency) ──
  function buildInvoiceFromData(inv, copyType) {
    const gstRate = inv.gstRate || 0;
    const gstType = inv.gstType || 'intra';
    const shortDate = inv.invoiceDate ? formatShortDate(inv.invoiceDate) : '';
    const poDate = inv.poDate ? formatShortDate(inv.poDate) : '';
    const sameAsBuyerShip = inv.sameAsBuyer !== false;
    const consigneeName = sameAsBuyerShip ? (inv.buyerName || '') : (inv.consigneeName || '');
    const consigneeAddr = sameAsBuyerShip ? (inv.buyerAddress || '') : (inv.consigneeAddress || '');

    let subtotal = 0;
    const itemRows = (inv.items || []).map((item, i) => {
      const q = Math.round(Number(item.qty) || 0);
      const r = Number(item.rate) || 0;
      const amt = q * r;
      subtotal += amt;
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="l">${esc(item.description).toUpperCase() || '—'}</td>
        <td class="c">${esc(item.hsn)}</td>
        <td class="c">${formatBags(item.packages)}</td>
        <td class="c">${q}</td>
        <td class="c">${fmtNum(item.rate || 0)}</td>
        <td class="r">${fmtNum(amt)}</td>
      </tr>`;
    }).join('');

    let totalTax = 0, cgstAmt = 0, sgstAmt = 0, igstAmt = 0;
    if (gstType === 'intra') {
      cgstAmt = subtotal * (gstRate / 100);
      sgstAmt = subtotal * (gstRate / 100);
      totalTax = cgstAmt + sgstAmt;
    } else {
      igstAmt = subtotal * (gstRate / 100);
      totalTax = igstAmt;
    }
    const grandTotal = Math.round(subtotal + totalTax);
    const wordsStr = numberToWords(grandTotal);

    return `
      <div class="inv">
        <div class="inv-hdr">
          <div class="inv-hdr-name">${COMPANY.name}</div>
          <div class="inv-hdr-addr">${COMPANY.address.replace(/\n/g, '<br>')}</div>
          <div class="inv-hdr-addr">Email.Id. ${COMPANY.email} / Ph.No. ${COMPANY.phone}</div>
      </div>
        <div class="inv-row inv-gstin-row">
          <span><strong>GSTIN : ${COMPANY.gstin}</strong></span>
          <span><strong>${esc(copyType || '')}</strong></span>
        </div>
        <table class="inv-tbl">
          <colgroup><col style="width:55%"><col style="width:20%"><col style="width:25%"></colgroup>
          <tr>
            <td rowspan="3" class="inv-buyer-cell">
              <div class="inv-lbl">Details of Buyer ( Billed To) :</div>
              <div class="inv-buyer-name">${esc(inv.buyerName).toUpperCase()}</div>
              <div class="inv-buyer-addr">${esc(inv.buyerAddress).replace(/\n/g, '<br>')}</div>
              <div class="inv-lbl" style="margin-top:3px">GSTIN : ${esc(inv.buyerGstin)}</div>
            </td>
            <td colspan="2" class="c inv-tax-title"><strong>TAX INVOICE</strong></td>
          </tr>
          <tr><td class="bld">INVOICE NO. :</td><td class="bld inv-meta-val">${esc(inv.invoiceNumber)}</td></tr>
          <tr><td class="bld">DATE :</td><td class="bld inv-meta-val">${shortDate}</td></tr>
        </table>
        <table class="inv-tbl inv-con">
          <colgroup><col style="width:40%"><col style="width:12%"><col style="width:18%"><col style="width:12%"><col style="width:18%"></colgroup>
          <tr>
            <td rowspan="3" class="inv-buyer-cell">
              <div class="inv-lbl" style="margin-bottom:4px">Details of Consignee / shipped to :</div>
              <div style="font-weight:700;margin-bottom:4px">${esc(consigneeName).toUpperCase()}</div>
              <div style="margin-bottom:4px">${esc(consigneeAddr).replace(/\n/g, '<br>')}</div>
              ${(inv.contactPerson || '').trim() ? `<div style="margin-bottom:4px">Contact Name : ${esc(inv.contactPerson).toUpperCase()}</div>` : ''}
              <div style="margin-bottom:4px">Contact : ${esc(inv.contactPhone)}</div>
              ${sameAsBuyerShip ? `<div>GSTIN : ${esc(inv.buyerGstin)}</div>` : ''}
            </td>
            <td class="inv-flbl">P.Order No.</td><td>${esc(inv.poNumber)}</td>
            <td class="inv-flbl">P.O. Date</td><td>${poDate}</td>
          </tr>
          <tr>
            <td class="inv-flbl">Bank name</td><td>${esc(inv.bankName)}</td>
            <td class="inv-flbl">Branch</td><td>${esc(inv.bankBranch)}</td>
          </tr>
          <tr>
            <td class="inv-flbl">Account<br>Number</td><td>${esc(inv.accountNumber)}</td>
            <td class="inv-flbl">IFSC</td><td>${esc(inv.ifscCode)}</td>
          </tr>
        </table>
        <table class="inv-tbl inv-items">
          <colgroup><col style="width:4%"><col style="width:43%"><col style="width:10%"><col style="width:7%"><col style="width:7%"><col style="width:8%"><col style="width:21%"></colgroup>
          <thead><tr>
            <th>SL.No.</th><th>NAME OF THE COMMODITY / SERVICE</th><th>HSN CODE</th>
            <th>No.Of<br>Packages</th><th>Total Qty IN<br>NOS</th><th>Rate Per No.</th><th>GOODS VALUE<br>(in Rs.)</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <table class="inv-tbl inv-bottom">
          <colgroup><col style="width:22%"><col style="width:33%"><col style="width:22.5%"><col style="width:22.5%"></colgroup>
          <tr>
            <td style="white-space:nowrap"><strong>Mode Of Transport :</strong></td>
            <td>${esc(inv.transportMode)}</td>
            <td class="r">TOTAL AMOUNT BEFORE TAX</td>
            <td class="r">${fmtNum(subtotal)}</td>
          </tr>
          ${gstType === 'intra' ? `
          <tr>
            <td rowspan="3" class="c"><strong>INVOICE Value :</strong><br>Rupees</td>
            <td rowspan="3" class="c"><strong>Rupees ${wordsStr} Only</strong></td>
            <td class="r">CGST @ ${gstRate}%</td><td class="r">${fmtNum(cgstAmt)}</td>
          </tr>
          <tr><td class="r">SGST @ ${gstRate}%</td><td class="r">${fmtNum(sgstAmt)}</td></tr>
          <tr><td class="r"><strong>TAX AMOUNT: GST</strong></td><td class="r"><strong>${fmtNum(totalTax)}</strong></td></tr>
          ` : `
          <tr>
            <td rowspan="2" class="c"><strong>INVOICE Value :</strong><br>Rupees</td>
            <td rowspan="2" class="c"><strong>Rupees ${wordsStr} Only</strong></td>
            <td class="r">IGST @ ${gstRate}%</td><td class="r">${fmtNum(igstAmt)}</td>
          </tr>
          <tr><td class="r"><strong>TAX AMOUNT: GST</strong></td><td class="r"><strong>${fmtNum(totalTax)}</strong></td></tr>
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
      </div>`;
  }

  function saveViewState() {
    const state = { views: [], homeHidden: $('homePanel').classList.contains('hidden'),
      formHidden: $('formPanel').classList.contains('hidden'),
      previewHidden: $('previewPanel').classList.contains('hidden'),
      paperHTML: $('invoicePaper').innerHTML };
    document.querySelectorAll('.view').forEach(v => state.views.push({ el: v, hidden: v.classList.contains('hidden') }));
    return state;
  }

  function restoreViewState(state) {
    $('invoicePaper').style.overflow = '';
    state.views.forEach(s => s.hidden ? s.el.classList.add('hidden') : s.el.classList.remove('hidden'));
    state.homeHidden ? $('homePanel').classList.add('hidden') : $('homePanel').classList.remove('hidden');
    state.formHidden ? $('formPanel').classList.add('hidden') : $('formPanel').classList.remove('hidden');
    state.previewHidden ? $('previewPanel').classList.add('hidden') : $('previewPanel').classList.remove('hidden');
    $('invoicePaper').innerHTML = state.paperHTML;
  }

  function showPaperForCapture() {
    const shield = document.createElement('div');
    shield.id = 'pdfShield';
    shield.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:var(--bg,#f0f2f5);z-index:99999;';
    document.body.appendChild(shield);

    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('homePanel').classList.add('hidden');
    $('invoiceView').classList.remove('hidden');
    $('formPanel').classList.add('hidden');
    $('previewPanel').classList.remove('hidden');
    $('invoicePaper').style.overflow = 'visible';
    window.scrollTo(0, 0);
    return shield;
  }

  const PDF_OPT = {
    margin: [0.3, 0.3, 0.3, 0.3],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
  };

  function buildPaymentSummaryPdfHtml(companyName) {
    const s = getPaymentSummarySnapshot(companyName);

    const td = 'padding:3px 4px;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;';
    const th = 'padding:3px 4px;font-weight:700;text-align:left;';
    const thR = 'padding:3px 4px;font-weight:700;text-align:right;';
    const thC = 'padding:3px 4px;font-weight:700;text-align:center;';
    const amt = `${td}text-align:right;font-variant-numeric:tabular-nums;font-size:8px;line-height:1.25;`;
    const tbl = 'width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;box-sizing:border-box;border:1px solid #94a3b8;font-size:8px;line-height:1.25;';

    function pdfWhen(isoStr) {
      if (!isoStr) return '—';
      const raw = String(isoStr);
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return esc(formatShortDate(raw.split('T')[0]));
      const day = formatShortDate(raw.split('T')[0]);
      let h = d.getHours();
      const mi = String(d.getMinutes()).padStart(2, '0');
      const ap = h >= 12 ? 'P' : 'A';
      h = h % 12;
      if (h === 0) h = 12;
      return esc(`${day} ${h}:${mi}${ap}`);
    }

    let runningCred = 0;
    const payRows = s.creditEntries.map((c, i) => {
      runningCred += Number(c.amount) || 0;
      const outAfter = Math.max(0, s.totalAmt - runningCred);
      return `<tr style="border-bottom:1px solid #e2e8f0">
        <td style="${td}text-align:center">${i + 1}</td>
        <td style="${td}font-size:7px;">${pdfWhen(c.date)}</td>
        <td style="${amt}">₹${fmtNum(c.amount)}</td>
        <td style="${td}">${esc(c.note || '—')}</td>
        <td style="${amt}font-weight:600;">₹${fmtNum(outAfter)}</td>
      </tr>`;
    }).join('');

    const pendRows = s.openFifo.length
      ? s.openFifo.map(r => `<tr style="border-bottom:1px solid #e2e8f0">
          <td style="${td}">${esc(r.inv.invoiceNumber)}</td>
          <td style="${td}font-size:7px;">${r.inv.invoiceDate ? esc(formatShortDate(r.inv.invoiceDate)) : '—'}</td>
          <td style="${amt}">₹${fmtNum(r.gross)}</td>
          <td style="${amt}">₹${fmtNum(r.applied)}</td>
          <td style="${amt}font-weight:600;">₹${fmtNum(r.balance)}</td>
          <td style="${td}text-align:center;">${daysSince(r.inv.invoiceDate || r.inv.createdAt)}d</td>
        </tr>`).join('')
      : `<tr><td colspan="6" style="padding:8px;text-align:center;color:#059669">No pending balances — all covered (FIFO).</td></tr>`;

    const allInvRows = s.fifoRows.length
      ? s.fifoRows.map(r => `<tr style="border-bottom:1px solid #e2e8f0;${r.balance <= 0.005 ? 'color:#64748b' : ''}">
        <td style="${td}">${esc(r.inv.invoiceNumber)}</td>
        <td style="${td}font-size:7px;">${r.inv.invoiceDate ? esc(formatShortDate(r.inv.invoiceDate)) : '—'}</td>
        <td style="${amt}">₹${fmtNum(r.gross)}</td>
        <td style="${amt}">₹${fmtNum(r.applied)}</td>
        <td style="${amt}">₹${fmtNum(r.balance)}</td>
        <td style="${td}text-align:center;">${r.balance <= 0.005 ? 'Clr' : 'Due'}</td>
      </tr>`).join('')
      : `<tr><td colspan="6" style="padding:8px;text-align:center">No invoices.</td></tr>`;

    return `<div class="pay-pdf-root" style="box-sizing:border-box;width:100%;max-width:100%;padding:8px 6px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.35;">
      <div style="border-bottom:2px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f">${esc(COMPANY.name)}</div>
        <div style="font-size:11px;font-weight:700;margin-top:4px">Payment summary — outstanding &amp; credits</div>
        <div style="margin-top:6px;font-size:10px"><strong>Customer:</strong> ${esc(s.companyName)}</div>
        <div style="margin-top:2px;font-size:8px;color:#64748b">Generated: ${esc(s.generatedAt)}</div>
      </div>

      <div style="font-size:10px;font-weight:700;margin:8px 0 4px">Figures at a glance</div>
      <table style="${tbl}margin-bottom:10px">
        <colgroup><col style="width:58%"><col style="width:42%"></colgroup>
        <tr style="background:#f1f5f9"><td style="${td}">Invoices billed (no.)</td><td style="${amt}font-weight:700;">${s.invCount}</td></tr>
        <tr><td style="${td}">Total billed</td><td style="${amt}">₹${fmtNum(s.totalAmt)}</td></tr>
        <tr style="background:#f8fafc"><td style="${td}">Payments recorded (no.)</td><td style="${amt}font-weight:700;">${s.payCount}</td></tr>
        <tr><td style="${td}">Total credited</td><td style="${amt}">₹${fmtNum(s.credited)}</td></tr>
        <tr style="background:#fef2f2"><td style="${td}"><strong>Outstanding</strong></td><td style="${amt}"><strong>₹${fmtNum(s.outstanding)}</strong></td></tr>
        <tr><td style="${td}">Invoices with balance due (no.)</td><td style="${amt}font-weight:700;">${s.pendCount}</td></tr>
      </table>
      <p style="margin:0 0 10px;font-size:7px;color:#475569">Credits apply oldest invoice date first (FIFO).</p>

      <div style="font-size:10px;font-weight:700;margin:10px 0 4px">Payments (chronological)</div>
      <table style="${tbl}margin-bottom:10px">
        <colgroup><col style="width:5%"><col style="width:20%"><col style="width:17%"><col style="width:30%"><col style="width:28%"></colgroup>
        <thead><tr style="background:#1e3a5f;color:#fff">
          <th style="${thC}font-size:7px;">#</th>
          <th style="${th}font-size:7px;">When</th>
          <th style="${thR}font-size:7px;">Amount</th>
          <th style="${th}font-size:7px;">Note</th>
          <th style="${thR}font-size:7px;">Outstd.</th>
        </tr></thead>
        <tbody>${s.payCount ? payRows : `<tr><td colspan="5" style="padding:8px;text-align:center">No credits yet.</td></tr>`}</tbody>
      </table>

      <div style="font-size:10px;font-weight:700;margin:10px 0 4px">Invoices pending</div>
      <table style="${tbl}margin-bottom:10px">
        <colgroup><col style="width:17%"><col style="width:14%"><col style="width:16%"><col style="width:17%"><col style="width:18%"><col style="width:18%"></colgroup>
        <thead><tr style="background:#1e3a5f;color:#fff">
          <th style="${th}font-size:7px;">Inv. no.</th>
          <th style="${th}font-size:7px;">Date</th>
          <th style="${thR}font-size:7px;">Total</th>
          <th style="${thR}font-size:7px;">Settled</th>
          <th style="${thR}font-size:7px;">Balance</th>
          <th style="${thC}font-size:7px;">Days</th>
        </tr></thead>
        <tbody>${pendRows}</tbody>
      </table>

      <div style="font-size:10px;font-weight:700;margin:10px 0 4px">All invoices — FIFO allocation</div>
      <table style="${tbl}">
        <colgroup><col style="width:17%"><col style="width:14%"><col style="width:16%"><col style="width:17%"><col style="width:18%"><col style="width:18%"></colgroup>
        <thead><tr style="background:#334155;color:#fff">
          <th style="${th}font-size:7px;">Inv. no.</th>
          <th style="${th}font-size:7px;">Date</th>
          <th style="${thR}font-size:7px;">Total</th>
          <th style="${thR}font-size:7px;">Settled</th>
          <th style="${thR}font-size:7px;">Balance</th>
          <th style="${thC}font-size:7px;">St.</th>
        </tr></thead>
        <tbody>${allInvRows}</tbody>
      </table>
    </div>`;
  }

  async function downloadCompanyPaymentSummaryPDF(companyName, returnBlob) {
    if (!companyName) return;
    const state = saveViewState();
    const paper = $('invoicePaper');
    paper.innerHTML = buildPaymentSummaryPdfHtml(companyName);
    paper.classList.add('payment-summary-pdf');
    const shield = showPaperForCapture();
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 80));
    const safe = (companyName || 'company').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(0, 48);
    const fname = `payment-summary-${safe}.pdf`;
    const payPdfOpt = {
      ...PDF_OPT,
      margin: [0.35, 0.42, 0.35, 0.42],
      html2canvas: { ...PDF_OPT.html2canvas, scale: 1.65, scrollX: 0, scrollY: 0 }
    };
    try {
      if (returnBlob) {
        var blob = await html2pdf().set({ ...payPdfOpt, filename: fname }).from(paper).outputPdf('blob');
        return { blob: blob, fname: fname };
      }
      await html2pdf().set({ ...payPdfOpt, filename: fname }).from(paper).save();
    } finally {
      shield.remove();
      restoreViewState(state);
      paper.classList.remove('payment-summary-pdf');
      const tmp = document.getElementById('html2pdf__container');
      if (tmp) tmp.remove();
    }
  }

  function prepareInvoiceForCapture(inv) {
    loadInvoiceIntoForm(inv);
    syncCopyChecks('copyType', 'copyTypePreview');
    buildAllInvoices();
  }

  async function downloadInvoicePDF(inv) {
    const state = saveViewState();
    prepareInvoiceForCapture(inv);
    const shield = showPaperForCapture();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await html2pdf().set({ ...PDF_OPT, filename: `${inv.invoiceNumber || 'invoice'}.pdf` }).from($('invoicePaper')).save();
    shield.remove();
    restoreViewState(state);
  }

  async function downloadBulkPDF(selected, filename) {
    if (!selected.length) return;
    if (selected.length === 1) return downloadInvoicePDF(selected[0]);

    const state = saveViewState();
    const paper = $('invoicePaper');

    const overlay = document.createElement('div');
    overlay.id = 'pdfBulkOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:100000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;';
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#fff;font-size:1.1rem;font-weight:600;font-family:Inter,system-ui,sans-serif;';
    msg.textContent = 'Preparing PDFs...';
    const bar = document.createElement('div');
    bar.style.cssText = 'width:220px;height:6px;background:rgba(255,255,255,.25);border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:0%;background:#fff;border-radius:3px;transition:width .3s;';
    bar.appendChild(fill);
    overlay.appendChild(msg);
    overlay.appendChild(bar);
    document.body.appendChild(overlay);

    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('homePanel').classList.add('hidden');
    $('invoiceView').classList.remove('hidden');
    $('formPanel').classList.add('hidden');
    $('previewPanel').classList.remove('hidden');
    paper.style.overflow = 'visible';

    let pdf = null;

    for (let i = 0; i < selected.length; i++) {
      msg.textContent = `Generating PDF ${i + 1} of ${selected.length}...`;
      fill.style.width = Math.round(((i + 1) / selected.length) * 100) + '%';

      prepareInvoiceForCapture(selected[i]);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      if (i === 0) {
        pdf = await html2pdf().set({ ...PDF_OPT, filename }).from(paper).toPdf().get('pdf');
      } else {
        const canvas = await html2pdf().set(PDF_OPT).from(paper).toContainer().toCanvas().get('canvas');
        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        const pageW = pdf.internal.pageSize.getWidth();
        const margin = 0.3;
        const usableW = pageW - margin * 2;
        const imgH = (canvas.height * usableW) / canvas.width;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, margin, usableW, imgH);
        const tmpContainer = document.getElementById('html2pdf__container');
        if (tmpContainer) tmpContainer.remove();
      }
    }

    pdf.save(filename);
    overlay.remove();
    restoreViewState(state);
  }

  // ── PDF Download ──
  $('downloadBtn').addEventListener('click', () => {
    const element = $('invoicePaper');
    element.style.overflow = 'visible';
    window.scrollTo(0, 0);
    const invNum = $('invoiceNumber').value || 'invoice';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        html2pdf().set({ ...PDF_OPT, filename: `${invNum}.pdf` }).from(element).save().then(() => {
          element.style.overflow = '';
        });
      });
    });
  });

  $('printBtn').addEventListener('click', () => window.print());

  $('ewayPortalBtn').addEventListener('click', () => {
    window.open('https://ewaybillgst.gov.in/BillGeneration/BillGeneration.aspx', '_blank', 'noopener,noreferrer');
  });

  $('ewayCopyBtn').addEventListener('click', async () => {
    const text = buildEwayBillClipboardText();
    if (!text) {
      alert('Fill Invoice No. and Buyer name first (same fields as Preview).');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      alert('E-way bill details copied. Keep this tab open, use the portal tab to log in and paste into Notepad—or read line by line while filling the form.');
    } catch (err) {
      window.prompt('Copy the text below (Ctrl+C / ⌘C):', text);
    }
  });

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

  // ══════════════════════════════════════
  // ── Vendor Payment Tracking ──
  // ══════════════════════════════════════
  let vendorPayments = {};

  function saveVendorPayments() { db.saveVendorPayments(vendorPayments); }

  function migrateVendorPaymentCreditIds() {
    let changed = false;
    Object.keys(vendorPayments).forEach(name => {
      const rec = vendorPayments[name];
      if (!rec || !Array.isArray(rec.credits)) return;
      rec.credits.forEach(c => {
        if (!c.id) { c.id = genCreditId(); changed = true; }
      });
      const sum = rec.credits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      if (Math.abs((rec.totalCredited || 0) - sum) > 0.001) {
        rec.totalCredited = sum;
        changed = true;
      }
    });
    if (changed) saveVendorPayments();
  }

  function getVendorPayment(name) {
    if (!vendorPayments[name]) vendorPayments[name] = { credits: [], totalCredited: 0, reminder: null };
    return vendorPayments[name];
  }

  function addVendorCredit(name, amount, note, dateIso) {
    const rec = getVendorPayment(name);
    rec.credits.push({
      id: genCreditId(),
      amount: Number(amount),
      date: dateIso || new Date().toISOString(),
      note: note || ''
    });
    rec.totalCredited = rec.credits.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    saveVendorPayments();
  }

  function updateVendorCredit(name, creditId, amount, note, dateIso) {
    const rec = getVendorPayment(name);
    const c = rec.credits.find(x => x.id === creditId);
    if (!c) return false;
    c.amount = Number(amount);
    c.note = note || '';
    c.date = dateIso;
    rec.totalCredited = rec.credits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    saveVendorPayments();
    return true;
  }

  function deleteVendorCredit(name, creditId) {
    const rec = vendorPayments[name];
    if (!rec || !Array.isArray(rec.credits)) return false;
    const next = rec.credits.filter(x => x.id !== creditId);
    if (next.length === rec.credits.length) return false;
    rec.credits = next;
    rec.totalCredited = rec.credits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    saveVendorPayments();
    return true;
  }

  function setVendorReminder(name, date, note) {
    const rec = getVendorPayment(name);
    rec.reminder = { date, note: note || '' };
    saveVendorPayments();
  }

  function getVendorInvoiceTotal(name) {
    return poInvoices.filter(inv => inv.vendorName === name).reduce((s, inv) => s + computePoGrandTotal(inv), 0);
  }

  function sortPoInvoicesFifo(invs) {
    return [...invs].sort((a, b) => {
      const da = (a.invoiceDate || a.createdAt || '').toString();
      const db2 = (b.invoiceDate || b.createdAt || '').toString();
      const cmp = da.localeCompare(db2);
      if (cmp !== 0) return cmp;
      const na = (a.invoiceNumber || '').toString();
      const nb = (b.invoiceNumber || '').toString();
      const c2 = na.localeCompare(nb);
      if (c2 !== 0) return c2;
      return (a.id || '').toString().localeCompare((b.id || '').toString());
    });
  }

  function fifoAllocationsForVendor(name) {
    const invs = sortPoInvoicesFifo(poInvoices.filter(inv => inv.vendorName === name));
    const rec = vendorPayments[name];
    let pool = rec ? Number(rec.totalCredited) : 0;
    if (Number.isNaN(pool) || pool < 0) pool = 0;
    return invs.map(inv => {
      const gross = computePoGrandTotal(inv);
      const applied = Math.min(pool, gross);
      pool = Math.max(0, pool - applied);
      return {
        inv,
        gross,
        applied: Math.round(applied * 100) / 100,
        balance: Math.round((gross - applied) * 100) / 100
      };
    });
  }

  function getVendorPaymentSnapshot(vendorName) {
    migrateVendorPaymentCreditIds();
    const invs = poInvoices.filter(inv => inv.vendorName === vendorName);
    const totalAmt = getVendorInvoiceTotal(vendorName);
    const rec = vendorPayments[vendorName];
    const credited = rec ? rec.totalCredited : 0;
    const outstanding = Math.max(totalAmt - credited, 0);
    const creditEntries = rec && rec.credits ? [...rec.credits].sort((a, b) => new Date(a.date) - new Date(b.date)) : [];
    const fifoRows = fifoAllocationsForVendor(vendorName);
    const openFifo = fifoRows.filter(r => r.balance > 0.005);
    return {
      companyName: vendorName,
      invCount: invs.length,
      totalAmt,
      credited,
      outstanding,
      payCount: creditEntries.length,
      pendCount: openFifo.length,
      creditEntries,
      fifoRows,
      openFifo,
      generatedAt: formatDateTime(new Date().toISOString())
    };
  }

  let vpayExpandedVendor = null;

  function renderVendorPaymentView() {
    const query = ($('vpaySearch').value || '').trim().toLowerCase();
    const vendorNames = [...new Set(poInvoices.map(inv => inv.vendorName).filter(Boolean))].sort();

    const companies = vendorNames.map(name => {
      const invs = poInvoices.filter(inv => inv.vendorName === name);
      const totalAmt = invs.reduce((s, inv) => s + computePoGrandTotal(inv), 0);
      const rec = vendorPayments[name];
      const credited = rec ? rec.totalCredited : 0;
      const outstanding = Math.max(totalAmt - credited, 0);
      const reminder = rec ? rec.reminder : null;
      const oldestDate = invs.reduce((oldest, inv) => {
        const d = inv.invoiceDate || inv.createdAt || '';
        return (!oldest || d < oldest) ? d : oldest;
      }, '');
      return { name, invs, totalAmt, credited, outstanding, reminder, oldestDate, count: invs.length };
    }).filter(c => !query || c.name.toLowerCase().includes(query));

    companies.sort((a, b) => (b.outstanding > 0 ? 1 : 0) - (a.outstanding > 0 ? 1 : 0) || a.name.localeCompare(b.name));

    const totalOutstanding = companies.reduce((s, c) => s + c.outstanding, 0);
    $('vpayTotalOutstanding').textContent = '₹' + fmtNum(totalOutstanding);

    const container = $('vpayCompanyList');
    container.innerHTML = '';
    $('vpayEmpty').classList.toggle('hidden', companies.length > 0);

    const todayStr = formatDateYMDLocal(new Date());

    companies.forEach(co => {
      const isPaid = co.outstanding <= 0;
      const isOverdue = co.reminder && co.reminder.date <= todayStr && !isPaid;
      const isExpanded = vpayExpandedVendor === co.name;

      const section = document.createElement('div');
      section.className = 'pay-company-section' + (isPaid ? ' paid' : '') + (isOverdue ? ' overdue' : '');

      let reminderBadge = '';
      if (co.reminder && !isPaid) {
        const cls = isOverdue ? 'reminder-badge overdue' : 'reminder-badge';
        reminderBadge = `<span class="${cls}" title="Reminder: ${formatShortDate(co.reminder.date)}${co.reminder.note ? ' - ' + escHtml(co.reminder.note) : ''}"></span>`;
      }

      const rec = vendorPayments[co.name];
      const lastCredit = rec && rec.credits && rec.credits.length ? rec.credits[rec.credits.length - 1] : null;
      const lastCreditDate = lastCredit ? formatDateTime(lastCredit.date) : '';
      const fifoRows = fifoAllocationsForVendor(co.name);
      const openFifo = fifoRows.filter(r => r.balance > 0.005);
      const creditEntries = rec && rec.credits && rec.credits.length
        ? [...rec.credits].sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
      let runningCred = 0;
      const creditLogRows = creditEntries.map((c, i) => {
        runningCred += Number(c.amount) || 0;
        const outstandingAfter = Math.max(0, co.totalAmt - runningCred);
        const cid = escHtml(c.id || '');
        return `<tr>
          <td class="c pay-col-idx">${i + 1}</td>
          <td class="pay-col-when">${formatDateTime(c.date)}</td>
          <td class="r">₹${fmtNum(c.amount)}</td>
          <td class="pay-col-note">${escHtml(c.note || '—')}</td>
          <td class="r pay-col-outstanding">₹${fmtNum(outstandingAfter)}</td>
          <td class="pay-credit-actions"><button type="button" class="btn-edit-vcredit btn btn-sm btn-secondary" data-vendor="${escHtml(co.name)}" data-credit-id="${cid}">Edit</button></td>
        </tr>`;
      }).join('');
      const creditLogBlock = creditEntries.length
        ? `<div class="pay-credit-log">
            <h4 class="pay-subhead">Payments recorded</h4>
            <p class="pay-fifo-hint">Each payment shows date &amp; time. <strong>Payable</strong> is billed total minus payments recorded up to that row (chronological). Use Edit to correct an amount. Use <strong>Summary PDF</strong> in the row above for a full printable report.</p>
            <div class="pay-table-scroll">
              <table class="data-table pay-table-tight">
                <thead><tr><th class="c">#</th><th>Date &amp; time</th><th class="r">Amount</th><th>Note</th><th class="r">Payable</th><th></th></tr></thead>
                <tbody>${creditLogRows}</tbody>
              </table>
            </div>
          </div>`
        : `<p class="pay-fifo-hint">No payments yet. Open PO invoices show full amounts until you add payments (applied to oldest invoice dates first).</p>`;

      const invoiceRows = openFifo.map(r => {
        const days = daysSince(r.inv.invoiceDate || r.inv.createdAt);
        return `<tr>
          <td>${escHtml(r.inv.invoiceNumber)}</td>
          <td class="pay-col-date">${r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '—'}</td>
          <td class="r">₹${fmtNum(r.gross)}</td>
          <td class="r pay-col-settled">₹${fmtNum(r.applied)}</td>
          <td class="r pay-col-balance">₹${fmtNum(r.balance)}</td>
          <td class="c${days >= 30 ? ' days-overdue' : ''}">${days}d</td>
          <td><button class="btn-vpay-view" data-inv-id="${r.inv.id}" style="font-size:.78rem">View</button></td>
        </tr>`;
      }).join('');
      const invoiceTable = openFifo.length
        ? `<div class="pay-table-scroll">
            <table class="data-table pay-table-tight" style="margin:0">
              <thead><tr>
                <th>PO Inv. No.</th>
                <th class="pay-col-date">Invoice date</th>
                <th class="r">Invoice total</th>
                <th class="r">Paid</th>
                <th class="r">Balance due</th>
                <th class="c">Days</th>
                <th></th>
              </tr></thead>
              <tbody>${invoiceRows}</tbody>
            </table>
          </div>`
        : `<p class="pay-all-settled">No open balances — payments (oldest PO invoices first) cover every invoice for this vendor.</p>`;

      section.innerHTML = `
        <div class="pay-company-header" data-vendor="${escHtml(co.name)}">
          <div class="pay-company-top">
            <span class="pay-company-toggle">${isExpanded ? '▾' : '▸'}</span>
            <span class="pay-company-name">${escHtml(co.name)}</span> ${reminderBadge}
            <span class="pay-company-meta">${openFifo.length} with balance · ${co.count} PO invoice${co.count !== 1 ? 's' : ''} billed</span>
            ${lastCreditDate ? `<span class="pay-company-date">Last payment: ${lastCreditDate}</span>` : ''}
          </div>
          <div class="pay-company-actions">
            ${!isPaid ? `<button class="btn-vpay btn btn-sm btn-primary" data-vendor="${escHtml(co.name)}">+ Payment</button>` : ''}
            <button type="button" class="btn-vpay-summary-pdf btn btn-sm btn-secondary" data-vendor="${escHtml(co.name)}" title="Download PDF: payments, payable, pending PO invoices">Summary PDF</button>
            <button type="button" class="btn-vpay-wa btn btn-sm btn-whatsapp" data-vendor="${escHtml(co.name)}" title="Share summary via WhatsApp">WhatsApp</button>
            <button class="btn-vhistory btn btn-sm btn-secondary" data-vendor="${escHtml(co.name)}">Summary</button>
            ${!isPaid ? `<button class="btn-vremind btn btn-sm btn-secondary" data-vendor="${escHtml(co.name)}">Remind</button>` : ''}
          </div>
          <div class="pay-company-nums">
            <span class="pay-num-group">Total <strong>₹${fmtNum(co.totalAmt)}</strong></span>
            <span class="pay-num-group">Paid <strong>₹${fmtNum(co.credited)}</strong></span>
            <span class="pay-num-group pay-outstanding">${isPaid ? '<span style="color:#059669">Fully Paid</span>' : `Payable <strong>₹${fmtNum(co.outstanding)}</strong>`}</span>
          </div>
        </div>
        <div class="pay-company-invoices ${isExpanded ? '' : 'hidden'}">
          <p class="pay-fifo-hint pay-fifo-hint-strong">Payments are applied in order of PO invoice date (oldest first) until the recorded payments are used up.</p>
          ${creditLogBlock}
          <h4 class="pay-subhead pay-subhead-spaced">PO Invoices still due</h4>
          ${invoiceTable}
        </div>`;
      container.appendChild(section);
    });
  }

  $('vpaySearch').addEventListener('input', renderVendorPaymentView);

  let vpayFormVendor = null;
  let vpayEditCreditId = null;
  let vpayHistoryOpenVendor = null;
  let vpayReminderVendor = null;

  function setVpayFormMode(edit) {
    $('vpayFormHeading').textContent = edit ? 'Edit payment' : 'Add Payment';
    $('vpayFormFifoHint').classList.toggle('hidden', edit);
    $('vpayDateField').classList.remove('hidden');
    $('vpayFormDeleteBtn').classList.toggle('hidden', !edit);
    $('vpayFormOutstanding').classList.toggle('hidden', edit);
  }

  function buildVendorPaymentSummaryDialogHtml(s) {
    const ne = escHtml(s.companyName);
    let runningCred = 0;
    const payRows = s.creditEntries.map((c, i) => {
      runningCred += Number(c.amount) || 0;
      const outstandingAfter = Math.max(0, s.totalAmt - runningCred);
      const cid = escHtml(c.id || '');
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="pay-sum-nowrap">${formatDateTime(c.date)}</td>
        <td class="r pay-sum-num">₹${fmtNum(c.amount)}</td>
        <td>${escHtml(c.note || '—')}</td>
        <td class="r pay-sum-num pay-sum-strong">₹${fmtNum(outstandingAfter)}</td>
        <td class="pay-sum-act"><button type="button" class="btn-edit-vcredit btn btn-sm btn-secondary" data-vendor="${ne}" data-credit-id="${cid}">Edit</button></td>
      </tr>`;
    }).join('');

    const pendRows = s.openFifo.length
      ? s.openFifo.map(r => `<tr>
          <td>${escHtml(r.inv.invoiceNumber)}</td>
          <td class="pay-sum-nowrap">${r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '—'}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.gross)}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.applied)}</td>
          <td class="r pay-sum-num pay-sum-strong">₹${fmtNum(r.balance)}</td>
          <td class="c">${daysSince(r.inv.invoiceDate || r.inv.createdAt)}d</td>
          <td class="pay-sum-act"><button type="button" class="btn-vpay-view" data-inv-id="${r.inv.id}">View</button></td>
        </tr>`).join('')
      : `<tr><td colspan="7" class="pay-sum-empty">No pending balances — all covered (FIFO).</td></tr>`;

    const fifoRowsHtml = s.fifoRows.length
      ? s.fifoRows.map(r => `<tr class="${r.balance <= 0.005 ? 'pay-sum-row-cleared' : ''}">
          <td>${escHtml(r.inv.invoiceNumber)}</td>
          <td class="pay-sum-nowrap">${r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '—'}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.gross)}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.applied)}</td>
          <td class="r pay-sum-num">₹${fmtNum(r.balance)}</td>
          <td class="c">${r.balance <= 0.005 ? 'Cleared' : 'Due'}</td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="pay-sum-empty">No PO invoices.</td></tr>`;

    const paymentsTbody = s.payCount
      ? payRows
      : `<tr><td colspan="6" class="pay-sum-empty">No payments recorded yet.</td></tr>`;

    return `<div class="pay-sum-dialog">
        <div class="pay-sum-toolbar">
          <button type="button" class="btn btn-primary btn-sm btn-vpay-summary-pdf" data-vendor="${ne}">Download summary PDF</button>
          <button type="button" class="btn btn-sm btn-whatsapp btn-vpay-wa" data-vendor="${ne}">WhatsApp</button>
        </div>
        <div class="pay-sum-hdr">
          <div class="pay-sum-co">${escHtml(COMPANY.name)}</div>
          <div class="pay-sum-title">Vendor payment summary — payable &amp; payments</div>
          <div class="pay-sum-meta"><strong>Vendor:</strong> ${ne}</div>
          <div class="pay-sum-gen">Generated: ${escHtml(s.generatedAt)}</div>
        </div>

        <h4 class="pay-sum-h4">Figures at a glance</h4>
        <table class="pay-sum-table pay-sum-figures">
          <colgroup><col style="width:58%"><col style="width:42%"></colgroup>
          <tbody>
            <tr class="pay-sum-zebra"><td>PO Invoices billed (no.)</td><td class="r pay-sum-strong">${s.invCount}</td></tr>
            <tr><td>Total billed</td><td class="r pay-sum-num">₹${fmtNum(s.totalAmt)}</td></tr>
            <tr class="pay-sum-zebra"><td>Payments recorded (no.)</td><td class="r pay-sum-strong">${s.payCount}</td></tr>
            <tr><td>Total paid</td><td class="r pay-sum-num">₹${fmtNum(s.credited)}</td></tr>
            <tr class="pay-sum-out-row"><td><strong>Payable</strong></td><td class="r pay-sum-strong">₹${fmtNum(s.outstanding)}</td></tr>
            <tr><td>PO Invoices with balance due (no.)</td><td class="r pay-sum-strong">${s.pendCount}</td></tr>
          </tbody>
        </table>
        <p class="pay-sum-fifo-note">Payments apply oldest PO invoice date first (FIFO).</p>

        <h4 class="pay-sum-h4">Payments (chronological)</h4>
        <div class="pay-table-scroll pay-sum-scroll">
          <table class="pay-sum-table pay-sum-payments">
            <colgroup><col class="pay-sum-c5"><col class="pay-sum-c20"><col class="pay-sum-c17"><col class="pay-sum-c30"><col class="pay-sum-c18"><col class="pay-sum-c10"></colgroup>
            <thead><tr><th class="c">#</th><th>When</th><th class="r">Amount</th><th>Note</th><th class="r">Payable</th><th></th></tr></thead>
            <tbody>${paymentsTbody}</tbody>
          </table>
        </div>

        <h4 class="pay-sum-h4">PO Invoices pending</h4>
        <div class="pay-table-scroll pay-sum-scroll">
          <table class="pay-sum-table pay-sum-pending">
            <colgroup><col class="pay-sum-p17"><col class="pay-sum-p14"><col class="pay-sum-p16"><col class="pay-sum-p17"><col class="pay-sum-p18"><col class="pay-sum-p10"><col class="pay-sum-p8"></colgroup>
            <thead><tr><th>PO Inv. no.</th><th>Date</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th class="c">Days</th><th></th></tr></thead>
            <tbody>${pendRows}</tbody>
          </table>
        </div>

        <h4 class="pay-sum-h4">All PO invoices — FIFO allocation</h4>
        <div class="pay-table-scroll pay-sum-scroll">
          <table class="pay-sum-table pay-sum-fifoalloc">
            <colgroup><col class="pay-sum-p17"><col class="pay-sum-p14"><col class="pay-sum-p16"><col class="pay-sum-p17"><col class="pay-sum-p18"><col class="pay-sum-p18"></colgroup>
            <thead><tr><th>PO Inv. no.</th><th>Date</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th class="c">Status</th></tr></thead>
            <tbody>${fifoRowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }

  function fillVpayHistoryOverlay(name) {
    $('vpayHistoryLabel').textContent = name;
    const snapshot = getVendorPaymentSnapshot(name);
    $('vpayHistoryList').innerHTML = buildVendorPaymentSummaryDialogHtml(snapshot);
    $('vpayHistorySummary').textContent = `Billed ₹${fmtNum(snapshot.totalAmt)} · Paid ₹${fmtNum(snapshot.credited)} · Payable ₹${fmtNum(snapshot.outstanding)}`;
  }

  function viewPoInvoiceFromVendorPayment(id) {
    const inv = poInvoices.find(x => x.id === id);
    if (!inv) return;
    cameFromVendorPayment = true;
    loadPoInvoiceIntoForm(inv);
    syncPoCopyChecks('poCopyType', 'poCopyTypePreview');
    buildAllPoInvoices();
    showView('poInvoiceView');
    $('poFormPanel').classList.add('hidden');
    $('poPreviewPanel').classList.remove('hidden');
  }

  $('vpayCompanyList').addEventListener('click', e => {
    const btn = e.target.closest('button');
    const header = e.target.closest('.pay-company-header');

    if (btn && btn.classList.contains('btn-vpay-view')) {
      viewPoInvoiceFromVendorPayment(btn.dataset.invId);
      return;
    }

    if (btn && btn.classList.contains('btn-vpay')) {
      const name = btn.dataset.vendor;
      vpayFormVendor = name;
      vpayEditCreditId = null;
      setVpayFormMode(false);
      const outstanding = Math.max(getVendorInvoiceTotal(name) - (vendorPayments[name] ? vendorPayments[name].totalCredited : 0), 0);
      $('vpayFormCompanyLabel').textContent = name;
      $('vpayFormOutstanding').textContent = `Payable: ₹${fmtNum(outstanding)}`;
      $('vpayAmtInput').value = '';
      $('vpayNoteInput').value = '';
      $('vpayDateInput').value = isoToDatetimeLocal(new Date().toISOString());
      $('vpayFormOverlay').classList.remove('hidden');
      $('vpayAmtInput').focus();
      return;
    }

    if (btn && btn.classList.contains('btn-vhistory')) {
      const name = btn.dataset.vendor;
      vpayHistoryOpenVendor = name;
      fillVpayHistoryOverlay(name);
      $('vpayHistoryOverlay').classList.remove('hidden');
      return;
    }

    if (btn && btn.classList.contains('btn-vremind')) {
      const name = btn.dataset.vendor;
      vpayReminderVendor = name;
      $('vpayReminderInvLabel').textContent = name;
      const rec = vendorPayments[name];
      $('vpayReminderDateInput').value = (rec && rec.reminder) ? rec.reminder.date : '';
      $('vpayReminderNoteInput').value = (rec && rec.reminder) ? rec.reminder.note : '';
      $('vpayReminderOverlay').classList.remove('hidden');
      $('vpayReminderDateInput').focus();
      return;
    }

    if (header && !btn) {
      const name = header.dataset.vendor;
      vpayExpandedVendor = vpayExpandedVendor === name ? null : name;
      renderVendorPaymentView();
    }
  });

  $('vpayHistoryCloseBtn').addEventListener('click', () => {
    $('vpayHistoryOverlay').classList.add('hidden');
    vpayHistoryOpenVendor = null;
  });

  function closeVpayCreditForm() {
    $('vpayFormOverlay').classList.add('hidden');
    vpayFormVendor = null;
    vpayEditCreditId = null;
    setVpayFormMode(false);
  }

  function openEditVendorCreditForm(vendor, creditId) {
    migrateVendorPaymentCreditIds();
    const rec = vendorPayments[vendor];
    const c = rec && rec.credits && rec.credits.find(x => x.id === creditId);
    if (!c) { alert('Payment entry not found'); return; }
    vpayFormVendor = vendor;
    vpayEditCreditId = creditId;
    setVpayFormMode(true);
    $('vpayFormCompanyLabel').textContent = vendor;
    $('vpayAmtInput').value = String(c.amount);
    $('vpayNoteInput').value = c.note || '';
    $('vpayDateInput').value = isoToDatetimeLocal(c.date);
    $('vpayFormOverlay').classList.remove('hidden');
    $('vpayAmtInput').focus();
  }

  $('vendorPayView').addEventListener('click', e => {
    const pdfBtn = e.target.closest('.btn-vpay-summary-pdf');
    if (pdfBtn && pdfBtn.dataset.vendor) {
      e.stopPropagation();
      e.preventDefault();
      downloadVendorPaymentSummaryPDF(pdfBtn.dataset.vendor).catch(() => alert('Could not generate PDF. Try again.'));
      return;
    }
    const vwaBtn = e.target.closest('.btn-vpay-wa');
    if (vwaBtn && vwaBtn.dataset.vendor) {
      e.stopPropagation();
      e.preventDefault();
      var vn = vwaBtn.dataset.vendor;
      openWhatsappDialog(
        vn + ' \u2014 vendor payment summary',
        function(asBlob) { return asBlob ? downloadVendorPaymentSummaryPDF(vn, true) : downloadVendorPaymentSummaryPDF(vn); },
        vn
      );
      return;
    }
    const vw = e.target.closest('.btn-vpay-view');
    if (vw && vw.dataset.invId && e.target.closest('#vpayHistoryOverlay')) {
      e.stopPropagation();
      viewPoInvoiceFromVendorPayment(vw.dataset.invId);
      $('vpayHistoryOverlay').classList.add('hidden');
      vpayHistoryOpenVendor = null;
      return;
    }
    const ed = e.target.closest('.btn-edit-vcredit');
    if (!ed || !ed.dataset.vendor || !ed.dataset.creditId) return;
    e.stopPropagation();
    openEditVendorCreditForm(ed.dataset.vendor, ed.dataset.creditId);
  });

  $('vpayFormSaveBtn').addEventListener('click', () => {
    const amount = parseFloat($('vpayAmtInput').value);
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    const d = $('vpayDateInput').value;
    if (!d) { alert(vpayEditCreditId ? 'Select payment date and time' : 'Select payment date and time'); return; }
    const dateIso = datetimeLocalToIso(d);
    if (vpayEditCreditId) {
      updateVendorCredit(vpayFormVendor, vpayEditCreditId, amount, $('vpayNoteInput').value.trim(), dateIso);
    } else {
      addVendorCredit(vpayFormVendor, amount, $('vpayNoteInput').value.trim(), dateIso);
    }
    const savedVendor = vpayFormVendor;
    closeVpayCreditForm();
    renderVendorPaymentView();
    if (vpayHistoryOpenVendor === savedVendor) fillVpayHistoryOverlay(savedVendor);
  });

  $('vpayFormDeleteBtn').addEventListener('click', () => {
    if (!vpayEditCreditId || !vpayFormVendor) return;
    if (!confirm('Delete this payment entry? Totals and FIFO allocation will update.')) return;
    const savedVendor = vpayFormVendor;
    deleteVendorCredit(vpayFormVendor, vpayEditCreditId);
    closeVpayCreditForm();
    renderVendorPaymentView();
    if (vpayHistoryOpenVendor === savedVendor) fillVpayHistoryOverlay(savedVendor);
  });

  $('vpayFormCancelBtn').addEventListener('click', () => { closeVpayCreditForm(); });

  $('vpayReminderSaveBtn').addEventListener('click', () => {
    const date = $('vpayReminderDateInput').value;
    if (!date) { alert('Select a reminder date'); return; }
    setVendorReminder(vpayReminderVendor, date, $('vpayReminderNoteInput').value.trim());
    $('vpayReminderOverlay').classList.add('hidden');
    vpayReminderVendor = null;
    renderVendorPaymentView();
  });
  $('vpayReminderCancelBtn').addEventListener('click', () => { $('vpayReminderOverlay').classList.add('hidden'); vpayReminderVendor = null; });

  document.querySelectorAll('#vpayReminderPresets .preset-pill').forEach(btn => {
    btn.addEventListener('click', () => { $('vpayReminderDateInput').value = addDays(+btn.dataset.days); });
  });

  function buildVendorPaymentSummaryPdfHtml(vendorName) {
    const s = getVendorPaymentSnapshot(vendorName);
    const esc = str => escHtml(str);
    const td = 'padding:3px 4px;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;';
    const th = 'padding:3px 4px;font-weight:700;text-align:left;';
    const thR = 'padding:3px 4px;font-weight:700;text-align:right;';
    const thC = 'padding:3px 4px;font-weight:700;text-align:center;';
    const amt = `${td}text-align:right;font-variant-numeric:tabular-nums;font-size:8px;line-height:1.25;`;
    const tbl = 'width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;box-sizing:border-box;border:1px solid #94a3b8;font-size:8px;line-height:1.25;';

    function pdfWhen(isoStr) {
      if (!isoStr) return '—';
      const raw = String(isoStr);
      const d2 = new Date(raw);
      if (Number.isNaN(d2.getTime())) return esc(formatShortDate(raw.split('T')[0]));
      const day = formatShortDate(raw.split('T')[0]);
      let h = d2.getHours();
      const mi = String(d2.getMinutes()).padStart(2, '0');
      const ap = h >= 12 ? 'P' : 'A';
      h = h % 12;
      if (h === 0) h = 12;
      return esc(`${day} ${h}:${mi}${ap}`);
    }

    let runningCred = 0;
    const payRows = s.creditEntries.map((c, i) => {
      runningCred += Number(c.amount) || 0;
      const outAfter = Math.max(0, s.totalAmt - runningCred);
      return `<tr style="border-bottom:1px solid #e2e8f0">
        <td style="${td}text-align:center">${i + 1}</td>
        <td style="${td}font-size:7px;">${pdfWhen(c.date)}</td>
        <td style="${amt}">₹${fmtNum(c.amount)}</td>
        <td style="${td}">${esc(c.note || '—')}</td>
        <td style="${amt}font-weight:600;">₹${fmtNum(outAfter)}</td>
      </tr>`;
    }).join('');

    const pendRows = s.openFifo.length
      ? s.openFifo.map(r => `<tr style="border-bottom:1px solid #e2e8f0">
          <td style="${td}">${esc(r.inv.invoiceNumber)}</td>
          <td style="${td}font-size:7px;">${r.inv.invoiceDate ? esc(formatShortDate(r.inv.invoiceDate)) : '—'}</td>
          <td style="${amt}">₹${fmtNum(r.gross)}</td>
          <td style="${amt}">₹${fmtNum(r.applied)}</td>
          <td style="${amt}font-weight:600;">₹${fmtNum(r.balance)}</td>
          <td style="${td}text-align:center;">${daysSince(r.inv.invoiceDate || r.inv.createdAt)}d</td>
        </tr>`).join('')
      : `<tr><td colspan="6" style="padding:8px;text-align:center;color:#059669">No pending balances — all covered (FIFO).</td></tr>`;

    const allInvRows = s.fifoRows.length
      ? s.fifoRows.map(r => `<tr style="border-bottom:1px solid #e2e8f0;${r.balance <= 0.005 ? 'color:#64748b' : ''}">
        <td style="${td}">${esc(r.inv.invoiceNumber)}</td>
        <td style="${td}font-size:7px;">${r.inv.invoiceDate ? esc(formatShortDate(r.inv.invoiceDate)) : '—'}</td>
        <td style="${amt}">₹${fmtNum(r.gross)}</td>
        <td style="${amt}">₹${fmtNum(r.applied)}</td>
        <td style="${amt}">₹${fmtNum(r.balance)}</td>
        <td style="${td}text-align:center;">${r.balance <= 0.005 ? 'Clr' : 'Due'}</td>
      </tr>`).join('')
      : `<tr><td colspan="6" style="padding:8px;text-align:center">No PO invoices.</td></tr>`;

    return `<div class="pay-pdf-root" style="box-sizing:border-box;width:100%;max-width:100%;padding:8px 6px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.35;">
      <div style="border-bottom:2px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f">${esc(COMPANY.name)}</div>
        <div style="font-size:11px;font-weight:700;margin-top:4px">Vendor payment summary — payable &amp; payments</div>
        <div style="margin-top:6px;font-size:10px"><strong>Vendor:</strong> ${esc(s.companyName)}</div>
        <div style="margin-top:2px;font-size:8px;color:#64748b">Generated: ${esc(s.generatedAt)}</div>
      </div>

      <div style="font-size:10px;font-weight:700;margin:8px 0 4px">Figures at a glance</div>
      <table style="${tbl}margin-bottom:10px">
        <colgroup><col style="width:58%"><col style="width:42%"></colgroup>
        <tr style="background:#f1f5f9"><td style="${td}">PO Invoices billed (no.)</td><td style="${amt}font-weight:700;">${s.invCount}</td></tr>
        <tr><td style="${td}">Total billed</td><td style="${amt}">₹${fmtNum(s.totalAmt)}</td></tr>
        <tr style="background:#f8fafc"><td style="${td}">Payments recorded (no.)</td><td style="${amt}font-weight:700;">${s.payCount}</td></tr>
        <tr><td style="${td}">Total paid</td><td style="${amt}">₹${fmtNum(s.credited)}</td></tr>
        <tr style="background:#fef2f2"><td style="${td}"><strong>Payable</strong></td><td style="${amt}"><strong>₹${fmtNum(s.outstanding)}</strong></td></tr>
        <tr><td style="${td}">PO Invoices with balance due (no.)</td><td style="${amt}font-weight:700;">${s.pendCount}</td></tr>
      </table>
      <p style="margin:0 0 10px;font-size:7px;color:#475569">Payments apply oldest PO invoice date first (FIFO).</p>

      <div style="font-size:10px;font-weight:700;margin:10px 0 4px">Payments (chronological)</div>
      <table style="${tbl}margin-bottom:10px">
        <colgroup><col style="width:5%"><col style="width:20%"><col style="width:17%"><col style="width:30%"><col style="width:28%"></colgroup>
        <thead><tr style="background:#1e3a5f;color:#fff">
          <th style="${thC}font-size:7px;">#</th>
          <th style="${th}font-size:7px;">When</th>
          <th style="${thR}font-size:7px;">Amount</th>
          <th style="${th}font-size:7px;">Note</th>
          <th style="${thR}font-size:7px;">Payable</th>
        </tr></thead>
        <tbody>${s.payCount ? payRows : `<tr><td colspan="5" style="padding:8px;text-align:center">No payments yet.</td></tr>`}</tbody>
      </table>

      <div style="font-size:10px;font-weight:700;margin:10px 0 4px">PO Invoices pending</div>
      <table style="${tbl}margin-bottom:10px">
        <colgroup><col style="width:17%"><col style="width:14%"><col style="width:16%"><col style="width:17%"><col style="width:18%"><col style="width:18%"></colgroup>
        <thead><tr style="background:#1e3a5f;color:#fff">
          <th style="${th}font-size:7px;">PO Inv. no.</th>
          <th style="${th}font-size:7px;">Date</th>
          <th style="${thR}font-size:7px;">Total</th>
          <th style="${thR}font-size:7px;">Paid</th>
          <th style="${thR}font-size:7px;">Balance</th>
          <th style="${thC}font-size:7px;">Days</th>
        </tr></thead>
        <tbody>${pendRows}</tbody>
      </table>

      <div style="font-size:10px;font-weight:700;margin:10px 0 4px">All PO invoices — FIFO allocation</div>
      <table style="${tbl}">
        <colgroup><col style="width:17%"><col style="width:14%"><col style="width:16%"><col style="width:17%"><col style="width:18%"><col style="width:18%"></colgroup>
        <thead><tr style="background:#334155;color:#fff">
          <th style="${th}font-size:7px;">PO Inv. no.</th>
          <th style="${th}font-size:7px;">Date</th>
          <th style="${thR}font-size:7px;">Total</th>
          <th style="${thR}font-size:7px;">Paid</th>
          <th style="${thR}font-size:7px;">Balance</th>
          <th style="${thC}font-size:7px;">St.</th>
        </tr></thead>
        <tbody>${allInvRows}</tbody>
      </table>
    </div>`;
  }

  async function downloadVendorPaymentSummaryPDF(vendorName, returnBlob) {
    if (!vendorName) return;
    const state = saveViewState();
    const paper = $('invoicePaper');
    paper.innerHTML = buildVendorPaymentSummaryPdfHtml(vendorName);
    paper.classList.add('payment-summary-pdf');
    const shield = showPaperForCapture();
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 80));
    const safe = (vendorName || 'vendor').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(0, 48);
    const fname = `vendor-payment-summary-${safe}.pdf`;
    const payPdfOpt = {
      ...PDF_OPT,
      margin: [0.35, 0.42, 0.35, 0.42],
      html2canvas: { ...PDF_OPT.html2canvas, scale: 1.65, scrollX: 0, scrollY: 0 }
    };
    try {
      if (returnBlob) {
        var blob = await html2pdf().set({ ...payPdfOpt, filename: fname }).from(paper).outputPdf('blob');
        return { blob: blob, fname: fname };
      }
      await html2pdf().set({ ...payPdfOpt, filename: fname }).from(paper).save();
    } finally {
      shield.remove();
      restoreViewState(state);
      paper.classList.remove('payment-summary-pdf');
      const tmp = document.getElementById('html2pdf__container');
      if (tmp) tmp.remove();
    }
  }

  function checkVendorReminders() {
    const todayStr = formatDateYMDLocal(new Date());
    const items = [];
    Object.entries(vendorPayments).forEach(([name, rec]) => {
      if (!rec.reminder || rec.reminder.date > todayStr) return;
      const outstanding = Math.max(getVendorInvoiceTotal(name) - (rec.totalCredited || 0), 0);
      if (outstanding > 0) {
        items.push({ title: 'Vendor payment reminder', body: `${name} — Payable ₹${fmtNum(outstanding)}` });
      }
    });
    if (!items.length || !('Notification' in window)) return;
    const notify = () => items.forEach(it => new Notification(it.title, { body: it.body }));
    if (Notification.permission === 'granted') notify();
    else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') notify(); });
  }

  // ══════════════════════════════════════
  // ── Purchase Product List CRUD ──
  // ══════════════════════════════════════
  let purchaseProducts = [];
  let editPprodIdx = -1;

  function savePurchaseProducts() {
    db.savePurchaseProducts(purchaseProducts);
  }

  function renderPurchaseProducts() {
    const tbody = $('pprodBody');
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const query = ($('pprodSearch').value || '').toLowerCase().trim();
    const filtered = purchaseProducts.map((p, i) => ({ p, i })).filter(({ p }) => {
      if (!query) return true;
      return (p.name || '').toLowerCase().includes(query)
        || (p.hsn || '').toLowerCase().includes(query)
        || String(p.rate).includes(query);
    });
    $('pprodEmpty').style.display = filtered.length ? 'none' : 'block';
    $('pprodEmpty').textContent = purchaseProducts.length ? 'No matching purchase products.' : 'No purchase products added yet.';
    $('pprodTable').style.display = filtered.length ? 'table' : 'none';
    filtered.forEach(({ p, i }) => {
      const tr = document.createElement('tr');
      const tdCheck = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'pprod-check';
      cb.dataset.i = i;
      tdCheck.appendChild(cb);
      tr.appendChild(tdCheck);

      const tdName = document.createElement('td');
      tdName.textContent = p.name;
      tr.appendChild(tdName);

      const tdHsn = document.createElement('td');
      tdHsn.textContent = p.hsn;
      tr.appendChild(tdHsn);

      const tdRate = document.createElement('td');
      tdRate.textContent = Number(p.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      tr.appendChild(tdRate);

      const tdAct = document.createElement('td');
      tdAct.className = 'actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit';
      editBtn.dataset.i = i;
      editBtn.textContent = 'Edit';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del';
      delBtn.dataset.i = i;
      delBtn.textContent = 'Delete';
      tdAct.appendChild(editBtn);
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
    if ($('pprodSelectAll')) $('pprodSelectAll').checked = false;
  }

  $('pprodSearch').addEventListener('input', () => renderPurchaseProducts());

  $('pprodSelectAll').addEventListener('change', e => {
    document.querySelectorAll('.pprod-check').forEach(cb => cb.checked = e.target.checked);
  });

  function showPprodForm() {
    $('pprodFormWrap').classList.remove('hidden');
    $('pprodTableWrap').classList.add('hidden');
  }
  function hidePprodForm() {
    $('pprodFormWrap').classList.add('hidden');
    $('pprodTableWrap').classList.remove('hidden');
  }

  function openPprodEdit(i) {
    editPprodIdx = i;
    const p = purchaseProducts[i];
    $('pprodFormTitle').textContent = 'Edit Purchase Product';
    $('pprodName').value = p.name;
    $('pprodHsn').value = p.hsn;
    const pr = Number(p.rate);
    $('pprodRate').value = Number.isFinite(pr) ? String(Math.round(pr * 100) / 100) : '';
    showPprodForm();
  }

  function updatePprodSuggestions() {
    const box = $('pprodSuggestions');
    if (editPprodIdx >= 0) { box.classList.add('hidden'); return; }
    const q = $('pprodName').value.trim().toLowerCase();
    if (!q) { box.classList.add('hidden'); return; }
    const matches = purchaseProducts
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
    if (!matches.length) { box.classList.add('hidden'); return; }
    while (box.firstChild) box.removeChild(box.firstChild);
    matches.forEach(({ p, i }) => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.dataset.i = i;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'suggestion-item-name';
      nameSpan.textContent = p.name;
      const detailSpan = document.createElement('span');
      detailSpan.className = 'suggestion-item-detail';
      detailSpan.textContent = 'HSN: ' + (p.hsn || '—') + '  |  \u20B9' + Number(p.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      div.appendChild(nameSpan);
      div.appendChild(detailSpan);
      box.appendChild(div);
    });
    box.classList.remove('hidden');
  }

  $('pprodName').addEventListener('input', updatePprodSuggestions);
  $('pprodName').addEventListener('focus', updatePprodSuggestions);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#pprodSuggestions') && e.target !== $('pprodName')) {
      $('pprodSuggestions').classList.add('hidden');
    }
  });
  $('pprodSuggestions').addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    openPprodEdit(+item.dataset.i);
    $('pprodSuggestions').classList.add('hidden');
  });

  $('downloadPprodBtn').addEventListener('click', () => {
    if (!purchaseProducts.length) { alert('No purchase products to download'); return; }
    const checked = document.querySelectorAll('.pprod-check:checked');
    const selected = checked.length
      ? Array.from(checked).map(cb => ({ p: purchaseProducts[+cb.dataset.i], i: +cb.dataset.i }))
      : purchaseProducts.map((p, i) => ({ p, i }));
    const header = ['#', 'Product Name', 'HSN Code', 'Rate'];
    const rows = [header];
    selected.forEach(({ p, i }) => {
      rows.push([i + 1, p.name, p.hsn, Number(p.rate).toFixed(2)]);
    });
    downloadCSV(rows, checked.length ? 'purchase-products-selected.csv' : 'purchase-products.csv');
  });

  $('addPprodBtn').addEventListener('click', () => {
    editPprodIdx = -1;
    $('pprodFormTitle').textContent = 'Add Purchase Product';
    $('pprodName').value = '';
    $('pprodHsn').value = '';
    $('pprodRate').value = '';
    $('pprodSuggestions').classList.add('hidden');
    showPprodForm();
  });

  $('cancelPprodBtn').addEventListener('click', () => {
    $('pprodSuggestions').classList.add('hidden');
    hidePprodForm();
  });

  $('savePprodBtn').addEventListener('click', () => {
    const parsedRate = parseRateToStore($('pprodRate').value);
    const obj = {
      name: $('pprodName').value.trim(),
      hsn: $('pprodHsn').value.trim(),
      rate: parsedRate == null ? 0 : parsedRate
    };
    if (!obj.name) { alert('Product Name is required'); return; }
    if (editPprodIdx < 0) {
      const dupIdx = purchaseProducts.findIndex(p => p.name.trim().toLowerCase() === obj.name.toLowerCase());
      if (dupIdx >= 0) {
        if (confirm('A purchase product named "' + purchaseProducts[dupIdx].name + '" already exists. Edit it instead?')) {
          openPprodEdit(dupIdx);
          return;
        }
      }
    }
    if (editPprodIdx >= 0) {
      purchaseProducts[editPprodIdx] = obj;
    } else {
      purchaseProducts.push(obj);
    }
    savePurchaseProducts();
    renderPurchaseProducts();
    hidePprodForm();
  });

  $('pprodBody').addEventListener('click', e => {
    const i = +e.target.dataset.i;
    if (e.target.classList.contains('btn-edit')) {
      openPprodEdit(i);
    }
    if (e.target.classList.contains('btn-del')) {
      if (confirm('Delete this purchase product?')) {
        purchaseProducts.splice(i, 1);
        savePurchaseProducts();
        renderPurchaseProducts();
      }
    }
  });

  $('pprodBackBtn').addEventListener('click', () => {
    if (!$('pprodFormWrap').classList.contains('hidden')) {
      hidePprodForm();
    } else {
      goHome();
    }
  });

  // ══════════════════════════════════════
  // ── Vendor / Supplier List CRUD ──
  // ══════════════════════════════════════
  let vendors = [];
  let editVendIdx = -1;

  function saveVendors() {
    db.saveVendors(vendors);
  }

  function renderVendors() {
    const tbody = $('vendBody');
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const query = ($('vendSearch').value || '').toLowerCase().trim();
    const typeFilter = $('vendTypeFilter') ? $('vendTypeFilter').value : '';
    const filtered = vendors.map((v, i) => ({ v, i })).filter(({ v }) => {
      if (typeFilter) {
        const types = Array.isArray(v.vendorType) ? v.vendorType : (v.vendorType ? [v.vendorType] : []);
        if (!types.includes(typeFilter)) return false;
      }
      if (!query) return true;
      const vTypes = (Array.isArray(v.vendorType) ? v.vendorType : (v.vendorType ? [v.vendorType] : [])).join(' ').toLowerCase();
      return (v.name || '').toLowerCase().includes(query)
        || (v.gstin || '').toLowerCase().includes(query)
        || (v.contact || '').toLowerCase().includes(query)
        || (v.phone || '').toLowerCase().includes(query)
        || vTypes.includes(query);
    });
    $('vendEmpty').style.display = filtered.length ? 'none' : 'block';
    $('vendEmpty').textContent = vendors.length ? 'No matching vendors.' : 'No vendors added yet.';
    $('vendTable').style.display = filtered.length ? 'table' : 'none';
    filtered.forEach(({ v, i }) => {
      const tr = document.createElement('tr');
      const tdCheck = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'vend-check';
      cb.dataset.i = i;
      tdCheck.appendChild(cb);
      tr.appendChild(tdCheck);

      const types = Array.isArray(v.vendorType) ? v.vendorType : (v.vendorType ? [v.vendorType] : []);
      const typeLabel = types.map(t => t === 'material' ? 'Material' : 'Labor').join(', ') || '—';
      const fields = [
        v.name,
        v.gstin,
        typeLabel,
        customerGstTypeLabel(v.gstType),
        v.contact,
        v.phone
      ];
      fields.forEach(text => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });

      const tdAct = document.createElement('td');
      tdAct.className = 'actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit';
      editBtn.dataset.i = i;
      editBtn.textContent = 'Edit';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del';
      delBtn.dataset.i = i;
      delBtn.textContent = 'Delete';
      tdAct.appendChild(editBtn);
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
    if ($('vendSelectAll')) $('vendSelectAll').checked = false;
  }

  $('vendSearch').addEventListener('input', () => renderVendors());
  $('vendTypeFilter').addEventListener('change', () => renderVendors());

  $('vendSelectAll').addEventListener('change', e => {
    document.querySelectorAll('.vend-check').forEach(cb => cb.checked = e.target.checked);
  });

  function showVendForm() {
    $('vendFormWrap').classList.remove('hidden');
    $('vendTableWrap').classList.add('hidden');
  }
  function hideVendForm() {
    $('vendFormWrap').classList.add('hidden');
    $('vendTableWrap').classList.remove('hidden');
  }

  let tempVendConsignees = [];
  let tempVendProducts = [];

  function renderVendProdList() {
    const wrap = $('vendProdList');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    tempVendProducts.forEach((pName, i) => {
      const prod = purchaseProducts.find(p => p.name === pName);
      const div = document.createElement('div');
      div.className = 'consignee-item';
      const info = document.createElement('div');
      info.className = 'consignee-item-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'consignee-item-name';
      nameEl.textContent = pName;
      info.appendChild(nameEl);
      if (prod) {
        const detailEl = document.createElement('div');
        detailEl.className = 'consignee-item-addr';
        detailEl.textContent = 'HSN: ' + (prod.hsn || '—') + '  |  Rate: \u20B9' + Number(prod.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        info.appendChild(detailEl);
      }
      div.appendChild(info);
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del';
      delBtn.dataset.cpi = i;
      delBtn.textContent = 'Remove';
      div.appendChild(delBtn);
      wrap.appendChild(div);
    });
  }

  function resetVendProdForm() {
    $('vendProdNameInput').value = '';
    $('vendProdHsnInput').value = '';
    $('vendProdRateInput').value = '';
    $('vendProdFormRow').classList.add('hidden');
  }

  $('addVendProdBtn').addEventListener('click', () => {
    resetVendProdForm();
    $('vendProdFormRow').classList.remove('hidden');
    $('vendProdNameInput').focus();
  });

  $('cancelVendProdBtn').addEventListener('click', resetVendProdForm);

  $('saveVendProdBtn').addEventListener('click', () => {
    const name = $('vendProdNameInput').value.trim();
    const hsn = $('vendProdHsnInput').value.trim();
    const parsedRate = parseRateToStore($('vendProdRateInput').value);
    const rate = parsedRate == null ? 0 : parsedRate;
    if (!name) { alert('Product Name is required'); return; }

    const existIdx = purchaseProducts.findIndex(p => p.name.trim().toLowerCase() === name.toLowerCase());
    if (existIdx >= 0) {
      purchaseProducts[existIdx].hsn = hsn || purchaseProducts[existIdx].hsn;
      purchaseProducts[existIdx].rate = rate || purchaseProducts[existIdx].rate;
    } else {
      purchaseProducts.push({ name, hsn, rate });
    }
    savePurchaseProducts();
    renderPurchaseProducts();

    const canonical = existIdx >= 0 ? purchaseProducts[existIdx].name : name;
    if (!tempVendProducts.includes(canonical)) {
      tempVendProducts.push(canonical);
      renderVendProdList();
    }
    resetVendProdForm();
  });

  $('vendProdList').addEventListener('click', e => {
    if (e.target.classList.contains('btn-del')) {
      tempVendProducts.splice(+e.target.dataset.cpi, 1);
      renderVendProdList();
    }
  });

  createAutocomplete(
    $('vendProdNameInput'),
    val => purchaseProducts
      .filter(p => !tempVendProducts.includes(p.name) &&
        (p.name.toLowerCase().includes(val) || p.hsn.toLowerCase().includes(val)))
      .map(p => ({ label: escHtml(p.name) + '<small>HSN: ' + escHtml(p.hsn) + ' | \u20B9' + Number(p.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</small>', data: p })),
    p => {
      $('vendProdNameInput').value = p.name;
      $('vendProdHsnInput').value = p.hsn;
      const pr = Number(p.rate);
      $('vendProdRateInput').value = Number.isFinite(pr) ? String(Math.round(pr * 100) / 100) : '';
    }
  );

  document.querySelectorAll('input[name="vendPayMode"]').forEach(r => {
    r.addEventListener('change', () => {
      $('vendBankFields').classList.toggle('hidden', r.value !== 'bank');
      $('vendGpayFields').classList.toggle('hidden', r.value !== 'gpay');
    });
  });

  $('vendBackBtn').addEventListener('click', () => {
    if (!$('vendFormWrap').classList.contains('hidden')) {
      hideVendForm();
    } else {
      goHome();
    }
  });

  $('addVendBtn').addEventListener('click', () => {
    editVendIdx = -1;
    $('vendFormTitle').textContent = 'Add Vendor';
    $('vendName').value = '';
    $('vendGstin').value = '';
    $('vendAddress').value = '';
    $('vendContact').value = '';
    $('vendPhone').value = '';
    document.querySelectorAll('.vendTypeCheck').forEach(cb => cb.checked = false);
    $('vendGstType').value = 'intra';
    $('vendPayBank').checked = true;
    $('vendBankFields').classList.remove('hidden');
    $('vendGpayFields').classList.add('hidden');
    $('vendBankName').value = '';
    $('vendBankBranch').value = '';
    $('vendAccNumber').value = '';
    $('vendIfsc').value = '';
    $('vendGpayNumber').value = '';
    tempVendConsignees = [];
    tempVendProducts = [];
    renderVendProdList();
    $('vendProdFormRow').classList.add('hidden');
    showVendForm();
  });

  $('cancelVendBtn').addEventListener('click', hideVendForm);

  $('saveVendBtn').addEventListener('click', () => {
    const vendorTypes = Array.from(document.querySelectorAll('.vendTypeCheck:checked')).map(cb => cb.value);
    const payMode = document.querySelector('input[name="vendPayMode"]:checked').value;
    const obj = {
      name: $('vendName').value.trim(),
      gstin: $('vendGstin').value.trim(),
      address: $('vendAddress').value.trim(),
      contact: $('vendContact').value.trim(),
      phone: $('vendPhone').value.trim(),
      vendorType: vendorTypes,
      gstType: $('vendGstType').value,
      paymentMode: payMode,
      bankName: $('vendBankName').value.trim(),
      bankBranch: $('vendBankBranch').value.trim(),
      accountNumber: $('vendAccNumber').value.trim(),
      ifscCode: $('vendIfsc').value.trim(),
      gpayNumber: $('vendGpayNumber').value.trim(),
      consignees: tempVendConsignees.map(x => ({ ...x })),
      associatedProducts: [...tempVendProducts]
    };
    if (!obj.name) { alert('Company Name is required'); return; }
    if (!obj.gstin) { alert('GSTIN is required'); return; }
    if (!vendorTypes.length) { alert('Please select at least one Type (Labor / Material)'); return; }
    if (editVendIdx >= 0) {
      vendors[editVendIdx] = obj;
    } else {
      vendors.push(obj);
    }
    saveVendors();
    renderVendors();
    hideVendForm();
  });

  $('vendBody').addEventListener('click', e => {
    const i = +e.target.dataset.i;
    if (e.target.classList.contains('btn-edit')) {
      editVendIdx = i;
      const v = vendors[i];
      $('vendFormTitle').textContent = 'Edit Vendor';
      $('vendName').value = v.name;
      $('vendGstin').value = v.gstin;
      $('vendAddress').value = v.address;
      $('vendContact').value = v.contact;
      $('vendPhone').value = v.phone;
      const types = Array.isArray(v.vendorType) ? v.vendorType : (v.vendorType ? [v.vendorType] : []);
      document.querySelectorAll('.vendTypeCheck').forEach(cb => cb.checked = types.includes(cb.value));
      $('vendGstType').value = v.gstType || 'intra';
      const pm = v.paymentMode || 'bank';
      if (pm === 'gpay') { $('vendPayGpay').checked = true; } else { $('vendPayBank').checked = true; }
      $('vendBankFields').classList.toggle('hidden', pm !== 'bank');
      $('vendGpayFields').classList.toggle('hidden', pm !== 'gpay');
      $('vendBankName').value = v.bankName || '';
      $('vendBankBranch').value = v.bankBranch || '';
      $('vendAccNumber').value = v.accountNumber || '';
      $('vendIfsc').value = v.ifscCode || '';
      $('vendGpayNumber').value = v.gpayNumber || '';
      tempVendConsignees = v.consignees ? v.consignees.map(x => ({ ...x })) : [];
      tempVendProducts = v.associatedProducts ? [...v.associatedProducts] : [];
      renderVendProdList();
      $('vendProdFormRow').classList.add('hidden');
      showVendForm();
    }
    if (e.target.classList.contains('btn-del')) {
      if (confirm('Delete this vendor?')) {
        vendors.splice(i, 1);
        saveVendors();
        renderVendors();
      }
    }
  });

  $('downloadVendBtn').addEventListener('click', () => {
    if (!vendors.length) { alert('No vendors to download'); return; }
    const checked = document.querySelectorAll('.vend-check:checked');
    const selected = checked.length
      ? Array.from(checked).map(cb => ({ v: vendors[+cb.dataset.i], i: +cb.dataset.i }))
      : vendors.map((v, i) => ({ v, i }));
    const header = ['#', 'Company Name', 'GSTIN', 'Type', 'GST Type', 'Contact', 'Phone'];
    const rows = [header];
    selected.forEach(({ v }, idx) => {
      const types = Array.isArray(v.vendorType) ? v.vendorType : (v.vendorType ? [v.vendorType] : []);
      const typeLabel = types.map(t => t === 'material' ? 'Material' : 'Labor').join(', ') || '—';
      rows.push([idx + 1, v.name, v.gstin, typeLabel, customerGstTypeLabel(v.gstType), v.contact, v.phone]);
    });
    downloadCSV(rows, checked.length ? 'vendors-selected.csv' : 'vendors.csv');
  });

  function fillVendFormFromVendor(v) {
    $('vendName').value = v.name;
    $('vendGstin').value = v.gstin;
    $('vendAddress').value = v.address;
    $('vendContact').value = v.contact;
    $('vendPhone').value = v.phone;
    const vt = Array.isArray(v.vendorType) ? v.vendorType : (v.vendorType ? [v.vendorType] : []);
    document.querySelectorAll('.vendTypeCheck').forEach(cb => cb.checked = vt.includes(cb.value));
    $('vendGstType').value = v.gstType === 'inter' ? 'inter' : 'intra';
    const pm = v.paymentMode || 'bank';
    if (pm === 'gpay') { $('vendPayGpay').checked = true; } else { $('vendPayBank').checked = true; }
    $('vendBankFields').classList.toggle('hidden', pm !== 'bank');
    $('vendGpayFields').classList.toggle('hidden', pm !== 'gpay');
    $('vendBankName').value = v.bankName || '';
    $('vendBankBranch').value = v.bankBranch || '';
    $('vendAccNumber').value = v.accountNumber || '';
    $('vendIfsc').value = v.ifscCode || '';
    $('vendGpayNumber').value = v.gpayNumber || '';
    tempVendConsignees = v.consignees ? v.consignees.map(x => ({ ...x })) : [];
    tempVendProducts = v.associatedProducts ? [...v.associatedProducts] : [];
    renderVendProdList();
  }

  createAutocomplete(
    $('vendName'),
    val => vendors
      .filter((v, i) => i !== editVendIdx && v.name.toLowerCase().includes(val))
      .map(v => ({ label: escHtml(v.name) + '<small>' + escHtml(v.gstin) + '</small>', data: v })),
    fillVendFormFromVendor,
    { showOnEmpty: false }
  );

  createAutocomplete(
    $('vendGstin'),
    val => vendors
      .filter((v, i) => i !== editVendIdx && v.gstin.toLowerCase().includes(val))
      .map(v => ({ label: escHtml(v.gstin) + '<small>' + escHtml(v.name) + '</small>', data: v })),
    fillVendFormFromVendor,
    { showOnEmpty: false }
  );

  // ══════════════════════════════════════
  // ── PO Invoice Storage & Logic ──
  // ══════════════════════════════════════
  document.querySelectorAll('input[name="poPayMode"]').forEach(r => {
    r.addEventListener('change', () => {
      $('poBankFields').classList.toggle('hidden', r.value !== 'bank');
      $('poGpayFields').classList.toggle('hidden', r.value !== 'gpay');
    });
  });

  $('poGstType').addEventListener('change', e => {
    if (e.target.value === 'inter') {
      $('poGstRate').value = 18;
    } else {
      $('poGstRate').value = 9;
    }
  });

  let poInvoices = [];
  let editingPoInvoiceId = null;
  let poItems = [{ description: '', hsn: '', packages: 0, qty: null, rate: null }];
  let cameFromPoInvoiceList = false;

  function savePoInvoices() {
    db.savePoInvoices(poInvoices);
  }

  function getNextPoInvoiceNumber() {
    if (!poInvoices.length) return '';
    let maxNum = 0;
    let prefix = '';
    poInvoices.forEach(inv => {
      const m = (inv.invoiceNumber || '').match(/^(.*?)(\d+)$/);
      if (m) {
        const n = parseInt(m[2], 10);
        if (n > maxNum) { maxNum = n; prefix = m[1]; }
      }
    });
    if (!maxNum) return '';
    return prefix + (maxNum + 1);
  }

  function computePoGrandTotal(inv) {
    let subtotal = 0;
    (inv.items || []).forEach(it => {
      const q = Math.round(Number(it.qty) || 0);
      subtotal += q * (Number(it.rate) || 0);
    });
    const rate = inv.gstRate || 0;
    const tax = inv.gstType === 'intra' ? subtotal * rate / 100 * 2 : subtotal * rate / 100;
    return Math.round(subtotal + tax);
  }

  function collectPoInvoiceData() {
    return {
      invoiceNumber: $('poInvoiceNumber').value.trim(),
      invoiceDate: $('poInvoiceDate').value,
      copyTypes: Array.from(document.querySelectorAll('.poCopyType:checked')).map(cb => cb.value),
      billType: Array.from(document.querySelectorAll('.poBillType:checked')).map(cb => cb.value),
      vendorName: $('poVendorName').value.trim(),
      vendorGstin: $('poVendorGstin').value.trim(),
      vendorAddress: $('poVendorAddress').value.trim(),
      poNumber: $('poPoNumber').value.trim(),
      poDate: $('poPoDate').value,
      paymentMode: document.querySelector('input[name="poPayMode"]:checked').value,
      bankName: $('poBankName').value.trim(),
      bankBranch: $('poBankBranch').value.trim(),
      accountNumber: $('poAccountNumber').value.trim(),
      ifscCode: $('poIfscCode').value.trim(),
      gpayNumber: $('poGpayNumber').value.trim(),
      items: poItems.map(it => ({ ...it })),
      transportMode: $('poTransportMode').value.trim(),
      gstRate: parseFloat($('poGstRate').value) || 0,
      gstType: $('poGstType').value,
      reminderDate: $('poInvoiceReminder').value || ''
    };
  }

  function saveCurrentPoInvoice() {
    const data = collectPoInvoiceData();
    if (editingPoInvoiceId) {
      const idx = poInvoices.findIndex(inv => inv.id === editingPoInvoiceId);
      if (idx >= 0) {
        data.id = editingPoInvoiceId;
        data.createdAt = poInvoices[idx].createdAt;
        data.updatedAt = new Date().toISOString();
        poInvoices[idx] = data;
      }
    } else {
      data.id = Date.now().toString();
      data.createdAt = new Date().toISOString();
      poInvoices.push(data);
      editingPoInvoiceId = data.id;
    }
    savePoInvoices();
    return true;
  }

  function loadPoInvoiceIntoForm(inv) {
    editingPoInvoiceId = inv.id;
    $('poInvoiceNumber').value = inv.invoiceNumber || '';
    $('poInvoiceDate').value = inv.invoiceDate || '';
    $('poVendorName').value = inv.vendorName || '';
    let loadedGst = inv.vendorGstin || '';
    if (!loadedGst && inv.vendorName) {
      const match = vendors.find(v => v.name.toLowerCase() === inv.vendorName.trim().toLowerCase());
      if (match) loadedGst = match.gstin || '';
    }
    $('poVendorGstin').value = loadedGst;
    $('poVendorAddress').value = inv.vendorAddress || '';
    $('poPoNumber').value = inv.poNumber || '';
    $('poPoDate').value = inv.poDate || '';
    const ppm = inv.paymentMode || 'bank';
    if (ppm === 'gpay') { $('poPayGpay').checked = true; } else { $('poPayBank').checked = true; }
    $('poBankFields').classList.toggle('hidden', ppm !== 'bank');
    $('poGpayFields').classList.toggle('hidden', ppm !== 'gpay');
    $('poBankName').value = inv.bankName || '';
    $('poBankBranch').value = inv.bankBranch || '';
    $('poAccountNumber').value = inv.accountNumber || '';
    $('poIfscCode').value = inv.ifscCode || '';
    $('poGpayNumber').value = inv.gpayNumber || '';
    $('poTransportMode').value = inv.transportMode || '';
    $('poGstRate').value = inv.gstRate || 0;
    $('poGstType').value = inv.gstType || 'intra';
    $('poInvoiceReminder').value = inv.reminderDate || '';

    poItems = (inv.items && inv.items.length)
      ? inv.items.map(it => {
          const row = { ...it };
          if (row.qty != null && row.qty !== '') {
            const n = Math.round(Number(row.qty));
            row.qty = Number.isFinite(n) ? n : null;
          }
          const pk = Math.round(Number(row.packages));
          row.packages = Number.isFinite(pk) && pk >= 0 ? pk : 0;
          if (row.rate != null && row.rate !== '') {
            const r = Math.round(Number(row.rate) * 100) / 100;
            row.rate = Number.isFinite(r) && r >= 0 ? r : null;
          }
          return row;
        })
      : [{ description: '', hsn: '', packages: 0, qty: null, rate: null }];
    renderPoItems();

    if (inv.copyTypes && inv.copyTypes.length) {
      document.querySelectorAll('.poCopyType').forEach(cb => {
        cb.checked = inv.copyTypes.includes(cb.value);
      });
    }
    const bt = inv.billType || [];
    document.querySelectorAll('.poBillType').forEach(cb => {
      cb.checked = bt.includes(cb.value);
    });
  }

  function resetPoInvoiceForm() {
    editingPoInvoiceId = null;
    cameFromPoInvoiceList = false;
    $('poInvoiceNumber').value = getNextPoInvoiceNumber();
    $('poInvoiceDate').value = formatDateYMDLocal(new Date());
    $('poVendorName').value = '';
    $('poVendorGstin').value = '';
    $('poVendorAddress').value = '';
    $('poPoNumber').value = '';
    $('poPoDate').value = '';
    $('poPayBank').checked = true;
    $('poBankFields').classList.remove('hidden');
    $('poGpayFields').classList.add('hidden');
    $('poBankName').value = '';
    $('poBankBranch').value = '';
    $('poAccountNumber').value = '';
    $('poIfscCode').value = '';
    $('poGpayNumber').value = '';
    $('poTransportMode').value = 'By Road';
    $('poGstRate').value = 9;
    $('poGstType').value = 'intra';
    const rem30 = new Date();
    rem30.setDate(rem30.getDate() + 30);
    $('poInvoiceReminder').value = formatDateYMDLocal(rem30);
    poItems = [{ description: '', hsn: '', packages: 0, qty: null, rate: null }];
    renderPoItems();
    document.querySelectorAll('.poCopyType').forEach(cb => {
      cb.checked = cb.value === 'ORIGINAL FOR BUYER';
    });
    document.querySelectorAll('.poBillType').forEach(cb => { cb.checked = false; });
    $('poFormPanel').classList.remove('hidden');
    $('poPreviewPanel').classList.add('hidden');
  }

  // ── PO Invoice Items ──
  function renderPoItems() {
    const tbody = $('poItemsBody');
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    poItems.forEach((item, i) => {
      const tr = document.createElement('tr');

      const descTd = document.createElement('td');
      const descInp = document.createElement('input');
      descInp.type = 'text';
      descInp.value = item.description || '';
      descInp.dataset.i = i;
      descInp.dataset.f = 'po-description';
      descInp.autocomplete = 'off';
      descInp.addEventListener('input', () => { poItems[i].description = descInp.value; });
      descTd.appendChild(descInp);
      tr.appendChild(descTd);

      const hsnTd = document.createElement('td');
      const hsnInp = document.createElement('input');
      hsnInp.type = 'text';
      hsnInp.value = item.hsn || '';
      hsnInp.dataset.i = i;
      hsnInp.dataset.f = 'po-hsn';
      hsnInp.autocomplete = 'off';
      hsnInp.addEventListener('input', () => { poItems[i].hsn = hsnInp.value; });
      hsnTd.appendChild(hsnInp);
      tr.appendChild(hsnTd);

      const pkgTd = document.createElement('td');
      const pkgInp = document.createElement('input');
      pkgInp.type = 'number';
      pkgInp.value = item.packages || 0;
      pkgInp.min = '0';
      pkgInp.addEventListener('input', () => {
        poItems[i].packages = parseInt(pkgInp.value) || 0;
      });
      pkgTd.appendChild(pkgInp);
      tr.appendChild(pkgTd);

      const qtyTd = document.createElement('td');
      const qtyInp = document.createElement('input');
      qtyInp.type = 'number';
      qtyInp.className = 'inv-qty-input';
      qtyInp.value = item.qty != null ? item.qty : '';
      qtyInp.addEventListener('input', () => {
        const v = qtyInp.value.trim();
        poItems[i].qty = v === '' ? null : Math.round(Number(v));
        updatePoAmount(i);
      });
      qtyTd.appendChild(qtyInp);
      tr.appendChild(qtyTd);

      const rateTd = document.createElement('td');
      const rateInp = document.createElement('input');
      rateInp.type = 'text';
      rateInp.className = 'inv-rate-input';
      rateInp.inputMode = 'decimal';
      rateInp.autocomplete = 'off';
      rateInp.value = item.rate != null ? String(Math.round(item.rate * 100) / 100) : '';
      rateInp.addEventListener('input', () => {
        const parsed = parseRateToStore(rateInp.value);
        poItems[i].rate = parsed;
        updatePoAmount(i);
      });
      rateTd.appendChild(rateInp);
      tr.appendChild(rateTd);

      const amtTd = document.createElement('td');
      const q = Math.round(Number(item.qty) || 0);
      const r = Number(item.rate) || 0;
      amtTd.className = 'amount-display';
      amtTd.textContent = fmtNum(q * r);
      amtTd.dataset.amtIdx = i;
      tr.appendChild(amtTd);

      const delTd = document.createElement('td');
      if (poItems.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete';
        delBtn.textContent = '\u00D7';
        delBtn.addEventListener('click', () => {
          poItems.splice(i, 1);
          renderPoItems();
        });
        delTd.appendChild(delBtn);
      }
      tr.appendChild(delTd);

      tbody.appendChild(tr);
    });
  }

  function updatePoAmount(i) {
    const el = $('poItemsBody').querySelector('[data-amt-idx="' + i + '"]');
    if (el) {
      const q = Math.round(Number(poItems[i].qty) || 0);
      const r = Number(poItems[i].rate) || 0;
      el.textContent = fmtNum(q * r);
    }
  }

  $('poAddItemBtn').addEventListener('click', () => {
    poItems.push({ description: '', hsn: '', packages: 0, qty: null, rate: null });
    renderPoItems();
    const rows = $('poItemsBody').querySelectorAll('tr');
    rows[rows.length - 1].querySelector('input').focus();
  });

  renderPoItems();


  // ── PO Invoice: Vendor Autocomplete ──
  createAutocomplete(
    $('poVendorName'),
    val => vendors
      .filter(v => v.name.toLowerCase().includes(val))
      .map(v => ({ label: escHtml(v.name) + '<small>' + escHtml(v.gstin) + '</small>', data: v })),
    v => {
      $('poVendorName').value = v.name;
      $('poVendorGstin').value = v.gstin;
      $('poVendorAddress').value = v.address;
      $('poPoNumber').value = v.poNumber || '';
      $('poPoDate').value = v.poDate || '';
      const vendTypes = Array.isArray(v.vendorType) ? v.vendorType : (v.vendorType ? [v.vendorType] : []);
      document.querySelectorAll('.poBillType').forEach(cb => cb.checked = vendTypes.includes(cb.value));
      $('poGstType').value = v.gstType === 'inter' ? 'inter' : 'intra';
      $('poGstType').dispatchEvent(new Event('change'));
      const vpm = v.paymentMode || 'bank';
      if (vpm === 'gpay') { $('poPayGpay').checked = true; } else { $('poPayBank').checked = true; }
      $('poBankFields').classList.toggle('hidden', vpm !== 'bank');
      $('poGpayFields').classList.toggle('hidden', vpm !== 'gpay');
      $('poBankName').value = v.bankName || '';
      $('poBankBranch').value = v.bankBranch || '';
      $('poAccountNumber').value = v.accountNumber || '';
      $('poIfscCode').value = v.ifscCode || '';
      $('poGpayNumber').value = v.gpayNumber || '';
    }
  );

  // ── PO Invoice: Product Autocomplete on Items ──
  function getPoAssociatedProductNames() {
    const vendorName = $('poVendorName').value.trim().toLowerCase();
    const vendor = vendors.find(v => v.name.toLowerCase() === vendorName);
    return (vendor && vendor.associatedProducts) ? vendor.associatedProducts : [];
  }

  function matchPoProducts(val) {
    const assocNames = getPoAssociatedProductNames();
    const matched = purchaseProducts
      .filter(p => p.name.toLowerCase().includes(val) || p.hsn.toLowerCase().includes(val));
    const assoc = matched.filter(p => assocNames.includes(p.name));
    const rest = matched.filter(p => !assocNames.includes(p.name));
    return [...assoc, ...rest]
      .map(p => {
        const isAssoc = assocNames.includes(p.name);
        return { label: escHtml(p.name) + '<small>' + (isAssoc ? '\u2605 ' : '') + 'HSN: ' + escHtml(p.hsn) + '</small>', data: p };
      });
  }

  function fillPoProduct(inp, p) {
    const i = +inp.dataset.i;
    poItems[i].description = p.name;
    poItems[i].hsn = p.hsn;
    poItems[i].rate = p.rate;
    renderPoItems();
  }

  $('poItemsBody').addEventListener('focusin', e => {
    const inp = e.target;
    if ((inp.dataset.f === 'po-description' || inp.dataset.f === 'po-hsn') && !inp.dataset.acInit) {
      inp.dataset.acInit = '1';
      createAutocomplete(inp, matchPoProducts, p => fillPoProduct(inp, p));
      inp.focus();
    }
  });

  // ── PO Reminder presets ──
  $('poInvReminderPresets').addEventListener('click', e => {
    const btn = e.target.closest('.preset-pill');
    if (!btn) return;
    const days = +btn.dataset.days;
    const base = $('poInvoiceDate').value ? new Date($('poInvoiceDate').value + 'T00:00:00') : new Date();
    base.setDate(base.getDate() + days);
    $('poInvoiceReminder').value = formatDateYMDLocal(base);
  });

  // ── PO Invoice Preview ──
  $('poPreviewBtn').addEventListener('click', () => {
    const invNo = $('poInvoiceNumber').value.trim();
    const vendor = $('poVendorName').value.trim();
    if (!invNo) { alert('PO Invoice No. is required'); $('poInvoiceNumber').focus(); return; }
    if (!vendor) { alert('Vendor Company Name is required'); $('poVendorName').focus(); return; }

    syncPoCopyChecks('poCopyType', 'poCopyTypePreview');
    if (!saveCurrentPoInvoice()) return;
    buildAllPoInvoices();
    $('poFormPanel').classList.add('hidden');
    $('poPreviewPanel').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('poEditBtn').addEventListener('click', () => {
    $('poPreviewPanel').classList.add('hidden');
    $('poFormPanel').classList.remove('hidden');
  });

  function syncPoCopyChecks(fromCls, toCls) {
    const selected = Array.from(document.querySelectorAll('.' + fromCls + ':checked')).map(cb => cb.value);
    document.querySelectorAll('.' + toCls).forEach(cb => {
      cb.checked = selected.includes(cb.value);
    });
  }

  document.querySelectorAll('.poCopyType').forEach(cb => {
    cb.addEventListener('change', () => syncPoCopyChecks('poCopyType', 'poCopyTypePreview'));
  });
  document.querySelectorAll('.poCopyTypePreview').forEach(cb => {
    cb.addEventListener('change', () => {
      syncPoCopyChecks('poCopyTypePreview', 'poCopyType');
      buildAllPoInvoices();
    });
  });

  function buildAllPoInvoices() {
    const types = Array.from(document.querySelectorAll('.poCopyType:checked')).map(cb => cb.value);
    if (!types.length) types.push('');
    const paper = $('poInvoicePaper');
    paper.textContent = '';
    types.forEach((t, idx) => {
      if (idx > 0) {
        const sep = document.createElement('div');
        sep.className = 'copy-separator';
        paper.appendChild(sep);
      }
      const wrapper = document.createElement('div');
      wrapper.insertAdjacentHTML('afterbegin', buildPoInvoice(t));
      while (wrapper.firstChild) paper.appendChild(wrapper.firstChild);
    });
  }

  function buildPoInvoice(copyType) {
    const gstRate = parseFloat($('poGstRate').value) || 0;
    const gstType = $('poGstType').value;
    const invoiceDate = $('poInvoiceDate').value;
    const shortDate = invoiceDate ? formatShortDate(invoiceDate) : '';
    const poDate = $('poPoDate').value ? formatShortDate($('poPoDate').value) : '';

    let subtotal = 0;
    const itemRows = poItems.map((item, i) => {
      const q = Math.round(Number(item.qty) || 0);
      const r = Number(item.rate) || 0;
      const amt = q * r;
      subtotal += amt;
      return '<tr>'
        + '<td class="c">' + (i + 1) + '</td>'
        + '<td class="l">' + (esc(item.description).toUpperCase() || '\u2014') + '</td>'
        + '<td class="c">' + esc(item.hsn) + '</td>'
        + '<td class="c">' + formatBags(item.packages) + '</td>'
        + '<td class="c">' + q + '</td>'
        + '<td class="c">' + fmtNum(item.rate) + '</td>'
        + '<td class="r">' + fmtNum(amt) + '</td>'
        + '</tr>';
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
    const grandTotal = Math.round(subtotal + totalTax);
    const wordsStr = numberToWords(grandTotal);

    const taxRows = gstType === 'intra'
      ? '<tr><td class="r" colspan="2">CGST @ ' + gstRate + '%</td><td class="r">' + fmtNum(cgstAmt) + '</td></tr>'
        + '<tr><td class="r" colspan="2">SGST @ ' + gstRate + '%</td><td class="r">' + fmtNum(sgstAmt) + '</td></tr>'
      : '<tr><td class="r" colspan="2">IGST @ ' + gstRate + '%</td><td class="r">' + fmtNum(igstAmt) + '</td></tr>';

    const payModeVal = document.querySelector('input[name="poPayMode"]:checked').value;
    const paymentRows = payModeVal === 'gpay'
      ? '<tr><td class="inv-flbl">GPay Number</td><td>' + esc($('poGpayNumber').value) + '</td></tr>'
      : '<tr><td class="inv-flbl">Bank Name</td><td>' + esc($('poBankName').value) + '</td></tr>'
        + '<tr><td class="inv-flbl">Branch</td><td>' + esc($('poBankBranch').value) + '</td></tr>'
        + '<tr><td class="inv-flbl">A/C No.</td><td>' + esc($('poAccountNumber').value) + '</td></tr>'
        + '<tr><td class="inv-flbl">IFSC Code</td><td>' + esc($('poIfscCode').value) + '</td></tr>';

    let vendGst = $('poVendorGstin').value.trim();
    if (!vendGst) {
      const vn = $('poVendorName').value.trim().toLowerCase();
      const match = vendors.find(v => v.name.toLowerCase() === vn);
      if (match) vendGst = match.gstin || '';
    }

    return '<div class="inv">'
      + '<div class="inv-hdr">'
      + '<div class="inv-hdr-name">' + esc($('poVendorName').value) + '</div>'
      + '<div class="inv-hdr-addr">' + esc($('poVendorAddress').value) + '</div>'
      + '</div>'
      + '<div class="inv-gstin-row"><span><b>GSTIN:</b> ' + esc(vendGst) + '</span><span>' + (copyType || '') + '</span></div>'
      + '<table class="inv-tbl"><tr>'
      + '<td class="inv-buyer-cell" style="width:50%">'
      + '<div class="inv-lbl">Buyer</div>'
      + '<div class="inv-buyer-name">' + COMPANY.name + '</div>'
      + '<div class="inv-buyer-addr">' + COMPANY.address.replace(/\n/g, ', ') + '</div>'
      + '<div style="margin-top:4px"><b>GSTIN:</b> ' + COMPANY.gstin + '</div>'
      + '</td>'
      + '<td style="width:50%;vertical-align:top;padding:0">'
      + '<table class="inv-tbl" style="border:none"><tr><td colspan="2" class="inv-tax-title c bld" style="border-top:none">PURCHASE ORDER INVOICE</td></tr>'
      + '<tr><td class="inv-flbl" style="width:40%">Invoice No.</td><td class="inv-meta-val">' + esc($('poInvoiceNumber').value) + '</td></tr>'
      + '<tr><td class="inv-flbl">Date</td><td class="inv-meta-val">' + shortDate + '</td></tr>'
      + '<tr><td class="inv-flbl">P.Order No.</td><td>' + esc($('poPoNumber').value) + '</td></tr>'
      + '<tr><td class="inv-flbl">P.O. Date</td><td>' + poDate + '</td></tr>'
      + '<tr><td class="inv-flbl">Mode of Transport</td><td>' + esc($('poTransportMode').value) + '</td></tr>'
      + paymentRows
      + '</table></td></tr></table>'
      + '<table class="inv-tbl inv-items">'
      + '<thead><tr><th style="width:6%">S.No</th><th style="width:28%">Description of Goods</th><th style="width:12%">HSN Code</th><th style="width:10%">No. of Bags</th><th style="width:10%">Quantity</th><th style="width:12%">Rate</th><th style="width:14%">Amount (\u20B9)</th></tr></thead>'
      + '<tbody>' + itemRows + '</tbody>'
      + '</table>'
      + '<table class="inv-totals-tbl">'
      + '<tr><td class="r" colspan="2" style="width:78%"><b>Sub Total</b></td><td class="r" style="width:22%">' + fmtNum(subtotal) + '</td></tr>'
      + taxRows
      + '<tr><td class="r" colspan="2"><b>Grand Total</b></td><td class="r"><b>\u20B9' + fmtNum(grandTotal) + '</b></td></tr>'
      + '<tr><td colspan="3" style="font-size:10px"><b>Amount in Words:</b> ' + wordsStr + ' Rupees Only</td></tr>'
      + '</table>'
      + '</div>';
  }

  // ── PO Invoice Navigation ──
  $('poInvBackBtn').addEventListener('click', () => {
    $('poPreviewPanel').classList.add('hidden');
    $('poFormPanel').classList.remove('hidden');
    if (cameFromVendorPayment) {
      cameFromVendorPayment = false;
      showView('vendorPayView');
      renderVendorPaymentView();
    } else if (cameFromPoInvoiceList) {
      cameFromPoInvoiceList = false;
      showView('poInvoiceListView');
      renderPoInvoiceList();
    } else {
      goHome();
    }
  });

  // ── PO Invoice PDF ──
  $('poDownloadBtn').addEventListener('click', () => {
    const element = $('poInvoicePaper');
    element.style.overflow = 'visible';
    window.scrollTo(0, 0);
    const invNum = $('poInvoiceNumber').value || 'po-invoice';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        html2pdf().set({ ...PDF_OPT, filename: invNum + '.pdf' }).from(element).save().then(() => {
          element.style.overflow = '';
        });
      });
    });
  });

  $('poPrintBtn').addEventListener('click', () => window.print());

  // ══════════════════════════════════════
  // ── All PO Invoices List ──
  // ══════════════════════════════════════

  function renderPoInvoiceList() {
    const tbody = $('poInvListBody');
    const query = ($('poInvSearch').value || '').trim().toLowerCase();
    const from = $('poInvDateFrom').value;
    const to = $('poInvDateTo').value;
    const typeFilter = $('poInvTypeFilter') ? $('poInvTypeFilter').value : '';

    const filtered = poInvoices.filter(inv => {
      if (query) {
        const productInfo = (inv.items || []).map(it => (it.description || '') + ' ' + (it.hsn || '')).join(' ');
        const typeInfo = (Array.isArray(inv.billType) ? inv.billType : []).join(' ');
        const haystack = [inv.invoiceNumber, inv.vendorName, productInfo, typeInfo].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (typeFilter) {
        const types = Array.isArray(inv.billType) ? inv.billType : [];
        if (!types.includes(typeFilter)) return false;
      }
      if (from && inv.invoiceDate < from) return false;
      if (to && inv.invoiceDate > to) return false;
      return true;
    });

    const sortAsc = ($('poInvSortOrder').value === 'asc');
    filtered.sort((a, b) => {
      const da = a.invoiceDate || a.createdAt || '';
      const dab = b.invoiceDate || b.createdAt || '';
      const dateCmp = da.localeCompare(dab);
      if (dateCmp !== 0) return sortAsc ? dateCmp : -dateCmp;
      return 0;
    });

    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    $('poInvListEmpty').style.display = filtered.length ? 'none' : 'block';
    $('poInvListTable').style.display = filtered.length ? 'table' : 'none';

    filtered.forEach(inv => {
      const tr = document.createElement('tr');
      const total = computePoGrandTotal(inv);

      const tdCheck = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'po-inv-check';
      cb.dataset.invId = inv.id;
      tdCheck.appendChild(cb);
      tr.appendChild(tdCheck);

      const tdNo = document.createElement('td');
      tdNo.textContent = inv.invoiceNumber || '';
      tr.appendChild(tdNo);

      const tdDate = document.createElement('td');
      tdDate.textContent = inv.invoiceDate ? formatShortDate(inv.invoiceDate) : '';
      tr.appendChild(tdDate);

      const tdVendor = document.createElement('td');
      tdVendor.textContent = inv.vendorName || '';
      tr.appendChild(tdVendor);

      const tdType = document.createElement('td');
      const bt = Array.isArray(inv.billType) ? inv.billType : [];
      tdType.textContent = bt.length ? bt.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') : '—';
      tr.appendChild(tdType);

      const tdTotal = document.createElement('td');
      tdTotal.className = 'r';
      tdTotal.textContent = '\u20B9' + fmtNum(total);
      tr.appendChild(tdTotal);

      const tdAct = document.createElement('td');
      tdAct.className = 'actions';
      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn-view';
      viewBtn.dataset.invId = inv.id;
      viewBtn.textContent = 'View';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit';
      editBtn.dataset.invId = inv.id;
      editBtn.textContent = 'Edit';
      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'btn-download';
      pdfBtn.dataset.invId = inv.id;
      pdfBtn.textContent = 'PDF';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del';
      delBtn.dataset.invId = inv.id;
      delBtn.textContent = 'Delete';
      tdAct.appendChild(viewBtn);
      tdAct.appendChild(editBtn);
      tdAct.appendChild(pdfBtn);
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
    if ($('poInvSelectAll')) $('poInvSelectAll').checked = false;

    const sum = filtered.reduce((s, inv) => s + computePoGrandTotal(inv), 0);
    $('poInvTotalSummaryValue').textContent = '\u20B9' + fmtNum(sum);
    $('poInvTotalSummaryPeriod').textContent = getPoInvoiceListSummaryPeriodLabel();
    $('poInvTotalSummaryCount').textContent = filtered.length + ' PO invoice' + (filtered.length !== 1 ? 's' : '');
  }

  $('poInvSearch').addEventListener('input', renderPoInvoiceList);
  $('poInvTypeFilter').addEventListener('change', renderPoInvoiceList);
  $('poInvDateFrom').addEventListener('change', onPoInvListDateRangeChange);
  $('poInvDateTo').addEventListener('change', onPoInvListDateRangeChange);
  $('poInvSortOrder').addEventListener('change', renderPoInvoiceList);

  $('poInvListBackBtn').addEventListener('click', goHome);

  $('poInvSelectAll').addEventListener('change', e => {
    document.querySelectorAll('.po-inv-check').forEach(cb => cb.checked = e.target.checked);
  });

  // ── PO Invoice List: presets, period labels, downloads ──
  let poActivePreset = null;

  function getPoInvoiceListSummaryPeriodLabel() {
    const presetLabels = {
      poPresetToday: 'Today', poPresetYesterday: 'Yesterday',
      poPresetThisWeek: 'This week', poPresetLastWeek: 'Last week',
      poPresetThisMonth: 'This month', poPresetLastMonth: 'Last month',
      poPresetThisYear: 'This year', poPresetLastYear: 'Last year',
      poPresetCustom: 'Custom date range'
    };
    if (poActivePreset && presetLabels[poActivePreset]) return presetLabels[poActivePreset];
    const from = $('poInvDateFrom').value;
    const to = $('poInvDateTo').value;
    if (from && to) return `${formatShortDate(from)} – ${formatShortDate(to)}`;
    if (from) return `From ${formatShortDate(from)}`;
    if (to) return `Until ${formatShortDate(to)}`;
    return 'All dates';
  }

  function clearPoPresetHighlightOnly() {
    document.querySelectorAll('#poInvoiceListView .preset-btn').forEach(b => b.classList.remove('active'));
    poActivePreset = null;
    const from = $('poInvDateFrom').value;
    const to = $('poInvDateTo').value;
    if ($('poPresetClear')) $('poPresetClear').style.display = (from || to) ? 'inline-flex' : 'none';
    if ($('poDownloadFilteredBtn')) $('poDownloadFilteredBtn').style.display = (from && to) ? 'inline-flex' : 'none';
  }

  function clearPoPresetActive() {
    document.querySelectorAll('#poInvoiceListView .preset-btn').forEach(b => b.classList.remove('active'));
    poActivePreset = null;
    $('poPresetClear').style.display = 'none';
    $('poDownloadFilteredBtn').style.display = 'none';
  }

  function onPoInvListDateRangeChange() {
    clearPoPresetHighlightOnly();
    renderPoInvoiceList();
  }

  function applyPoPresetFilter(range, btnId) {
    if (poActivePreset === btnId) {
      clearPoPresetActive();
      $('poInvDateFrom').value = '';
      $('poInvDateTo').value = '';
      renderPoInvoiceList();
      return;
    }
    clearPoPresetActive();
    poActivePreset = btnId;
    $(btnId).classList.add('active');
    $('poInvDateFrom').value = range.from;
    $('poInvDateTo').value = range.to;
    renderPoInvoiceList();
    $('poPresetClear').style.display = 'inline-flex';
    $('poDownloadFilteredBtn').style.display = 'inline-flex';
  }

  $('poPresetToday').addEventListener('click', () => applyPoPresetFilter(getDayRange(0), 'poPresetToday'));
  $('poPresetYesterday').addEventListener('click', () => applyPoPresetFilter(getDayRange(-1), 'poPresetYesterday'));
  $('poPresetThisWeek').addEventListener('click', () => applyPoPresetFilter(getWeekRange(0), 'poPresetThisWeek'));
  $('poPresetLastWeek').addEventListener('click', () => applyPoPresetFilter(getWeekRange(-1), 'poPresetLastWeek'));
  $('poPresetThisMonth').addEventListener('click', () => applyPoPresetFilter(getMonthRange(0), 'poPresetThisMonth'));
  $('poPresetLastMonth').addEventListener('click', () => applyPoPresetFilter(getMonthRange(-1), 'poPresetLastMonth'));
  $('poPresetThisYear').addEventListener('click', () => applyPoPresetFilter(getYearRange(0), 'poPresetThisYear'));
  $('poPresetLastYear').addEventListener('click', () => applyPoPresetFilter(getYearRange(-1), 'poPresetLastYear'));

  $('poPresetClear').addEventListener('click', () => {
    clearPoPresetActive();
    $('poInvDateFrom').value = '';
    $('poInvDateTo').value = '';
    renderPoInvoiceList();
  });

  $('poPresetCustom').addEventListener('click', () => {
    $('customFrom').value = $('poInvDateFrom').value || '';
    $('customTo').value = $('poInvDateTo').value || '';
    updateCustomCount();
    $('customRangeOverlay').classList.remove('hidden');
    poCustomRangeOpen = true;
  });

  function getFilteredPoInvoices() {
    const from = $('poInvDateFrom').value;
    const to = $('poInvDateTo').value;
    const typeFilter = $('poInvTypeFilter') ? $('poInvTypeFilter').value : '';
    let result = (!from || !to)
      ? poInvoices.slice()
      : poInvoices.filter(inv => inv.invoiceDate && inv.invoiceDate >= from && inv.invoiceDate <= to);
    if (typeFilter) {
      result = result.filter(inv => {
        const types = Array.isArray(inv.billType) ? inv.billType : [];
        return types.includes(typeFilter);
      });
    }
    const sortAsc = ($('poInvSortOrder').value === 'asc');
    return result.sort((a, b) => {
      const da = a.invoiceDate || a.createdAt || '';
      const db = b.invoiceDate || b.createdAt || '';
      return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
    });
  }

  $('poDownloadFilteredBtn').addEventListener('click', () => {
    const filtered = getFilteredPoInvoices();
    if (!filtered.length) { alert('No PO invoices in the current filter'); return; }
    const from = $('poInvDateFrom').value;
    const to = $('poInvDateTo').value;
    downloadBulkPoPDF(filtered, `po-invoices-${from}-to-${to}.pdf`);
  });

  $('poBulkDownloadBtn').addEventListener('click', () => {
    const checked = Array.from(document.querySelectorAll('.po-inv-check:checked')).map(cb => cb.dataset.invId);
    if (!checked.length) { alert('Select at least one PO invoice'); return; }
    const selected = poInvoices.filter(inv => checked.includes(inv.id));
    downloadBulkPoPDF(selected, 'po-invoices-selected.pdf');
  });

  async function downloadBulkPoPDF(list, filename) {
    if (!list.length) return;
    const state = saveViewState();
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('homePanel').classList.add('hidden');
    $('poInvoiceView').classList.remove('hidden');
    $('poFormPanel').classList.add('hidden');
    $('poPreviewPanel').classList.remove('hidden');
    const paper = $('poInvoicePaper');
    const worker = html2pdf().set({ ...PDF_OPT, filename });
    for (let i = 0; i < list.length; i++) {
      loadPoInvoiceIntoForm(list[i]);
      syncPoCopyChecks('poCopyType', 'poCopyTypePreview');
      buildAllPoInvoices();
      paper.style.overflow = 'visible';
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (i === 0) worker.from(paper);
      else worker.from(paper).toContainer().toCanvas().toPdf();
      if (i < list.length - 1) worker.get('pdf').then(pdf => pdf.addPage());
    }
    await worker.save();
    paper.style.overflow = '';
    restoreViewState(state);
  }

  // ── PO Invoice Graph (reuse existing graph overlay) ──
  let poGraphMode = false;
  $('poOpenGraphBtn').addEventListener('click', () => {
    poGraphMode = true;
    populateChartYear();
    populateChartMonth();
    updateGraphFilters();
    $('graphOverlay').classList.remove('hidden');
    renderGraph();
  });


  $('poInvListBody').addEventListener('click', e => {
    const btn = e.target;
    const invId = btn.dataset.invId;
    if (!invId) return;
    const inv = poInvoices.find(x => x.id === invId);
    if (!inv) return;

    if (btn.classList.contains('btn-view')) {
      cameFromPoInvoiceList = true;
      loadPoInvoiceIntoForm(inv);
      showView('poInvoiceView');
      syncPoCopyChecks('poCopyType', 'poCopyTypePreview');
      buildAllPoInvoices();
      $('poFormPanel').classList.add('hidden');
      $('poPreviewPanel').classList.remove('hidden');
    }
    if (btn.classList.contains('btn-edit')) {
      cameFromPoInvoiceList = true;
      loadPoInvoiceIntoForm(inv);
      showView('poInvoiceView');
      $('poFormPanel').classList.remove('hidden');
      $('poPreviewPanel').classList.add('hidden');
    }
    if (btn.classList.contains('btn-download')) {
      downloadPoInvoicePDF(inv);
    }
    if (btn.classList.contains('btn-del')) {
      if (confirm('Delete PO Invoice ' + (inv.invoiceNumber || '') + '?')) {
        poInvoices = poInvoices.filter(x => x.id !== invId);
        savePoInvoices();
        renderPoInvoiceList();
      }
    }
  });

  async function downloadPoInvoicePDF(inv) {
    const state = saveViewState();

    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('homePanel').classList.add('hidden');
    $('poInvoiceView').classList.remove('hidden');
    $('poFormPanel').classList.add('hidden');
    $('poPreviewPanel').classList.remove('hidden');

    loadPoInvoiceIntoForm(inv);
    syncPoCopyChecks('poCopyType', 'poCopyTypePreview');
    buildAllPoInvoices();

    const paper = $('poInvoicePaper');
    paper.style.overflow = 'visible';
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await html2pdf().set({ ...PDF_OPT, filename: (inv.invoiceNumber || 'po-invoice') + '.pdf' }).from(paper).save();
    paper.style.overflow = '';
    restoreViewState(state);
  }
});
