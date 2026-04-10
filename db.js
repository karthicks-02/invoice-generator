const db = {
  _uid: null,

  setUser(uid) {
    this._uid = uid;
  },

  _doc(name) {
    return firestore.collection('users').doc(this._uid).collection('data').doc(name);
  },

  async loadCustomers() {
    const snap = await this._doc('customers').get();
    return snap.exists ? (snap.data().items || []) : [];
  },

  saveCustomers(data) {
    if (!this._uid) return;
    this._doc('customers').set({ items: data });
  },

  async loadProducts() {
    const snap = await this._doc('products').get();
    return snap.exists ? (snap.data().items || []) : [];
  },

  saveProducts(data) {
    if (!this._uid) return;
    this._doc('products').set({ items: data });
  },

  async loadInvoices() {
    const snap = await this._doc('invoices').get();
    return snap.exists ? (snap.data().items || []) : [];
  },

  saveInvoices(data) {
    if (!this._uid) return;
    this._doc('invoices').set({ items: data });
  },

  async loadPayments() {
    const snap = await this._doc('payments').get();
    return snap.exists ? (snap.data().data || {}) : {};
  },

  savePayments(data) {
    if (!this._uid) return;
    this._doc('payments').set({ data: data });
  },

  async loadVendors() {
    const snap = await this._doc('vendors').get();
    return snap.exists ? (snap.data().items || []) : [];
  },

  saveVendors(data) {
    if (!this._uid) return;
    this._doc('vendors').set({ items: data });
  },

  async loadVendorPayments() {
    const snap = await this._doc('vendorPayments').get();
    return snap.exists ? (snap.data().data || {}) : {};
  },

  saveVendorPayments(data) {
    if (!this._uid) return;
    this._doc('vendorPayments').set({ data: data });
  },

  async loadPoInvoices() {
    const snap = await this._doc('poInvoices').get();
    return snap.exists ? (snap.data().items || []) : [];
  },

  savePoInvoices(data) {
    if (!this._uid) return;
    this._doc('poInvoices').set({ items: data });
  },

  async migrateFromLocalStorage() {
    const keys = ['ki_customers', 'ki_products', 'ki_invoices', 'ki_payments'];
    const hasData = keys.some(k => localStorage.getItem(k));
    if (!hasData) return false;

    const custs = JSON.parse(localStorage.getItem('ki_customers') || 'null');
    const prods = JSON.parse(localStorage.getItem('ki_products') || 'null');
    const invs = JSON.parse(localStorage.getItem('ki_invoices') || 'null');
    const pays = JSON.parse(localStorage.getItem('ki_payments') || 'null');

    if (custs) await this._doc('customers').set({ items: custs });
    if (prods) await this._doc('products').set({ items: prods });
    if (invs) await this._doc('invoices').set({ items: invs });
    if (pays) await this._doc('payments').set({ data: pays });

    keys.forEach(k => localStorage.removeItem(k));
    return true;
  }
};
