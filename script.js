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
      migratePaymentCreditIds();

      renderCustomers();
      renderProducts();
      checkReminders();

      $('loadingPanel').classList.add('hidden');
      hideCustForm();
      hideProdForm();
      $('previewPanel').classList.add('hidden');
      goHome();
    } else {
      customers = [];
      products = [];
      invoices = [];
      payments = {};
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

  document.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', () => {
      showView(card.dataset.view);
      if (card.dataset.view === 'invoiceListView') renderInvoiceList();
      if (card.dataset.view === 'invoiceView') { resetInvoiceForm(); }
      if (card.dataset.view === 'paymentView') renderPaymentView();
      if (card.dataset.view === 'productView') hideProdForm();
      if (card.dataset.view === 'customerView') hideCustForm();
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
      const poSummary = poParts.length ? poParts.join(' · ') : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${escHtml(c.name)}</td>
        <td>${escHtml(c.gstin)}</td>
        <td>${escHtml(customerGstTypeLabel(c.gstType))}</td>
        <td class="cust-po-cell">${poSummary}</td>
        <td>${escHtml(c.contact)}</td>
        <td>${escHtml(c.phone)}</td>
        <td>${conCount}</td>
        <td class="actions">
          <button class="btn-edit" data-i="${i}">Edit</button>
          <button class="btn-del" data-i="${i}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  $('custSearch').addEventListener('input', () => renderCustomers());

  let tempConsignees = [];

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
    renderConsigneeList();
    resetConsigneeForm();
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
      consignees: [...tempConsignees]
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
      renderConsigneeList();
      resetConsigneeForm();
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
        <td>${i + 1}</td>
        <td>${escHtml(p.name)}</td>
        <td>${escHtml(p.hsn)}</td>
        <td>${Number(p.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="actions">
          <button class="btn-edit" data-i="${i}">Edit</button>
          <button class="btn-del" data-i="${i}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  $('prodSearch').addEventListener('input', () => renderProducts());

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

  function resetInvoiceForm() {
    editingInvoiceId = null;
    cameFromInvoiceList = false;
    cameFromPayment = false;
    $('invoiceNumber').value = '';
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
    $('invoiceReminder').value = '';
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
      return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
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

  function getYearRange(offset) {
    const y = new Date().getFullYear() + offset;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }

  let activePreset = null;

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

  function applySortOrder(list) {
    const sortAsc = ($('invSortOrder').value === 'asc');
    return list.sort((a, b) => {
      const da = a.invoiceDate || a.createdAt || '';
      const db = b.invoiceDate || b.createdAt || '';
      return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
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
    const list = getCustomFilteredInvoices();
    $('customRangeCount').textContent = list.length ? `${list.length} invoice${list.length > 1 ? 's' : ''} found` : '';
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
    clearPresetActive();
    activePreset = 'invPresetCustom';
    $('invPresetCustom').classList.add('active');
    $('invDateFrom').value = from;
    $('invDateTo').value = to;
    renderInvoiceList();
    $('invPresetClear').style.display = 'inline-flex';
    $('downloadFilteredBtn').style.display = 'inline-flex';
  });

  $('customDownloadBtn').addEventListener('click', () => {
    const selected = getCustomFilteredInvoices();
    if (!selected.length) { alert('No invoices found in this date range'); return; }
    $('customRangeOverlay').classList.add('hidden');
    downloadBulkPDF(selected, `invoices-${$('customFrom').value}-to-${$('customTo').value}.pdf`);
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

    let labels = [], data = [];

    if (graphMode === 'monthly') {
      const year = parseInt($('chartYear').value);
      labels = [...MONTHS_SHORT];
      data = new Array(12).fill(0);
      invoices.forEach(inv => {
        const ds = inv.invoiceDate || inv.createdAt;
        if (!ds) return;
        const d = new Date(ds);
        if (d.getFullYear() === year) data[d.getMonth()] += computeGrandTotal(inv);
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
        invoices.forEach(inv => {
          const ds = inv.invoiceDate;
          if (ds && ds >= wsStr && ds <= weStr) total += computeGrandTotal(inv);
        });
        data.push(total);
        weekStart.setDate(weekStart.getDate() + 7);
        weekNum++;
      }

    } else if (graphMode === 'yearly') {
      const yearSet = [...new Set(invoices.map(inv => {
        const d = inv.invoiceDate || inv.createdAt;
        return d ? new Date(d).getFullYear() : null;
      }).filter(Boolean))].sort();
      if (!yearSet.length) yearSet.push(new Date().getFullYear());
      labels = yearSet.map(String);
      data = yearSet.map(y => {
        let total = 0;
        invoices.forEach(inv => {
          const ds = inv.invoiceDate || inv.createdAt;
          if (ds && new Date(ds).getFullYear() === y) total += computeGrandTotal(inv);
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
      const filtered = invoices.filter(inv => inv.invoiceDate && inv.invoiceDate >= from && inv.invoiceDate <= to);
      const dayMap = {};
      filtered.forEach(inv => {
        dayMap[inv.invoiceDate] = (dayMap[inv.invoiceDate] || 0) + computeGrandTotal(inv);
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
          label: 'Revenue (₹)',
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
    populateChartYear();
    populateChartMonth();
    updateGraphFilters();
    $('graphOverlay').classList.remove('hidden');
    renderGraph();
  });

  $('graphCloseBtn').addEventListener('click', () => {
    $('graphOverlay').classList.add('hidden');
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

  function addCompanyCredit(name, amount, note, dateIso) {
    const rec = getCompanyPayment(name);
    rec.credits.push({
      id: genCreditId(),
      amount: Number(amount),
      date: dateIso || new Date().toISOString(),
      note: note || ''
    });
    rec.totalCredited = rec.credits.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    savePayments();
  }

  function updateCompanyCredit(name, creditId, amount, note, dateIso) {
    const rec = getCompanyPayment(name);
    const c = rec.credits.find(x => x.id === creditId);
    if (!c) return false;
    c.amount = Number(amount);
    c.note = note || '';
    c.date = dateIso;
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
    const outstanding = Math.max(totalAmt - credited, 0);
    const creditEntries = rec && rec.credits ? [...rec.credits].sort((a, b) => new Date(a.date) - new Date(b.date)) : [];
    const fifoRows = fifoAllocationsForCompany(companyName);
    const openFifo = fifoRows.filter(r => r.balance > 0.005);
    return {
      companyName,
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
        return `<tr>
          <td class="c pay-col-idx">${i + 1}</td>
          <td class="pay-col-when">${formatDateTime(c.date)}</td>
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
                <thead><tr><th class="c">#</th><th>Date &amp; time</th><th class="r">Amount</th><th>Note</th><th class="r">Outstanding</th><th></th></tr></thead>
                <tbody>${creditLogRows}</tbody>
              </table>
            </div>
          </div>`
        : `<p class="pay-fifo-hint">No credits yet. Open invoices show full amounts until you add credits (applied to oldest invoice dates first).</p>`;

      const invoiceRows = openFifo.map(r => `<tr>
          <td>${escHtml(r.inv.invoiceNumber)}</td>
          <td class="pay-col-date">${r.inv.invoiceDate ? formatShortDate(r.inv.invoiceDate) : '—'}</td>
          <td class="r">₹${fmtNum(r.gross)}</td>
          <td class="r pay-col-settled">₹${fmtNum(r.applied)}</td>
          <td class="r pay-col-balance">₹${fmtNum(r.balance)}</td>
          <td class="c">${daysSince(r.inv.invoiceDate || r.inv.createdAt)}d</td>
          <td><button class="btn-view" data-inv-id="${r.inv.id}" style="font-size:.78rem">View</button></td>
        </tr>`).join('');
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
            <span class="pay-num-group pay-outstanding">${isPaid ? '<span style="color:#059669">Fully Paid</span>' : `Outstanding <strong>₹${fmtNum(co.outstanding)}</strong>`}</span>
          </div>
        </div>
        <div class="pay-company-invoices ${isExpanded ? '' : 'hidden'}">
          <p class="pay-fifo-hint pay-fifo-hint-strong">Credits are applied in order of invoice date (oldest first) until the recorded credits are used up.</p>
          ${creditLogBlock}
          <h4 class="pay-subhead pay-subhead-spaced">Invoices still due</h4>
          ${invoiceTable}
        </div>`;
      container.appendChild(section);
    });
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

  function buildPaymentSummaryDialogHtmlFromSnapshot(s) {
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
      : `<tr><td colspan="6" class="pay-sum-empty">No credits recorded yet.</td></tr>`;

    return `<div class="pay-sum-dialog">
        <div class="pay-sum-toolbar">
          <button type="button" class="btn btn-primary btn-sm btn-pay-summary-pdf" data-company="${ne}">Download summary PDF</button>
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
            <tr class="pay-sum-out-row"><td><strong>Outstanding</strong></td><td class="r pay-sum-strong">₹${fmtNum(s.outstanding)}</td></tr>
            <tr><td>Invoices with balance due (no.)</td><td class="r pay-sum-strong">${s.pendCount}</td></tr>
          </tbody>
        </table>
        <p class="pay-sum-fifo-note">Credits apply oldest invoice date first (FIFO).</p>

        <h4 class="pay-sum-h4">Payments (chronological)</h4>
        <div class="pay-table-scroll pay-sum-scroll">
          <table class="pay-sum-table pay-sum-payments">
            <colgroup><col class="pay-sum-c5"><col class="pay-sum-c20"><col class="pay-sum-c17"><col class="pay-sum-c30"><col class="pay-sum-c18"><col class="pay-sum-c10"></colgroup>
            <thead><tr><th class="c">#</th><th>When</th><th class="r">Amount</th><th>Note</th><th class="r">Outstanding</th><th></th></tr></thead>
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
    $('payAmtInput').value = String(c.amount);
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
    const amount = parseFloat($('payAmtInput').value);
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    const d = $('payDateInput').value;
    if (!d) { alert(payEditCreditId ? 'Select credit date and time' : 'Select created date and time'); return; }
    const dateIso = datetimeLocalToIso(d);
    if (payEditCreditId) {
      updateCompanyCredit(payFormCompany, payEditCreditId, amount, $('payNoteInput').value.trim(), dateIso);
    } else {
      addCompanyCredit(payFormCompany, amount, $('payNoteInput').value.trim(), dateIso);
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
      renderConsigneeList();
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
      renderConsigneeList();
    },
    { showOnEmpty: false }
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
  function matchProducts(val) {
    return products
      .filter(p => p.name.toLowerCase().includes(val) || p.hsn.toLowerCase().includes(val))
      .map(p => ({ label: `${escHtml(p.name)}<small>HSN: ${escHtml(p.hsn)}</small>`, data: p }));
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

  async function downloadCompanyPaymentSummaryPDF(companyName) {
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
});
