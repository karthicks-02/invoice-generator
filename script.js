document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

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

      renderCustomers();
      renderProducts();
      checkReminders();

      $('loadingPanel').classList.add('hidden');
      hideCustForm();
      $('prodFormWrap').classList.add('hidden');
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
      $('prodFormWrap').classList.add('hidden');
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

  function renderCustomers() {
    const tbody = $('custBody');
    tbody.innerHTML = '';
    $('custEmpty').style.display = customers.length ? 'none' : 'block';
    $('custTable').style.display = customers.length ? 'table' : 'none';
    customers.forEach((c, i) => {
      const conCount = c.consignees ? c.consignees.length : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${escHtml(c.name)}</td>
        <td>${escHtml(c.gstin)}</td>
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

  let tempConsignees = [];

  function renderConsigneeList() {
    const wrap = $('consigneeList');
    wrap.innerHTML = '';
    tempConsignees.forEach((con, i) => {
      const div = document.createElement('div');
      div.className = 'consignee-item';
      div.innerHTML = `
        <div class="consignee-item-info">
          <div class="consignee-item-name">${escHtml(con.name)}</div>
          <div class="consignee-item-addr">${escHtml(con.address)}</div>
        </div>
        <button class="btn-del" data-ci="${i}">&times;</button>`;
      wrap.appendChild(div);
    });
  }

  function resetConsigneeForm() {
    $('conName').value = '';
    $('conAddress').value = '';
    $('consigneeFormRow').classList.add('hidden');
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
    tempConsignees.push({ name, address });
    renderConsigneeList();
    resetConsigneeForm();
  });

  $('consigneeList').addEventListener('click', e => {
    if (e.target.classList.contains('btn-del')) {
      const ci = +e.target.dataset.ci;
      tempConsignees.splice(ci, 1);
      renderConsigneeList();
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
    tbody.innerHTML = '';
    $('prodEmpty').style.display = products.length ? 'none' : 'block';
    $('prodTable').style.display = products.length ? 'table' : 'none';
    products.forEach((p, i) => {
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

  $('addProdBtn').addEventListener('click', () => {
    editProdIdx = -1;
    $('prodFormTitle').textContent = 'Add Product';
    $('prodName').value = '';
    $('prodHsn').value = '';
    $('prodRate').value = '';
    $('prodFormWrap').classList.remove('hidden');
  });

  $('cancelProdBtn').addEventListener('click', () => {
    $('prodFormWrap').classList.add('hidden');
  });

  $('saveProdBtn').addEventListener('click', () => {
    const obj = {
      name: $('prodName').value.trim(),
      hsn: $('prodHsn').value.trim(),
      rate: parseFloat($('prodRate').value) || 0
    };
    if (!obj.name) { alert('Product Name is required'); return; }
    if (editProdIdx >= 0) {
      products[editProdIdx] = obj;
    } else {
      products.push(obj);
    }
    saveProducts();
    renderProducts();
    $('prodFormWrap').classList.add('hidden');
  });

  $('prodBody').addEventListener('click', e => {
    const i = +e.target.dataset.i;
    if (e.target.classList.contains('btn-edit')) {
      editProdIdx = i;
      const p = products[i];
      $('prodFormTitle').textContent = 'Edit Product';
      $('prodName').value = p.name;
      $('prodHsn').value = p.hsn;
      $('prodRate').value = p.rate;
      $('prodFormWrap').classList.remove('hidden');
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

    if (data.reminderDate) {
      setReminder(data.id || editingInvoiceId, data.reminderDate, 'Payment reminder');
    }
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

    items = (inv.items && inv.items.length) ? inv.items.map(it => ({ ...it })) : [{ description: '', hsn: '', packages: 0, qty: 0, rate: 0 }];
    renderItems();

    if (inv.copyTypes && inv.copyTypes.length) {
      document.querySelectorAll('.copyType').forEach(cb => {
        cb.checked = inv.copyTypes.includes(cb.value);
      });
    }
  }

  function resetInvoiceForm() {
    editingInvoiceId = null;
    cameFromInvoiceList = false;
    cameFromPayment = false;
    $('invoiceNumber').value = '';
    $('invoiceDate').value = new Date().toISOString().split('T')[0];
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
    items = [{ description: '', hsn: '', packages: 0, qty: 0, rate: 0 }];
    renderItems();
    document.querySelectorAll('.copyType').forEach(cb => {
      cb.checked = cb.value === 'ORIGINAL FOR BUYER';
    });
    $('formPanel').classList.remove('hidden');
    $('previewPanel').classList.add('hidden');
  }

  function computeGrandTotal(inv) {
    let subtotal = 0;
    (inv.items || []).forEach(it => { subtotal += (it.qty || 0) * (it.rate || 0); });
    const rate = inv.gstRate || 0;
    const tax = inv.gstType === 'intra' ? subtotal * rate / 100 * 2 : subtotal * rate / 100;
    return subtotal + tax;
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

    filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

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
  }

  $('invSearch').addEventListener('input', renderInvoiceList);
  $('invDateFrom').addEventListener('change', renderInvoiceList);
  $('invDateTo').addEventListener('change', renderInvoiceList);

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
  function getWeekRange(offset) {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset + (offset * 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: monday.toISOString().split('T')[0], to: sunday.toISOString().split('T')[0] };
  }

  function getMonthRange(offset) {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] };
  }

  let activePreset = null;

  function clearPresetActive() {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
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

  $('invPresetClear').addEventListener('click', () => {
    clearPresetActive();
    $('invDateFrom').value = '';
    $('invDateTo').value = '';
    renderInvoiceList();
  });

  function getFilteredInvoices() {
    const from = $('invDateFrom').value;
    const to = $('invDateTo').value;
    if (!from || !to) return invoices.slice();
    return invoices.filter(inv => inv.invoiceDate && inv.invoiceDate >= from && inv.invoiceDate <= to);
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
    const selected = invoices.filter(inv => ids.includes(inv.id));
    if (!selected.length) return;
    const filename = selected.length === 1 ? `${selected[0].invoiceNumber || 'invoice'}.pdf` : `invoices-${new Date().toISOString().split('T')[0]}.pdf`;
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
        const wsStr = weekStart.toISOString().split('T')[0];
        const weStr = wEnd.toISOString().split('T')[0];
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
  // ── Payment Tracking ──
  // ══════════════════════════════════════
  let payments = {};

  function savePayments() {
    db.savePayments(payments);
  }

  function getPaymentRecord(invoiceId) {
    if (!payments[invoiceId]) {
      payments[invoiceId] = { invoiceId, payments: [], totalPaid: 0, reminder: null, status: 'unpaid' };
    }
    return payments[invoiceId];
  }

  function addPayment(invoiceId, amount, note) {
    const rec = getPaymentRecord(invoiceId);
    rec.payments.push({ amount, date: new Date().toISOString(), note: note || '' });
    rec.totalPaid = rec.payments.reduce((s, p) => s + p.amount, 0);
    const inv = invoices.find(x => x.id === invoiceId);
    const total = inv ? computeGrandTotal(inv) : 0;
    rec.status = rec.totalPaid >= total ? 'paid' : 'partial';
    savePayments();
  }

  function markFullyPaid(invoiceId) {
    const inv = invoices.find(x => x.id === invoiceId);
    if (!inv) return;
    const total = computeGrandTotal(inv);
    const rec = getPaymentRecord(invoiceId);
    const remaining = total - rec.totalPaid;
    if (remaining > 0) {
      rec.payments.push({ amount: remaining, date: new Date().toISOString(), note: 'Marked as fully paid' });
      rec.totalPaid = total;
    }
    rec.status = 'paid';
    savePayments();
  }

  function setReminder(invoiceId, date, note) {
    const rec = getPaymentRecord(invoiceId);
    rec.reminder = { date, note: note || '' };
    savePayments();
  }

  function daysSince(dateStr) {
    if (!dateStr) return 0;
    const created = new Date(dateStr);
    const now = new Date();
    return Math.floor((now - created) / (1000 * 60 * 60 * 24));
  }

  // ── Render Payment View ──
  function renderPaymentView() {
    const query = ($('paySearch').value || '').trim().toLowerCase();
    const custFilter = $('payCustomerFilter').value;

    const unpaid = invoices.filter(inv => {
      const rec = payments[inv.id];
      if (rec && rec.status === 'paid') return false;
      if (query) {
        const hay = [inv.invoiceNumber, inv.buyerName].join(' ').toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (custFilter && inv.buyerName !== custFilter) return false;
      return true;
    });

    unpaid.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    let totalOutstanding = 0;
    const companyMap = {};

    unpaid.forEach(inv => {
      const total = computeGrandTotal(inv);
      const rec = payments[inv.id];
      const paid = rec ? rec.totalPaid : 0;
      const outstanding = total - paid;
      totalOutstanding += outstanding;

      if (!companyMap[inv.buyerName]) {
        companyMap[inv.buyerName] = { count: 0, outstanding: 0 };
      }
      companyMap[inv.buyerName].count++;
      companyMap[inv.buyerName].outstanding += outstanding;
    });

    $('totalOutstanding').textContent = '₹' + fmtNum(totalOutstanding);

    // Company summary cards
    const cardsEl = $('companySummaryCards');
    cardsEl.innerHTML = '';
    Object.keys(companyMap).sort().forEach(name => {
      const info = companyMap[name];
      const card = document.createElement('div');
      card.className = 'company-card' + (custFilter === name ? ' active' : '');
      card.innerHTML = `
        <div class="company-card-name">${escHtml(name)}</div>
        <div class="company-card-detail">${info.count} invoice${info.count > 1 ? 's' : ''}</div>
        <div class="company-card-amount">₹${fmtNum(info.outstanding)}</div>`;
      card.addEventListener('click', () => {
        $('payCustomerFilter').value = custFilter === name ? '' : name;
        renderPaymentView();
      });
      cardsEl.appendChild(card);
    });

    // Customer dropdown
    const select = $('payCustomerFilter');
    const currentVal = select.value;
    const allCustomerNames = [...new Set(invoices.map(inv => inv.buyerName).filter(Boolean))].sort();
    select.innerHTML = '<option value="">All Customers</option>';
    allCustomerNames.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      if (n === currentVal) opt.selected = true;
      select.appendChild(opt);
    });

    // Table
    const tbody = $('payBody');
    tbody.innerHTML = '';
    $('payEmpty').style.display = unpaid.length ? 'none' : 'block';
    $('payTable').style.display = unpaid.length ? 'table' : 'none';

    const todayStr = new Date().toISOString().split('T')[0];

    unpaid.forEach(inv => {
      const total = computeGrandTotal(inv);
      const rec = payments[inv.id];
      const paid = rec ? rec.totalPaid : 0;
      const outstanding = total - paid;
      const days = daysSince(inv.invoiceDate || inv.createdAt);
      const reminder = rec ? rec.reminder : null;
      const isOverdue = reminder && reminder.date <= todayStr;

      const tr = document.createElement('tr');
      if (isOverdue) tr.className = 'row-overdue';

      let reminderBadge = '';
      if (reminder) {
        const cls = isOverdue ? 'reminder-badge overdue' : 'reminder-badge';
        reminderBadge = `<span class="${cls}" title="Reminder: ${formatShortDate(reminder.date)}${reminder.note ? ' - ' + escHtml(reminder.note) : ''}"></span>`;
      }

      tr.innerHTML = `
        <td>${escHtml(inv.invoiceNumber)}${reminderBadge}</td>
        <td>${inv.invoiceDate ? formatShortDate(inv.invoiceDate) : ''}</td>
        <td>${escHtml(inv.buyerName)}</td>
        <td class="r">₹${fmtNum(total)}</td>
        <td class="r">₹${fmtNum(paid)}</td>
        <td class="r"><strong>₹${fmtNum(outstanding)}</strong></td>
        <td class="c">${days}</td>
        <td class="actions">
          <button class="btn-view" data-inv-id="${inv.id}">View</button>
          <button class="btn-pay" data-inv-id="${inv.id}">+ Pay</button>
          <button class="btn-remind" data-inv-id="${inv.id}">Remind</button>
          <button class="btn-markpaid" data-inv-id="${inv.id}">Paid</button>
        </td>`;
      tbody.appendChild(tr);
    });

    // Paid invoices table
    const paidInvs = invoices.filter(inv => {
      const rec = payments[inv.id];
      if (!rec || rec.status !== 'paid') return false;
      if (query) {
        const hay = [inv.invoiceNumber, inv.buyerName].join(' ').toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (custFilter && inv.buyerName !== custFilter) return false;
      return true;
    });

    paidInvs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    $('unpaidCount').textContent = unpaid.length;
    $('paidCount').textContent = paidInvs.length;

    $('paidTable').style.display = paidInvs.length ? 'table' : 'none';
    $('paidEmpty').style.display = paidInvs.length ? 'none' : 'block';

    const paidTbody = $('paidBody');
    paidTbody.innerHTML = '';
    paidInvs.forEach(inv => {
      const total = computeGrandTotal(inv);
      const rec = payments[inv.id];
      const paid = rec ? rec.totalPaid : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escHtml(inv.invoiceNumber)}</td>
        <td>${inv.invoiceDate ? formatShortDate(inv.invoiceDate) : ''}</td>
        <td>${escHtml(inv.buyerName)}</td>
        <td class="r">₹${fmtNum(total)}</td>
        <td class="r">₹${fmtNum(paid)}</td>
        <td class="actions">
          <button class="btn-view" data-inv-id="${inv.id}">View</button>
          <button class="btn-unpaid" data-inv-id="${inv.id}">Mark Unpaid</button>
        </td>`;
      paidTbody.appendChild(tr);
    });
  }

  $('paySearch').addEventListener('input', renderPaymentView);
  $('payCustomerFilter').addEventListener('change', renderPaymentView);

  // Tab switching
  document.querySelectorAll('.pay-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $('unpaidPanel').classList.toggle('hidden', tab.dataset.tab !== 'unpaid');
      $('paidPanel').classList.toggle('hidden', tab.dataset.tab !== 'paid');
    });
  });

  $('paidBody').addEventListener('click', e => {
    const id = e.target.dataset.invId;
    if (!id) return;
    if (e.target.classList.contains('btn-view')) {
      viewInvoiceFromPayment(id);
    }
    if (e.target.classList.contains('btn-unpaid')) {
      const rec = payments[id];
      if (rec) {
        rec.status = 'unpaid';
        rec.payments = [];
        rec.totalPaid = 0;
        savePayments();
        renderPaymentView();
      }
    }
  });

  // ── Payment table actions ──
  let payFormInvoiceId = null;
  let reminderInvoiceId = null;

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

  $('payBody').addEventListener('click', e => {
    const id = e.target.dataset.invId;
    if (!id) return;

    if (e.target.classList.contains('btn-view')) {
      viewInvoiceFromPayment(id);
    }

    if (e.target.classList.contains('btn-pay')) {
      payFormInvoiceId = id;
      const inv = invoices.find(x => x.id === id);
      $('payFormInvLabel').textContent = inv ? `Invoice ${inv.invoiceNumber} — ${inv.buyerName}` : '';
      $('payAmtInput').value = '';
      $('payNoteInput').value = '';
      $('payFormOverlay').classList.remove('hidden');
      $('payAmtInput').focus();
    }

    if (e.target.classList.contains('btn-remind')) {
      reminderInvoiceId = id;
      const inv = invoices.find(x => x.id === id);
      $('reminderInvLabel').textContent = inv ? `Invoice ${inv.invoiceNumber} — ${inv.buyerName}` : '';
      const rec = payments[id];
      $('reminderDateInput').value = (rec && rec.reminder) ? rec.reminder.date : '';
      $('reminderNoteInput').value = (rec && rec.reminder) ? rec.reminder.note : '';
      $('reminderOverlay').classList.remove('hidden');
      $('reminderDateInput').focus();
    }

    if (e.target.classList.contains('btn-markpaid')) {
      if (confirm('Mark this invoice as fully paid?')) {
        markFullyPaid(id);
        renderPaymentView();
      }
    }
  });

  // Add Payment form
  $('payFormSaveBtn').addEventListener('click', () => {
    const amount = parseFloat($('payAmtInput').value);
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    addPayment(payFormInvoiceId, amount, $('payNoteInput').value.trim());
    $('payFormOverlay').classList.add('hidden');
    payFormInvoiceId = null;
    renderPaymentView();
  });
  $('payFormCancelBtn').addEventListener('click', () => {
    $('payFormOverlay').classList.add('hidden');
    payFormInvoiceId = null;
  });

  // Reminder form
  $('reminderSaveBtn').addEventListener('click', () => {
    const date = $('reminderDateInput').value;
    if (!date) { alert('Select a reminder date'); return; }
    setReminder(reminderInvoiceId, date, $('reminderNoteInput').value.trim());
    $('reminderOverlay').classList.add('hidden');
    reminderInvoiceId = null;
    renderPaymentView();
  });
  $('reminderCancelBtn').addEventListener('click', () => {
    $('reminderOverlay').classList.add('hidden');
    reminderInvoiceId = null;
  });

  // ── Reminder Preset Buttons (overlay + invoice form) ──
  function addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  document.querySelectorAll('#reminderOverlay .preset-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      $('reminderDateInput').value = addDays(+btn.dataset.days);
    });
  });

  document.querySelectorAll('#invReminderPresets .preset-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      $('invoiceReminder').value = addDays(+btn.dataset.days);
    });
  });

  // ── Email Reminder ──
  $('reminderEmailBtn').addEventListener('click', () => {
    if (!reminderInvoiceId) return;
    if (typeof EMAILJS_CONFIG === 'undefined' || EMAILJS_CONFIG.publicKey === 'YOUR_PUBLIC_KEY') {
      alert('EmailJS is not configured yet.\n\nEdit emailjs-config.js with your EmailJS credentials.\nSee https://www.emailjs.com/ to sign up (free: 200 emails/month).');
      return;
    }
    const inv = invoices.find(x => x.id === reminderInvoiceId);
    if (!inv) return;
    const total = computeGrandTotal(inv);
    const rec = payments[reminderInvoiceId];
    const paid = rec ? rec.totalPaid : 0;
    const outstanding = total - paid;
    const dueDate = $('reminderDateInput').value ? formatShortDate($('reminderDateInput').value) : 'Not set';
    const userEmail = auth.currentUser ? auth.currentUser.email : '';

    emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_email: userEmail,
      invoice_no: inv.invoiceNumber,
      buyer_name: inv.buyerName,
      amount: '₹' + fmtNum(outstanding),
      due_date: dueDate
    }).then(() => {
      alert('Reminder email sent to ' + userEmail);
    }).catch(err => {
      alert('Failed to send email: ' + (err.text || err.message || err));
    });
  });

  // ── Browser Notifications for Due Reminders ──
  function checkReminders() {
    const todayStr = new Date().toISOString().split('T')[0];
    const due = [];

    Object.values(payments).forEach(rec => {
      if (rec.status === 'paid') return;
      if (!rec.reminder || rec.reminder.date > todayStr) return;
      const inv = invoices.find(x => x.id === rec.invoiceId);
      if (inv) due.push(inv);
    });

    if (!due.length) return;

    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      due.forEach(inv => {
        new Notification('Payment Reminder', {
          body: `Invoice ${inv.invoiceNumber} — ${inv.buyerName} is due!`,
          icon: '₹'
        });
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          due.forEach(inv => {
            new Notification('Payment Reminder', {
              body: `Invoice ${inv.invoiceNumber} — ${inv.buyerName} is due!`,
              icon: '₹'
            });
          });
        }
      });
    }
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
        <td><input type="text" value="${esc(item.description)}" data-i="${i}" data-f="description" /></td>
        <td><input type="text" value="${esc(item.hsn)}" data-i="${i}" data-f="hsn" /></td>
        <td><input type="number" value="${item.packages || ''}" data-i="${i}" data-f="packages" min="0" step="1" /></td>
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

  // ── Preview ──
  $('previewBtn').addEventListener('click', () => {
    const invNo = $('invoiceNumber').value.trim();
    const buyer = $('buyerName').value.trim();
    if (!invNo) { alert('Invoice No. is required'); $('invoiceNumber').focus(); return; }
    if (!buyer) { alert('Buyer Company Name is required'); $('buyerName').focus(); return; }

    syncCopyChecks('copyType', 'copyTypePreview');
    saveCurrentInvoice();
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
            <col style="width:34%">
            <col style="width:11%">
            <col style="width:22%">
            <col style="width:11%">
            <col style="width:22%">
          </colgroup>
          <tr>
            <td rowspan="3" style="vertical-align:top;padding:8px 10px">
              <div class="inv-lbl" style="margin-bottom:4px">Details of Consignee / shipped to :</div>
              <div style="font-weight:700;margin-bottom:4px">${esc(consigneeName).toUpperCase()}</div>
              <div style="margin-bottom:4px">${esc(consigneeAddr).replace(/\n/g, '<br>')}</div>
              ${$('contactPerson').value.trim() ? `<div style="margin-bottom:4px">Contact Name : ${esc($('contactPerson').value).toUpperCase()}</div>` : ''}
              <div style="margin-bottom:4px">Contact : ${esc($('contactPhone').value)}</div>
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

  // ── Build Invoice from stored data (no DOM dependency) ──
  function buildInvoiceFromData(inv, copyType) {
    const gstRate = inv.gstRate || 0;
    const gstType = inv.gstType || 'intra';
    const shortDate = inv.invoiceDate ? formatShortDate(inv.invoiceDate) : '';
    const poDate = inv.poDate ? formatShortDate(inv.poDate) : '';
    const consigneeName = inv.sameAsBuyer !== false ? (inv.buyerName || '') : (inv.consigneeName || '');
    const consigneeAddr = inv.sameAsBuyer !== false ? (inv.buyerAddress || '') : (inv.consigneeAddress || '');

    let subtotal = 0;
    const itemRows = (inv.items || []).map((item, i) => {
      const amt = (item.qty || 0) * (item.rate || 0);
      subtotal += amt;
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="l">${esc(item.description).toUpperCase() || '—'}</td>
        <td class="c">${esc(item.hsn)}</td>
        <td class="c">${formatBags(item.packages)}</td>
        <td class="c">${item.qty || 0}</td>
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
    const grandTotal = subtotal + totalTax;
    const wordsStr = numberToWords(Math.round(grandTotal));

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
          <colgroup><col style="width:34%"><col style="width:11%"><col style="width:22%"><col style="width:11%"><col style="width:22%"></colgroup>
          <tr>
            <td rowspan="3" style="vertical-align:top;padding:8px 10px">
              <div class="inv-lbl" style="margin-bottom:4px">Details of Consignee / shipped to :</div>
              <div style="font-weight:700;margin-bottom:4px">${esc(consigneeName).toUpperCase()}</div>
              <div style="margin-bottom:4px">${esc(consigneeAddr).replace(/\n/g, '<br>')}</div>
              ${(inv.contactPerson || '').trim() ? `<div style="margin-bottom:4px">Contact Name : ${esc(inv.contactPerson).toUpperCase()}</div>` : ''}
              <div style="margin-bottom:4px">Contact : ${esc(inv.contactPhone)}</div>
              <div>GSTIN : ${esc(inv.buyerGstin)}</div>
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
          <colgroup><col style="width:5%"><col style="width:29%"><col style="width:11%"><col style="width:10%"><col style="width:11%"><col style="width:10%"><col style="width:14%"></colgroup>
          <thead><tr>
            <th>SL.No.</th><th>NAME OF THE COMMODITY / SERVICE</th><th>HSN CODE</th>
            <th>No.Of<br>Packages</th><th>Total Qty IN<br>NOS</th><th>Rate Per No.</th><th>GOODS VALUE<br>(in Rs.)</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <table class="inv-tbl inv-bottom">
          <colgroup><col style="width:18%"><col style="width:32%"><col style="width:30%"><col style="width:20%"></colgroup>
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
    window.scrollTo(0, 0);
    return shield;
  }

  function capturePDF(filename) {
    const opt = {
      margin: [0.3, 0.3, 0.3, 0.3],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    return html2pdf().set(opt).from($('invoicePaper')).save();
  }

  async function downloadInvoicePDF(inv) {
    const state = saveViewState();
    loadInvoiceIntoForm(inv);
    syncCopyChecks('copyType', 'copyTypePreview');
    buildAllInvoices();
    const shield = showPaperForCapture();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await capturePDF(`${inv.invoiceNumber || 'invoice'}.pdf`);
    shield.remove();
    restoreViewState(state);
  }

  async function downloadBulkPDF(selected, filename) {
    if (!selected.length) return;
    if (selected.length === 1) return downloadInvoicePDF(selected[0]);
    const state = saveViewState();

    let allHtml = '';
    selected.forEach((inv, idx) => {
      loadInvoiceIntoForm(inv);
      syncCopyChecks('copyType', 'copyTypePreview');
      const types = getSelectedCopyTypes('copyType');
      if (!types.length) types.push('');
      allHtml += types.map(t => buildInvoice(t)).join('<div class="copy-separator"></div>');
      if (idx < selected.length - 1) allHtml += '<div style="page-break-before:always"></div>';
    });
    $('invoicePaper').innerHTML = allHtml;
    const shield = showPaperForCapture();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await capturePDF(filename);
    shield.remove();
    restoreViewState(state);
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
