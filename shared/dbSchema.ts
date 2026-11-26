import bcrypt from 'bcryptjs';

export interface DbStatementLike {
  get: (...args: never[]) => unknown;
  all: (...args: never[]) => unknown[];
  run: (...args: never[]) => { changes: number; lastInsertRowid: number | bigint };
}

export interface DbLike {
  exec: (sql: string) => unknown;
  pragma: (cmd: string) => unknown;
  prepare: (sql: string) => {
    get: (...args: any[]) => any;
    all: (...args: any[]) => any[];
    run: (...args: any[]) => { changes: number; lastInsertRowid: number | bigint };
  };
  transaction: (fn: () => void) => () => void;
}

export const APP_MODULES = [
  { key: 'dashboard', label: 'لوحة المؤشرات والشاشة الرئيسية' },
  { key: 'definitions', label: 'أكواد وتعريفات (الأصناف والعملاء والموردين)' },
  { key: 'purchases', label: 'فواتير المشتريات' },
  { key: 'sales', label: 'فواتير المبيعات ونقطة البيع' },
  { key: 'purchase_returns', label: 'مرتجعات المشتريات' },
  { key: 'sales_returns', label: 'مرتجعات المبيعات' },
  { key: 'inventory', label: 'المخازن والجرد والتحويلات والتسويات' },
  { key: 'accounts', label: 'العملاء والموردين وكشوف الحسابات والمدفوعات' },
  { key: 'treasury', label: 'المصروفات والإيرادات والخزائن والبنوك' },
  { key: 'operations', label: 'العمليات (تحديث الأسعار والباركود والشيكات)' },
  { key: 'import', label: 'مساعد استيراد البيانات الذكي' },
  { key: 'reports', label: 'مركز التقارير والطباعة والتصدير' },
  { key: 'users', label: 'المستخدمون والصلاحيات وسجل التدقيق' },
  { key: 'settings', label: 'الإعدادات والنسخ الاحتياطي والترخيص' },
];

export function initializeSchema(db: DbLike) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL,
      module_key TEXT NOT NULL,
      can_view INTEGER NOT NULL DEFAULT 1,
      can_add INTEGER NOT NULL DEFAULT 1,
      can_edit INTEGER NOT NULL DEFAULT 1,
      can_delete INTEGER NOT NULL DEFAULT 0,
      can_approve INTEGER NOT NULL DEFAULT 1,
      can_print INTEGER NOT NULL DEFAULT 1,
      can_export INTEGER NOT NULL DEFAULT 1,
      can_view_cost INTEGER NOT NULL DEFAULT 1,
      UNIQUE(role_id, module_key),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      allow_negative_stock INTEGER NOT NULL DEFAULT 0,
      allow_price_change INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      parent_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      location TEXT DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      alt_name TEXT DEFAULT '',
      barcode TEXT DEFAULT '',
      category_id INTEGER,
      brand TEXT DEFAULT '',
      base_unit_id INTEGER NOT NULL,
      purchase_price REAL NOT NULL DEFAULT 0,
      last_cost REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      wholesale_price REAL NOT NULL DEFAULT 0,
      special_price REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 5,
      notes TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (base_unit_id) REFERENCES units(id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

    CREATE TABLE IF NOT EXISTS barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      barcode TEXT NOT NULL UNIQUE,
      unit_id INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id)
    );

    CREATE TABLE IF NOT EXISTS unit_conversions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      sale_price REAL NOT NULL DEFAULT 0,
      wholesale_price REAL NOT NULL DEFAULT 0,
      barcode TEXT DEFAULT '',
      UNIQUE(product_id, unit_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id)
    );

    CREATE TABLE IF NOT EXISTS warehouse_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      UNIQUE(warehouse_id, product_id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      tax_number TEXT DEFAULT '',
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      credit_limit REAL NOT NULL DEFAULT 0,
      is_walkin INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      tax_number TEXT DEFAULT '',
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS sales_reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT '',
      commission_rate REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS cashboxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'CASH',
      account_number TEXT DEFAULT '',
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS expense_revenue_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'EXPENSE'
    );

    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      supplier_invoice_no TEXT DEFAULT '',
      invoice_date TEXT NOT NULL,
      supplier_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'CASH',
      cashbox_id INTEGER,
      subtotal REAL NOT NULL DEFAULT 0,
      items_discount REAL NOT NULL DEFAULT 0,
      invoice_discount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      extra_expenses REAL NOT NULL DEFAULT 0,
      allocate_expenses INTEGER NOT NULL DEFAULT 1,
      net_total REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'APPROVED',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (cashbox_id) REFERENCES cashboxes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL,
      base_quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount_value REAL NOT NULL DEFAULT 0,
      discount_percent REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      allocated_expense REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      effective_base_cost REAL NOT NULL,
      FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (unit_id) REFERENCES units(id)
    );

    CREATE TABLE IF NOT EXISTS sales_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      invoice_date TEXT NOT NULL,
      customer_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      sales_rep_id INTEGER,
      payment_type TEXT NOT NULL DEFAULT 'CASH',
      price_tier TEXT NOT NULL DEFAULT 'RETAIL',
      cashbox_id INTEGER,
      subtotal REAL NOT NULL DEFAULT 0,
      items_discount REAL NOT NULL DEFAULT 0,
      invoice_discount REAL NOT NULL DEFAULT 0,
      extra_additions REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      net_total REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      gross_profit REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'APPROVED',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (sales_rep_id) REFERENCES sales_reps(id),
      FOREIGN KEY (cashbox_id) REFERENCES cashboxes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sales_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL,
      base_quantity REAL NOT NULL,
      is_bonus INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL,
      discount_value REAL NOT NULL DEFAULT 0,
      discount_percent REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      cost_at_sale REAL NOT NULL DEFAULT 0,
      line_profit REAL NOT NULL DEFAULT 0,
      serial_numbers TEXT DEFAULT '',
      FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (unit_id) REFERENCES units(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT NOT NULL UNIQUE,
      return_date TEXT NOT NULL,
      purchase_invoice_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      settlement_type TEXT NOT NULL DEFAULT 'CREDIT',
      cashbox_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0,
      reason TEXT DEFAULT '',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_return_id INTEGER NOT NULL,
      purchase_item_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL,
      base_quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL,
      FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
      FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS sales_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT NOT NULL UNIQUE,
      return_date TEXT NOT NULL,
      sales_invoice_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      settlement_type TEXT NOT NULL DEFAULT 'CASH',
      cashbox_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0,
      total_cost_reversed REAL NOT NULL DEFAULT 0,
      reason TEXT DEFAULT '',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sales_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_return_id INTEGER NOT NULL,
      sales_item_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL,
      base_quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      cost_at_sale REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      item_condition TEXT NOT NULL DEFAULT 'VALID',
      FOREIGN KEY (sales_return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
      FOREIGN KEY (sales_item_id) REFERENCES sales_items(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_date TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id INTEGER NOT NULL,
      reference_number TEXT NOT NULL,
      qty_in REAL NOT NULL DEFAULT 0,
      qty_out REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      balance_after REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_date ON stock_movements(product_id, movement_date);

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_number TEXT NOT NULL UNIQUE,
      doc_date TEXT NOT NULL,
      warehouse_id INTEGER NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'ADJUSTMENT',
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'APPROVED',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS stock_adjustment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adjustment_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      book_qty REAL NOT NULL DEFAULT 0,
      actual_qty REAL NOT NULL DEFAULT 0,
      diff_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (adjustment_id) REFERENCES stock_adjustments(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS warehouse_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_number TEXT NOT NULL UNIQUE,
      transfer_date TEXT NOT NULL,
      from_warehouse_id INTEGER NOT NULL,
      to_warehouse_id INTEGER NOT NULL,
      notes TEXT DEFAULT '',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (transfer_id) REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS expenses_revenues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_number TEXT NOT NULL UNIQUE,
      voucher_date TEXT NOT NULL,
      kind TEXT NOT NULL,
      type_id INTEGER NOT NULL,
      cashbox_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'نقدي',
      description TEXT NOT NULL,
      attachment_name TEXT DEFAULT '',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (type_id) REFERENCES expense_revenue_types(id),
      FOREIGN KEY (cashbox_id) REFERENCES cashboxes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS receipts_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_number TEXT NOT NULL UNIQUE,
      voucher_date TEXT NOT NULL,
      kind TEXT NOT NULL,
      party_type TEXT NOT NULL,
      party_id INTEGER NOT NULL,
      cashbox_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'نقدي',
      reference_no TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (cashbox_id) REFERENCES cashboxes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cashbox_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_number TEXT NOT NULL UNIQUE,
      transfer_date TEXT NOT NULL,
      from_cashbox_id INTEGER NOT NULL,
      to_cashbox_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      notes TEXT DEFAULT '',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (from_cashbox_id) REFERENCES cashboxes(id),
      FOREIGN KEY (to_cashbox_id) REFERENCES cashboxes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cashbox_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_date TEXT NOT NULL,
      cashbox_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      reference_number TEXT NOT NULL,
      amount_in REAL NOT NULL DEFAULT 0,
      amount_out REAL NOT NULL DEFAULT 0,
      balance_after REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (cashbox_id) REFERENCES cashboxes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS account_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_date TEXT NOT NULL,
      party_type TEXT NOT NULL,
      party_id INTEGER NOT NULL,
      tx_type TEXT NOT NULL,
      reference_number TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance_after REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS checks_installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL,
      party_type TEXT NOT NULL,
      party_id INTEGER NOT NULL,
      doc_number TEXT NOT NULL,
      bank_name TEXT DEFAULT '',
      due_date TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      duplicate_policy TEXT NOT NULL,
      update_scope TEXT NOT NULL,
      affected_product_ids TEXT DEFAULT '[]',
      adjustment_id INTEGER DEFAULT NULL,
      is_rolled_back INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS import_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_job_id INTEGER NOT NULL,
      row_number INTEGER NOT NULL,
      raw_data TEXT NOT NULL,
      error_message TEXT NOT NULL,
      FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT DEFAULT '',
      doc_number TEXT DEFAULT '',
      before_json TEXT DEFAULT '',
      after_json TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trial_started_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      clock_tamper_flagged INTEGER NOT NULL DEFAULT 0,
      is_activated INTEGER NOT NULL DEFAULT 0,
      license_id TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      license_type TEXT DEFAULT 'TRIAL',
      device_fingerprint TEXT DEFAULT '',
      max_devices INTEGER NOT NULL DEFAULT 1,
      issued_at TEXT DEFAULT '',
      expires_at TEXT DEFAULT '',
      raw_license_json TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS license_manager_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT DEFAULT '',
      device_fingerprint TEXT NOT NULL,
      license_type TEXT NOT NULL,
      max_devices INTEGER NOT NULL DEFAULT 1,
      enabled_modules TEXT NOT NULL DEFAULT '["ALL"]',
      issued_at TEXT NOT NULL,
      expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      activation_code TEXT NOT NULL,
      signed_json TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS license_revocations (
      license_id TEXT PRIMARY KEY,
      revoked_at TEXT NOT NULL,
      reason TEXT DEFAULT ''
    );
  `);
}

export function seedCoreBusinessData(db: DbLike) {
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const tx = db.transaction(() => {
    const roleDefs = [
      { name: 'مدير النظام', desc: 'صلاحيات كاملة على جميع شاشات النظام والتكاليف والإعدادات' },
      { name: 'مدير حسابات', desc: 'إدارة الحسابات والمشتريات والمبيعات والتقارير المالية' },
      { name: 'بائع', desc: 'نقطة البيع وفواتير المبيعات ومرتجعات البيع والعملاء' },
      { name: 'مشتريات', desc: 'فواتير المشتريات ومرتجعات الشراء والموردين' },
      { name: 'أمين مخزن', desc: 'إدارة المخازن والتحويلات والتسويات والجرد' },
      { name: 'مشاهدة فقط', desc: 'استعراض التقارير والشاشات دون تعديل' },
    ];

    const roleIds: Record<string, number> = {};
    for (const r of roleDefs) {
      const res = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run(r.name, r.desc);
      roleIds[r.name] = Number(res.lastInsertRowid);
    }

    const insertPerm = db.prepare(`
      INSERT INTO permissions (role_id, module_key, can_view, can_add, can_edit, can_delete, can_approve, can_print, can_export, can_view_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const mod of APP_MODULES) {
      insertPerm.run(roleIds['مدير النظام'], mod.key, 1, 1, 1, 1, 1, 1, 1, 1);
      const accWrite = mod.key !== 'users' && mod.key !== 'settings' ? 1 : 0;
      insertPerm.run(roleIds['مدير حسابات'], mod.key, 1, accWrite, accWrite, 0, accWrite, 1, 1, 1);
      const sellerAllowed = ['dashboard', 'sales', 'sales_returns', 'accounts'].includes(mod.key) ? 1 : 0;
      insertPerm.run(roleIds['بائع'], mod.key, sellerAllowed, sellerAllowed, 0, 0, sellerAllowed, sellerAllowed, 0, 0);
      const purAllowed = ['dashboard', 'definitions', 'purchases', 'purchase_returns', 'accounts'].includes(mod.key) ? 1 : 0;
      insertPerm.run(roleIds['مشتريات'], mod.key, purAllowed, purAllowed, purAllowed, 0, purAllowed, purAllowed, 1, 1);
      const whAllowed = ['dashboard', 'definitions', 'inventory', 'reports'].includes(mod.key) ? 1 : 0;
      insertPerm.run(roleIds['أمين مخزن'], mod.key, whAllowed, whAllowed, whAllowed, 0, whAllowed, whAllowed, 1, 0);
      insertPerm.run(roleIds['مشاهدة فقط'], mod.key, 1, 0, 0, 0, 0, 1, 0, 0);
    }

    const adminHash = bcrypt.hashSync('1234', 10);
    const sellerHash = bcrypt.hashSync('1234', 10);
    db.prepare(
      `INSERT INTO users (username, full_name, password_hash, role_id, allow_negative_stock, allow_price_change)
       VALUES (?, ?, ?, ?, 0, 1)`
    ).run('Admin', 'مدير النظام الرئيسي', adminHash, roleIds['مدير النظام']);
    db.prepare(
      `INSERT INTO users (username, full_name, password_hash, role_id, allow_negative_stock, allow_price_change)
       VALUES (?, ?, ?, ?, 0, 0)`
    ).run('Cashier1', 'كاشير الصالة', sellerHash, roleIds['بائع']);

    const defaultSettings: Array<[string, string]> = [
      ['company_name', 'Mina Net'],
      ['company_subtitle', 'لإدارة المحلات التجارية والمخازن والشركات — المبرمج: اسامه جرجس'],
      ['company_phone', '01153672084'],
      ['company_address', 'القاهرة - مدينة نصر - المنطقة التجارية'],
      ['company_tax_no', '300-450-112'],
      ['company_logo', ''],
      ['currency', 'ج.م.'],
      ['tax_enabled', '0'],
      ['tax_rate', '14'],
      ['allow_negative_stock_global', '0'],
      ['default_print_format', '80MM'],
      ['auto_backup_enabled', '1'],
      ['auto_backup_time', '23:00'],
      ['auto_backup_dir', ''],
      ['auto_backup_last_date', ''],
      ['cost_method', 'MOVING_AVG'],
      ['pos_auto_merge_scan', '1'],
      ['pos_scan_beep', '1'],
      ['pos_auto_print_on_save', '0'],
      ['pos_cash_drawer_auto', '1'],
      ['pos_printer_mode', 'BROWSER_PRINT'],
      ['pos_printer_target', ''],
      ['pos_touch_panel_default', '1'],
      ['customer_display_auto', '1'],
      ['customer_display_welcome', 'أهلاً وسهلاً بكم — نتمنى لكم تسوقاً ممتعاً'],
      ['customer_display_ticker', 'عروض وخصومات يومية مستمرة · اسأل الكاشير عن عروض اليوم'],
      ['customer_display_qr_enabled', '1'],
      ['customer_display_qr_label', 'امسح الكود للدفع عبر إنستاباي أو تقييم الخدمة'],
      ['customer_display_qr_value', 'https://wa.me/201153672084'],
      ['customer_display_slides_json', '[]'],
    ];
    const insertSet = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of defaultSettings) insertSet.run(k, v);

    const catFlash = Number(db.prepare('INSERT INTO categories (name) VALUES (?)').run('فلاشات').lastInsertRowid);
    const catAcc = Number(db.prepare('INSERT INTO categories (name) VALUES (?)').run('إكسسوارات كمبيوتر').lastInsertRowid);
    const catStorage = Number(db.prepare('INSERT INTO categories (name) VALUES (?)').run('وحدات تخزين').lastInsertRowid);

    const unitPiece = Number(db.prepare('INSERT INTO units (name) VALUES (?)').run('قطعة').lastInsertRowid);
    const unitBox = Number(db.prepare('INSERT INTO units (name) VALUES (?)').run('علبة').lastInsertRowid);
    db.prepare('INSERT INTO units (name) VALUES (?)').run('كرتونة');

    const whMain = Number(
      db.prepare('INSERT INTO warehouses (name, location, is_default) VALUES (?, ?, 1)').run('مخزن رئيسي', 'المقر الرئيسي').lastInsertRowid
    );
    const whBranch = Number(
      db.prepare('INSERT INTO warehouses (name, location, is_default) VALUES (?, ?, 0)').run('مخزن الفرع الثاني', 'فرع وسط البلد').lastInsertRowid
    );

    const cbMain = Number(
      db.prepare("INSERT INTO cashboxes (name, type, opening_balance, current_balance, is_default) VALUES ('الخزينة الرئيسية', 'CASH', 25000, 25000, 1)").run().lastInsertRowid
    );
    db.prepare("INSERT INTO cashboxes (name, type, account_number, opening_balance, current_balance, is_default) VALUES ('حساب البنك الأهلي', 'BANK', 'EG-1029384756', 85000, 85000, 0)").run();

    db.prepare(
      `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
       VALUES (?, ?, 'OPENING', 'OPN-CB-1', 25000, 0, 25000, 'رصيد افتتاحي للخزينة الرئيسية', 1)`
    ).run(new Date().toISOString().slice(0, 10), cbMain);

    const expTypes = ['إيجار', 'كهرباء ومياه', 'رواتب وأجور', 'نقل ومشال', 'صيانة وتشغيل', 'مصروفات نثرية'];
    for (const et of expTypes) {
      db.prepare("INSERT INTO expense_revenue_types (name, kind) VALUES (?, 'EXPENSE')").run(et);
    }
    const revTypes = ['إيرادات خدمات', 'خصم مكتسب', 'إيرادات متنوعة'];
    for (const rt of revTypes) {
      db.prepare("INSERT INTO expense_revenue_types (name, kind) VALUES (?, 'REVENUE')").run(rt);
    }

    db.prepare(
      `INSERT INTO customers (code, name, phone, address, opening_balance, current_balance, credit_limit, is_walkin)
       VALUES ('C-000', 'عميل نقدي', '', '', 0, 0, 0, 1)`
    ).run();
    const custMahmoud = Number(
      db.prepare(
        `INSERT INTO customers (code, name, phone, address, opening_balance, current_balance, credit_limit, is_walkin)
         VALUES ('C-001', 'محمود', '01001234567', 'مدينة نصر - القاهرة', 6000, 6000, 25000, 0)`
      ).run().lastInsertRowid
    );
    db.prepare(
      `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
       VALUES (?, 'CUSTOMER', ?, 'OPENING', 'OPN-C-001', 6000, 0, 6000, 'رصيد افتتاحي للعميل', 1)`
    ).run(new Date().toISOString().slice(0, 10), custMahmoud);

    const supNile = Number(
      db.prepare(
        `INSERT INTO suppliers (code, name, phone, address, opening_balance, current_balance)
         VALUES ('S-001', 'شركة النيل للتكنولوجيا', '01112223334', 'المهندسين - الجيزة', 0, 0)`
      ).run().lastInsertRowid
    );
    db.prepare(
      `INSERT INTO suppliers (code, name, phone, address, opening_balance, current_balance)
       VALUES ('S-002', 'مؤسسة الشرق الأوسط للاستيراد', '01223334445', 'العتبة - القاهرة', 0, 0)`
    ).run();

    db.prepare("INSERT INTO sales_reps (name, phone, commission_rate) VALUES ('مندوب المبيعات الرئيسي', '01099887766', 1.5)").run();

    const sampleProducts = [
      { code: '1.5', name: 'فلاشة سان دسك 32 جيجا', barcode: '622100001005', cat: catFlash, cost: 100, sale: 150, wholesale: 135, special: 140, qtyMain: 28, qtyBranch: 10 },
      { code: '1002', name: 'فلاشة كينجستون 64 جيجا USB 3.2', barcode: '622100001006', cat: catFlash, cost: 165, sale: 230, wholesale: 205, special: 215, qtyMain: 20, qtyBranch: 5 },
      { code: '1003', name: 'ماوس لاسلكي لوجيتك M185', barcode: '622100001007', cat: catAcc, cost: 280, sale: 390, wholesale: 345, special: 360, qtyMain: 15, qtyBranch: 4 },
      { code: '1004', name: 'كيبورد ميكانيكال احترافي عربي/إنجليزي', barcode: '622100001008', cat: catAcc, cost: 520, sale: 720, wholesale: 650, special: 680, qtyMain: 8, qtyBranch: 2 },
      { code: '1005', name: 'هارد خارجي ويسترن ديجيتال 1 تيرا', barcode: '622100001009', cat: catStorage, cost: 1850, sale: 2350, wholesale: 2150, special: 2250, qtyMain: 4, qtyBranch: 1 },
    ];

    const today = new Date().toISOString().slice(0, 10);
    const adjRes = db
      .prepare(
        `INSERT INTO stock_adjustments (doc_number, doc_date, warehouse_id, doc_type, reason, user_id)
         VALUES ('OPN-0001', ?, ?, 'OPENING', 'أرصدة بداية المدة الافتتاحية', 1)`
      )
      .run(today, whMain);
    const adjId = Number(adjRes.lastInsertRowid);

    for (const p of sampleProducts) {
      const pRes = db
        .prepare(
          `INSERT INTO products (code, name, barcode, category_id, base_unit_id, purchase_price, last_cost, avg_cost, sale_price, wholesale_price, special_price, min_stock, reorder_level)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 5)`
        )
        .run(p.code, p.name, p.barcode, p.cat, unitPiece, p.cost, p.cost, p.cost, p.sale, p.wholesale, p.special);
      const pid = Number(pRes.lastInsertRowid);

      db.prepare('INSERT INTO barcodes (product_id, barcode, unit_id) VALUES (?, ?, ?)').run(pid, p.barcode, unitPiece);
      db.prepare(
        'INSERT INTO unit_conversions (product_id, unit_id, conversion_factor, sale_price, wholesale_price) VALUES (?, ?, 10, ?, ?)'
      ).run(pid, unitBox, p.sale * 9.5, p.wholesale * 9.5);

      db.prepare('INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)').run(whMain, pid, p.qtyMain);
      db.prepare('INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)').run(whBranch, pid, p.qtyBranch);

      db.prepare(
        `INSERT INTO stock_adjustment_items (adjustment_id, product_id, book_qty, actual_qty, diff_qty, unit_cost)
         VALUES (?, ?, 0, ?, ?, ?)`
      ).run(adjId, pid, p.qtyMain, p.qtyMain, p.cost);

      db.prepare(
        `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
         VALUES (?, ?, ?, 'OPENING', 'STOCK_ADJUSTMENT', ?, 'OPN-0001', ?, 0, ?, ?, 'رصيد افتتاحي', 1)`
      ).run(today, pid, whMain, adjId, p.qtyMain, p.cost, p.qtyMain);

      db.prepare(
        `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
         VALUES (?, ?, ?, 'OPENING', 'STOCK_ADJUSTMENT', ?, 'OPN-0001', ?, 0, ?, ?, 'رصيد افتتاحي فرع 2', 1)`
      ).run(today, pid, whBranch, adjId, p.qtyBranch, p.cost, p.qtyBranch);
    }

    const purRes = db
      .prepare(
        `INSERT INTO purchase_invoices (invoice_number, supplier_invoice_no, invoice_date, supplier_id, warehouse_id, payment_type, cashbox_id, subtotal, net_total, paid_amount, remaining_amount, notes, user_id)
         VALUES ('PUR-0001', 'SUP-881', ?, ?, ?, 'CASH', ?, 1000, 1000, 1000, 0, 'فاتورة توريد أولية', 1)`
      )
      .run(today, supNile, whMain, cbMain);
    const purId = Number(purRes.lastInsertRowid);
    db.prepare(
      `INSERT INTO purchase_items (purchase_invoice_id, product_id, unit_id, conversion_factor, quantity, base_quantity, unit_price, line_total, effective_base_cost)
       VALUES (?, 1, ?, 1, 10, 10, 100, 1000, 100)`
    ).run(purId, unitPiece);

    db.prepare(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, doc_number, notes)
       VALUES (1, 'Admin', 'CREATE', 'SYSTEM', '1', 'INIT-001', 'تهيئة قاعدة البيانات الابتدائية للنظام')`
    ).run();
  });

  tx();
}

export function resetCleanBusinessDatabase(db: DbLike) {
  const tx = db.transaction(() => {
    const tablesToClear = [
      'purchase_return_items',
      'purchase_returns',
      'sales_return_items',
      'sales_returns',
      'purchase_items',
      'purchase_invoices',
      'sales_items',
      'sales_invoices',
      'stock_adjustment_items',
      'stock_adjustments',
      'warehouse_transfer_items',
      'warehouse_transfers',
      'stock_movements',
      'expenses_revenues',
      'receipts_payments',
      'cashbox_transfers',
      'cashbox_movements',
      'account_transactions',
      'checks_installments',
      'import_errors',
      'import_jobs',
      'audit_logs',
      'warehouse_stock',
      'barcodes',
      'unit_conversions',
      'products',
    ];
    for (const t of tablesToClear) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    db.prepare('DELETE FROM customers WHERE is_walkin = 0').run();
    db.prepare('DELETE FROM suppliers').run();
    db.prepare('UPDATE cashboxes SET opening_balance = 0, current_balance = 0').run();
    db.prepare(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, doc_number, notes)
       VALUES (1, 'Admin', 'DELETE', 'SYSTEM', 'RESET', 'تصفير البيانات التجريبية والبدء بقاعدة بيانات نظيفة')`
    ).run();
  });
  tx();
}

export function ensureBackupScheduleSettings(db: DbLike) {
  const defaults: Array<[string, string]> = [
    ['auto_backup_enabled', '1'],
    ['auto_backup_time', '23:00'],
    ['auto_backup_dir', ''],
    ['auto_backup_last_date', ''],
    ['pos_auto_merge_scan', '1'],
    ['pos_scan_beep', '1'],
    ['pos_auto_print_on_save', '0'],
    ['pos_cash_drawer_auto', '1'],
    ['pos_printer_mode', 'BROWSER_PRINT'],
    ['pos_printer_target', ''],
    ['pos_touch_panel_default', '1'],
    ['customer_display_auto', '1'],
    ['customer_display_welcome', 'أهلاً وسهلاً بكم — نتمنى لكم تسوقاً ممتعاً'],
    ['customer_display_ticker', 'عروض وخصومات يومية مستمرة · اسأل الكاشير عن عروض اليوم'],
    ['customer_display_qr_enabled', '1'],
    ['customer_display_qr_label', 'امسح الكود للدفع عبر إنستاباي أو تقييم الخدمة'],
    ['customer_display_qr_value', 'https://wa.me/201153672084'],
    ['customer_display_slides_json', '[]'],
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of defaults) stmt.run(k, v);
}

export function getLocalDateString(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getLocalTimeHHMM(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatBackupDateTimeFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.db`;
}

