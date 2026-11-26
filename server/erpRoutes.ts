import express from 'express';
import bcrypt from 'bcryptjs';
import { getDb, APP_MODULES } from './db.ts';
import {
  assertTxLicenseWitness,
  evaluateLicenseState,
  requireOperationalWitness,
} from './licenseGuard.ts';
import type Database from 'better-sqlite3';

export function logAudit(
  db: Database.Database,
  userId: number,
  username: string,
  action: string,
  entityType: string,
  entityId: string | number,
  docNumber: string,
  beforeObj: unknown,
  afterObj: unknown,
  notes = ''
) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, doc_number, before_json, after_json, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    username,
    action,
    entityType,
    String(entityId ?? ''),
    docNumber,
    beforeObj ? JSON.stringify(beforeObj) : '',
    afterObj ? JSON.stringify(afterObj) : '',
    notes
  );
}

export function getLicenseState(db: Database.Database) {
  return evaluateLicenseState(db);
}

export const requireOperationalLicense = requireOperationalWitness;

export function nextDocNumber(db: Database.Database, table: string, column: string, prefix: string): string {
  const row = db
    .prepare(`SELECT ${column} as num FROM ${table} WHERE ${column} LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}-%`) as { num: string } | undefined;
  let next = 1;
  if (row) {
    const parts = row.num.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    next = Number.isNaN(lastNum) ? 1 : lastNum + 1;
  }
  const checkStmt = db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`);
  let candidate = `${prefix}-${String(next).padStart(4, '0')}`;
  while (checkStmt.get(candidate)) {
    next++;
    candidate = `${prefix}-${String(next).padStart(4, '0')}`;
  }
  return candidate;
}

export function getActor(req: express.Request): { userId: number; username: string } {
  const uid = Number(req.headers['x-user-id'] || req.body?.user_id || 1);
  const db = getDb();
  const u = db.prepare('SELECT id, username FROM users WHERE id = ?').get(uid) as { id: number; username: string } | undefined;
  return u ? { userId: u.id, username: u.username } : { userId: 1, username: 'Admin' };
}

export function createErpRouter(): express.Router {
  const router = express.Router();

  // Bootstrap & Auth
  router.get('/bootstrap', (req, res) => {
    const db = getDb();
    const settingsRows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = {};
    for (const r of settingsRows) settings[r.key] = r.value;

    const users = db
      .prepare(
        `SELECT u.id, u.username, u.full_name, u.role_id, u.is_active, u.allow_negative_stock, u.allow_price_change, r.name as role_name
         FROM users u JOIN roles r ON u.role_id = r.id WHERE u.is_active = 1`
      )
      .all();

    const activeUserId = Number(req.headers['x-user-id'] || 1);
    const currentUser =
      db
        .prepare(
          `SELECT u.id, u.username, u.full_name, u.role_id, u.allow_negative_stock, u.allow_price_change, r.name as role_name
           FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`
        )
        .get(activeUserId) || users[0];

    const perms = currentUser
      ? db.prepare('SELECT * FROM permissions WHERE role_id = ?').all((currentUser as { role_id: number }).role_id)
      : [];

    const license = getLicenseState(db);
    const safeSettings = license.is_operational
      ? settings
      : {
          company_name: settings.company_name || 'Mina Net',
          company_subtitle: settings.company_subtitle || '',
          company_phone: settings.company_phone || '01153672084',
          currency: settings.currency || 'ج.م.',
        };

    res.json({
      settings: safeSettings,
      users: [],
      currentUser: license.is_operational ? currentUser : null,
      permissions: license.is_operational ? perms : [],
      modules: APP_MODULES,
      license,
    });
  });

  router.post('/auth/login', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { username, password } = req.body as { username: string; password: string };
    const user = db
      .prepare(
        `SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ? AND u.is_active = 1`
      )
      .get(username) as Record<string, unknown> | undefined;

    if (!user || !bcrypt.compareSync(String(password || ''), String(user.password_hash))) {
      res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      return;
    }

    const permissions = db.prepare('SELECT * FROM permissions WHERE role_id = ?').all(user.role_id);
    logAudit(db, Number(user.id), String(user.username), 'LOGIN', 'USER', String(user.id), '', null, null, 'تسجيل دخول للنظام');

    const { password_hash: _ph, ...safeUser } = user;
    res.json({ user: safeUser, permissions });
  });

  // Dashboard KPIs
  router.get('/dashboard', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const monthPrefix = today.slice(0, 7);

    const salesToday = db
      .prepare("SELECT COALESCE(SUM(net_total), 0) as total, COUNT(*) as count FROM sales_invoices WHERE status = 'APPROVED' AND substr(invoice_date, 1, 10) = ?")
      .get(today) as { total: number; count: number };

    const salesMonth = db
      .prepare("SELECT COALESCE(SUM(net_total), 0) as total, COALESCE(SUM(gross_profit), 0) as profit, COUNT(*) as count FROM sales_invoices WHERE status = 'APPROVED' AND substr(invoice_date, 1, 7) = ?")
      .get(monthPrefix) as { total: number; profit: number; count: number };

    const salesReturnsMonth = db
      .prepare("SELECT COALESCE(SUM(total_amount), 0) as total, COALESCE(SUM(total_cost_reversed), 0) as cost_rev FROM sales_returns WHERE substr(return_date, 1, 7) = ?")
      .get(monthPrefix) as { total: number; cost_rev: number };

    const purchasesToday = db
      .prepare("SELECT COALESCE(SUM(net_total), 0) as total, COUNT(*) as count FROM purchase_invoices WHERE status = 'APPROVED' AND substr(invoice_date, 1, 10) = ?")
      .get(today) as { total: number; count: number };

    const purchasesMonth = db
      .prepare("SELECT COALESCE(SUM(net_total), 0) as total, COUNT(*) as count FROM purchase_invoices WHERE status = 'APPROVED' AND substr(invoice_date, 1, 7) = ?")
      .get(monthPrefix) as { total: number; count: number };

    const expensesMonth = db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses_revenues WHERE kind = 'EXPENSE' AND substr(voucher_date, 1, 7) = ?")
      .get(monthPrefix) as { total: number };

    const revenuesMonth = db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses_revenues WHERE kind = 'REVENUE' AND substr(voucher_date, 1, 7) = ?")
      .get(monthPrefix) as { total: number };

    const inventoryValuation = db
      .prepare(
        `SELECT COALESCE(SUM(ws.quantity * p.avg_cost), 0) as cost_value, COALESCE(SUM(ws.quantity), 0) as total_units
         FROM warehouse_stock ws JOIN products p ON ws.product_id = p.id WHERE p.is_active = 1`
      )
      .get() as { cost_value: number; total_units: number };

    const customerReceivables = db
      .prepare('SELECT COALESCE(SUM(CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END), 0) as total FROM customers WHERE is_active = 1')
      .get() as { total: number };

    const supplierPayables = db
      .prepare('SELECT COALESCE(SUM(CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END), 0) as total FROM suppliers WHERE is_active = 1')
      .get() as { total: number };

    const cashboxesTotal = db
      .prepare('SELECT COALESCE(SUM(current_balance), 0) as total FROM cashboxes WHERE is_active = 1')
      .get() as { total: number };

    const counts = {
      products: (db.prepare('SELECT COUNT(*) as c FROM products WHERE is_active = 1').get() as { c: number }).c,
      customers: (db.prepare('SELECT COUNT(*) as c FROM customers WHERE is_active = 1 AND is_walkin = 0').get() as { c: number }).c,
      suppliers: (db.prepare('SELECT COUNT(*) as c FROM suppliers WHERE is_active = 1').get() as { c: number }).c,
    };

    const lowStock = db
      .prepare(
        `SELECT p.id, p.code, p.name, p.reorder_level, COALESCE(SUM(ws.quantity), 0) as total_qty
         FROM products p LEFT JOIN warehouse_stock ws ON p.id = ws.product_id
         WHERE p.is_active = 1
         GROUP BY p.id
         HAVING total_qty <= p.reorder_level
         ORDER BY total_qty ASC LIMIT 10`
      )
      .all();

    const topProducts = db
      .prepare(
        `SELECT p.id, p.code, p.name, COALESCE(SUM(si.base_quantity), 0) as sold_qty, COALESCE(SUM(si.line_total), 0) as sold_total
         FROM sales_items si
         JOIN sales_invoices inv ON si.sales_invoice_id = inv.id
         JOIN products p ON si.product_id = p.id
         WHERE inv.status = 'APPROVED'
         GROUP BY p.id
         ORDER BY sold_total DESC LIMIT 6`
      )
      .all();

    const topStockProducts = db
      .prepare(
        `SELECT p.id, p.code, p.name, COALESCE(SUM(ws.quantity), 0) as stock_qty,
          COALESCE(SUM(ws.quantity), 0) * CASE WHEN p.avg_cost > 0 THEN p.avg_cost ELSE p.sale_price END as stock_value
         FROM products p
         LEFT JOIN warehouse_stock ws ON p.id = ws.product_id
         WHERE p.is_active = 1
         GROUP BY p.id
         HAVING stock_value > 0
         ORDER BY stock_value DESC LIMIT 5`
      )
      .all();

    const recentInvoices = db
      .prepare(
        `SELECT si.id, si.invoice_number, si.invoice_date, si.net_total, si.paid_amount, si.remaining_amount, si.status, si.payment_type,
          c.name as customer_name
         FROM sales_invoices si
         JOIN customers c ON si.customer_id = c.id
         ORDER BY si.id DESC LIMIT 6`
      )
      .all();

    const invoiceSummary = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN paid_amount ELSE 0 END), 0) as total_paid,
          COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN remaining_amount ELSE 0 END), 0) as total_remaining,
          COUNT(CASE WHEN status = 'APPROVED' AND remaining_amount <= 0 THEN 1 END) as count_paid,
          COUNT(CASE WHEN status = 'APPROVED' AND remaining_amount > 0 THEN 1 END) as count_credit,
          COUNT(*) as count_all
         FROM sales_invoices`
      )
      .get();

    // Daily chart series for last 14 days
    const dailySeries = db
      .prepare(
        `SELECT d as day,
          COALESCE((SELECT SUM(net_total) FROM sales_invoices WHERE status = 'APPROVED' AND substr(invoice_date, 1, 10) = d), 0) as sales,
          COALESCE((SELECT SUM(net_total) FROM purchase_invoices WHERE status = 'APPROVED' AND substr(invoice_date, 1, 10) = d), 0) as purchases
         FROM (
           SELECT date('now', 'localtime', '-' || n || ' days') as d
           FROM (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13)
         )
         ORDER BY day ASC`
      )
      .all();

    const netReturnImpact = salesReturnsMonth.total - salesReturnsMonth.cost_rev;
    const netProfitMonth = salesMonth.profit - netReturnImpact - expensesMonth.total + revenuesMonth.total;

    res.json({
      salesToday,
      salesMonth,
      purchasesToday,
      purchasesMonth,
      expensesMonth: expensesMonth.total,
      revenuesMonth: revenuesMonth.total,
      netProfitMonth,
      inventoryValuation,
      customerReceivables: customerReceivables.total,
      supplierPayables: supplierPayables.total,
      cashboxesTotal: cashboxesTotal.total,
      counts,
      lowStock,
      topProducts,
      topStockProducts,
      recentInvoices,
      invoiceSummary,
      dailySeries,
    });
  });

  // Reference Definitions (Categories, Units, Warehouses, Cashboxes, ExpenseTypes, SalesReps)
  router.get('/definitions/all', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json({
      categories: db.prepare('SELECT * FROM categories ORDER BY id DESC').all(),
      units: db.prepare('SELECT * FROM units ORDER BY id ASC').all(),
      warehouses: db.prepare('SELECT * FROM warehouses ORDER BY is_default DESC, id ASC').all(),
      cashboxes: db.prepare('SELECT * FROM cashboxes ORDER BY is_default DESC, id ASC').all(),
      expense_revenue_types: db.prepare('SELECT * FROM expense_revenue_types ORDER BY kind, name').all(),
      sales_reps: db.prepare('SELECT * FROM sales_reps ORDER BY id ASC').all(),
      customers: db.prepare('SELECT * FROM customers ORDER BY is_walkin DESC, id DESC').all(),
      suppliers: db.prepare('SELECT * FROM suppliers ORDER BY id DESC').all(),
    });
  });

  router.post('/categories', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const { name, notes } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'اسم الفئة مطلوب' });
      const info = db.prepare('INSERT INTO categories (name, notes) VALUES (?, ?)').run(name.trim(), notes || '');
      res.json({ id: info.lastInsertRowid, name: name.trim(), notes: notes || '' });
    } catch (e: unknown) {
      const msg = (e as Error).message || '';
      res.status(400).json({ error: msg.includes('UNIQUE') ? 'اسم الفئة مسجل مسبقًا' : msg || 'تعذر إضافة الفئة' });
    }
  });

  router.delete('/categories/:id', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const used = (db.prepare('SELECT COUNT(*) as c FROM products WHERE category_id = ?').get(req.params.id) as { c: number }).c;
    if (used > 0) return res.status(400).json({ error: 'لا يمكن حذف فئة مرتبطة بأصناف' });
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/units', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'اسم الوحدة مطلوب' });
      const info = db.prepare('INSERT INTO units (name) VALUES (?)').run(name.trim());
      res.json({ id: info.lastInsertRowid, name: name.trim() });
    } catch (e: unknown) {
      const msg = (e as Error).message || '';
      res.status(400).json({ error: msg.includes('UNIQUE') ? 'اسم الوحدة مسجل مسبقًا' : msg || 'تعذر إضافة الوحدة' });
    }
  });

  router.post('/warehouses', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const { name, location } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'اسم المخزن مطلوب' });
      const info = db.prepare('INSERT INTO warehouses (name, location) VALUES (?, ?)').run(name.trim(), location || '');
      res.json({ id: info.lastInsertRowid, name: name.trim(), location: location || '' });
    } catch (e: unknown) {
      const msg = (e as Error).message || '';
      res.status(400).json({ error: msg.includes('UNIQUE') ? 'اسم المخزن مسجل مسبقًا' : msg || 'تعذر إضافة المخزن' });
    }
  });

  router.post('/cashboxes', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const { name, type, account_number, opening_balance } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'اسم الخزينة / الحساب مطلوب' });
      const bal = Number(opening_balance || 0);
      if (Number.isNaN(bal)) return res.status(400).json({ error: 'الرصيد الافتتاحي غير صالح' });
      const actor = getActor(req);
      const tx = db.transaction(() => {
        const info = db
          .prepare('INSERT INTO cashboxes (name, type, account_number, opening_balance, current_balance) VALUES (?, ?, ?, ?, ?)')
          .run(name.trim(), type || 'CASH', account_number || '', bal, bal);
        const id = Number(info.lastInsertRowid);
        if (bal !== 0) {
          db.prepare(
            `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
             VALUES (?, ?, 'OPENING', ?, ?, 0, ?, 'رصيد افتتاحي', ?)`
          ).run(new Date().toISOString().slice(0, 10), id, `OPN-CB-${id}`, bal, bal, actor.userId);
        }
        return id;
      });
      res.json({ id: tx() });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message || 'تعذر إضافة الخزينة' });
    }
  });

  router.post('/expense-types', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const { name, kind } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'اسم البند مطلوب' });
      const info = db.prepare('INSERT INTO expense_revenue_types (name, kind) VALUES (?, ?)').run(name.trim(), kind || 'EXPENSE');
      res.json({ id: info.lastInsertRowid });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message || 'تعذر إضافة البند' });
    }
  });

  // Customers & Suppliers
  router.post('/customers', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { name, phone, address, tax_number, opening_balance, credit_limit, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'اسم العميل مطلوب' });
    const actor = getActor(req);
    const bal = Number(opening_balance || 0);

    const tx = db.transaction(() => {
      const code = req.body.code?.trim() || nextDocNumber(db, 'customers', 'code', 'C');
      const info = db
        .prepare(
          `INSERT INTO customers (code, name, phone, address, tax_number, opening_balance, current_balance, credit_limit, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(code, name.trim(), phone || '', address || '', tax_number || '', bal, bal, Number(credit_limit || 0), notes || '');
      const id = Number(info.lastInsertRowid);
      if (bal !== 0) {
        db.prepare(
          `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
           VALUES (?, 'CUSTOMER', ?, 'OPENING', ?, ?, ?, ?, 'رصيد افتتاحي للعميل', ?)`
        ).run(new Date().toISOString().slice(0, 10), id, `OPN-${code}`, bal > 0 ? bal : 0, bal < 0 ? Math.abs(bal) : 0, bal, actor.userId);
      }
      logAudit(db, actor.userId, actor.username, 'CREATE', 'CUSTOMER', id, code, null, req.body, 'إضافة عميل');
      return id;
    });
    res.json({ id: tx() });
  });

  router.put('/customers/:id', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { name, phone, address, tax_number, credit_limit, notes, is_active } = req.body;
    const before = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!before) return res.status(404).json({ error: 'العميل غير موجود' });
    db.prepare(
      `UPDATE customers SET name = ?, phone = ?, address = ?, tax_number = ?, credit_limit = ?, notes = ?, is_active = ? WHERE id = ?`
    ).run(name, phone || '', address || '', tax_number || '', Number(credit_limit || 0), notes || '', is_active ?? 1, req.params.id);
    const actor = getActor(req);
    logAudit(db, actor.userId, actor.username, 'UPDATE', 'CUSTOMER', req.params.id, '', before, req.body, 'تعديل بيانات عميل');
    res.json({ ok: true });
  });

  router.post('/suppliers', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { name, phone, address, tax_number, opening_balance, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'اسم المورد مطلوب' });
    const actor = getActor(req);
    const bal = Number(opening_balance || 0);

    const tx = db.transaction(() => {
      const code = req.body.code?.trim() || nextDocNumber(db, 'suppliers', 'code', 'S');
      const info = db
        .prepare(
          `INSERT INTO suppliers (code, name, phone, address, tax_number, opening_balance, current_balance, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(code, name.trim(), phone || '', address || '', tax_number || '', bal, bal, notes || '');
      const id = Number(info.lastInsertRowid);
      if (bal !== 0) {
        db.prepare(
          `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
           VALUES (?, 'SUPPLIER', ?, 'OPENING', ?, ?, ?, ?, 'رصيد افتتاحي للمورد', ?)`
        ).run(new Date().toISOString().slice(0, 10), id, `OPN-${code}`, bal < 0 ? Math.abs(bal) : 0, bal > 0 ? bal : 0, bal, actor.userId);
      }
      logAudit(db, actor.userId, actor.username, 'CREATE', 'SUPPLIER', id, code, null, req.body, 'إضافة مورد');
      return id;
    });
    res.json({ id: tx() });
  });

  router.put('/suppliers/:id', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { name, phone, address, tax_number, notes, is_active } = req.body;
    db.prepare(`UPDATE suppliers SET name = ?, phone = ?, address = ?, tax_number = ?, notes = ?, is_active = ? WHERE id = ?`).run(
      name,
      phone || '',
      address || '',
      tax_number || '',
      notes || '',
      is_active ?? 1,
      req.params.id
    );
    res.json({ ok: true });
  });

  // Products
  router.get('/products', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { q, category_id, warehouse_id, include_inactive } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name, u.name as unit_name,
        COALESCE((SELECT SUM(ws.quantity) FROM warehouse_stock ws WHERE ws.product_id = p.id ${warehouse_id ? 'AND ws.warehouse_id = ?' : ''}), 0) as stock_qty
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN units u ON p.base_unit_id = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (warehouse_id) params.push(Number(warehouse_id));
    if (!include_inactive) sql += ' AND p.is_active = 1';
    if (category_id) {
      sql += ' AND p.category_id = ?';
      params.push(Number(category_id));
    }
    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      sql += ' AND (p.code LIKE ? OR p.name LIKE ? OR p.alt_name LIKE ? OR p.barcode LIKE ? OR EXISTS (SELECT 1 FROM barcodes b WHERE b.product_id = p.id AND b.barcode LIKE ?))';
      params.push(term, term, term, term, term);
    }
    sql += ' ORDER BY p.id DESC';
    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    const convStmt = db.prepare(
      'SELECT uc.*, u.name as unit_name FROM unit_conversions uc JOIN units u ON uc.unit_id = u.id WHERE uc.product_id = ?'
    );
    const barStmt = db.prepare('SELECT * FROM barcodes WHERE product_id = ?');
    const whStockStmt = db.prepare(
      'SELECT ws.warehouse_id, w.name as warehouse_name, ws.quantity FROM warehouse_stock ws JOIN warehouses w ON ws.warehouse_id = w.id WHERE ws.product_id = ?'
    );

    const enriched = rows.map((p) => ({
      ...p,
      conversions: convStmt.all(p.id),
      extra_barcodes: barStmt.all(p.id),
      warehouse_stocks: whStockStmt.all(p.id),
    }));

    res.json(enriched);
  });

  router.get('/products/lookup', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const q = String(req.query.q || '').trim();
    const warehouseId = Number(req.query.warehouse_id || 1);
    if (!q) return res.json([]);

    const exact = db
      .prepare(
        `SELECT p.*, u.name as unit_name, c.name as category_name,
          COALESCE((SELECT quantity FROM warehouse_stock WHERE product_id = p.id AND warehouse_id = ?), 0) as stock_qty
         FROM products p
         LEFT JOIN units u ON p.base_unit_id = u.id
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_active = 1 AND (p.code = ? OR p.barcode = ? OR EXISTS (SELECT 1 FROM barcodes b WHERE b.product_id = p.id AND b.barcode = ?))
         LIMIT 10`
      )
      .all(warehouseId, q, q, q) as Array<Record<string, unknown>>;

    const results =
      exact.length > 0
        ? exact
        : (db
            .prepare(
              `SELECT p.*, u.name as unit_name, c.name as category_name,
                COALESCE((SELECT quantity FROM warehouse_stock WHERE product_id = p.id AND warehouse_id = ?), 0) as stock_qty
               FROM products p
               LEFT JOIN units u ON p.base_unit_id = u.id
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE p.is_active = 1 AND (p.code LIKE ? OR p.name LIKE ? OR p.barcode LIKE ?)
               LIMIT 25`
            )
            .all(warehouseId, `%${q}%`, `%${q}%`, `%${q}%`) as Array<Record<string, unknown>>);

    const convStmt = db.prepare(
      'SELECT uc.*, u.name as unit_name FROM unit_conversions uc JOIN units u ON uc.unit_id = u.id WHERE uc.product_id = ?'
    );
    res.json(results.map((r) => ({ ...r, conversions: convStmt.all(r.id) })));
  });

  router.post('/products', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const {
      code,
      name,
      alt_name,
      barcode,
      category_id,
      brand,
      base_unit_id,
      purchase_price,
      sale_price,
      wholesale_price,
      special_price,
      min_stock,
      reorder_level,
      notes,
      image_url,
      opening_qty,
      opening_warehouse_id,
      extra_barcodes,
      conversions,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'اسم الصنف مطلوب' });

    const tx = db.transaction(() => {
      const finalCode = code?.trim() || String(Math.floor(1000 + Math.random() * 90000));
      const pPrice = Number(purchase_price || 0);
      const sPrice = Number(sale_price || 0);
      if (pPrice < 0 || sPrice < 0) throw new Error('لا يمكن إدخال أسعار سالبة');

      const info = db
        .prepare(
          `INSERT INTO products (code, name, alt_name, barcode, category_id, brand, base_unit_id, purchase_price, last_cost, avg_cost, sale_price, wholesale_price, special_price, min_stock, reorder_level, notes, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          finalCode,
          name.trim(),
          alt_name || '',
          barcode || '',
          category_id || null,
          brand || '',
          base_unit_id || 1,
          pPrice,
          pPrice,
          pPrice,
          sPrice,
          Number(wholesale_price || sPrice),
          Number(special_price || sPrice),
          Number(min_stock || 0),
          Number(reorder_level || 5),
          notes || '',
          image_url || ''
        );

      const pid = Number(info.lastInsertRowid);
      if (barcode) {
        db.prepare('INSERT OR IGNORE INTO barcodes (product_id, barcode, unit_id) VALUES (?, ?, ?)').run(pid, barcode, base_unit_id || 1);
      }
      if (Array.isArray(extra_barcodes)) {
        for (const eb of extra_barcodes) {
          if (String(eb).trim()) {
            db.prepare('INSERT OR IGNORE INTO barcodes (product_id, barcode, unit_id) VALUES (?, ?, ?)').run(pid, String(eb).trim(), base_unit_id || 1);
          }
        }
      }
      if (Array.isArray(conversions)) {
        for (const c of conversions) {
          if (c.unit_id && Number(c.conversion_factor) > 0) {
            db.prepare(
              'INSERT OR REPLACE INTO unit_conversions (product_id, unit_id, conversion_factor, sale_price, wholesale_price) VALUES (?, ?, ?, ?, ?)'
            ).run(pid, c.unit_id, Number(c.conversion_factor), Number(c.sale_price || 0), Number(c.wholesale_price || 0));
          }
        }
      }

      const initQty = Number(opening_qty || 0);
      if (initQty > 0) {
        const whId = Number(opening_warehouse_id || 1);
        const docNum = nextDocNumber(db, 'stock_adjustments', 'doc_number', 'OPN');
        const today = new Date().toISOString().slice(0, 10);
        const adjId = Number(
          db
            .prepare(
              `INSERT INTO stock_adjustments (doc_number, doc_date, warehouse_id, doc_type, reason, user_id)
               VALUES (?, ?, ?, 'OPENING', 'رصيد بداية مدة عند تعريف الصنف', ?)`
            )
            .run(docNum, today, whId, actor.userId).lastInsertRowid
        );
        db.prepare('INSERT INTO stock_adjustment_items (adjustment_id, product_id, book_qty, actual_qty, diff_qty, unit_cost) VALUES (?, ?, 0, ?, ?, ?)').run(
          adjId,
          pid,
          initQty,
          initQty,
          pPrice
        );
        db.prepare(
          `INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)
           ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`
        ).run(whId, pid, initQty);
        db.prepare(
          `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
           VALUES (?, ?, ?, 'OPENING', 'STOCK_ADJUSTMENT', ?, ?, ?, 0, ?, ?, 'رصيد افتتاحي', ?)`
        ).run(today, pid, whId, adjId, docNum, initQty, pPrice, initQty, actor.userId);
      }

      logAudit(db, actor.userId, actor.username, 'CREATE', 'PRODUCT', pid, finalCode, null, req.body, 'تعريف صنف جديد');
      return pid;
    });

    try {
      res.json({ id: tx() });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.put('/products/:id', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const id = Number(req.params.id);
    const before = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!before) return res.status(404).json({ error: 'الصنف غير موجود' });

    const {
      code,
      name,
      alt_name,
      barcode,
      category_id,
      brand,
      base_unit_id,
      purchase_price,
      sale_price,
      wholesale_price,
      special_price,
      min_stock,
      reorder_level,
      notes,
      image_url,
      is_active,
      extra_barcodes,
      conversions,
    } = req.body;

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE products SET code = ?, name = ?, alt_name = ?, barcode = ?, category_id = ?, brand = ?, base_unit_id = ?,
         purchase_price = ?, sale_price = ?, wholesale_price = ?, special_price = ?, min_stock = ?, reorder_level = ?, notes = ?, image_url = ?, is_active = ?
         WHERE id = ?`
      ).run(
        code,
        name,
        alt_name || '',
        barcode || '',
        category_id || null,
        brand || '',
        base_unit_id,
        Number(purchase_price || 0),
        Number(sale_price || 0),
        Number(wholesale_price || 0),
        Number(special_price || 0),
        Number(min_stock || 0),
        Number(reorder_level || 5),
        notes || '',
        image_url ?? (before as Record<string, unknown>).image_url ?? '',
        is_active ?? 1,
        id
      );

      if (Array.isArray(extra_barcodes)) {
        db.prepare('DELETE FROM barcodes WHERE product_id = ?').run(id);
        if (barcode) {
          db.prepare('INSERT OR IGNORE INTO barcodes (product_id, barcode, unit_id) VALUES (?, ?, ?)').run(id, barcode, base_unit_id);
        }
        for (const eb of extra_barcodes) {
          if (String(eb).trim()) {
            db.prepare('INSERT OR IGNORE INTO barcodes (product_id, barcode, unit_id) VALUES (?, ?, ?)').run(id, String(eb).trim(), base_unit_id);
          }
        }
      }

      if (Array.isArray(conversions)) {
        db.prepare('DELETE FROM unit_conversions WHERE product_id = ?').run(id);
        for (const c of conversions) {
          if (c.unit_id && Number(c.conversion_factor) > 0) {
            db.prepare(
              'INSERT INTO unit_conversions (product_id, unit_id, conversion_factor, sale_price, wholesale_price) VALUES (?, ?, ?, ?, ?)'
            ).run(id, c.unit_id, Number(c.conversion_factor), Number(c.sale_price || 0), Number(c.wholesale_price || 0));
          }
        }
      }

      logAudit(db, actor.userId, actor.username, 'UPDATE', 'PRODUCT', id, code, before, req.body, 'تعديل بيانات صنف');
    });

    try {
      tx();
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.patch('/products/:id/toggle', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const p = db.prepare('SELECT id, code, is_active FROM products WHERE id = ?').get(req.params.id) as { id: number; code: string; is_active: number } | undefined;
    if (!p) return res.status(404).json({ error: 'الصنف غير موجود' });
    const nextState = p.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(nextState, p.id);
    logAudit(db, actor.userId, actor.username, 'UPDATE', 'PRODUCT', p.id, p.code, { is_active: p.is_active }, { is_active: nextState }, nextState ? 'تفعيل صنف' : 'إيقاف صنف');
    res.json({ is_active: nextState });
  });

  // ==========================================
  // PURCHASE INVOICES (with Moving Weighted Average Cost)
  // ==========================================
  router.get('/purchases', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { from, to, supplier_id, q } = req.query;
    let sql = `
      SELECT pi.*, s.name as supplier_name, w.name as warehouse_name, u.username as user_name
      FROM purchase_invoices pi
      JOIN suppliers s ON pi.supplier_id = s.id
      JOIN warehouses w ON pi.warehouse_id = w.id
      JOIN users u ON pi.user_id = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (from) { sql += ' AND substr(pi.invoice_date, 1, 10) >= ?'; params.push(from); }
    if (to) { sql += ' AND substr(pi.invoice_date, 1, 10) <= ?'; params.push(to); }
    if (supplier_id) { sql += ' AND pi.supplier_id = ?'; params.push(Number(supplier_id)); }
    if (q) { sql += ' AND (pi.invoice_number LIKE ? OR s.name LIKE ? OR pi.supplier_invoice_no LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY pi.id DESC LIMIT 200';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/purchases/:id', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const inv = db
      .prepare(
        `SELECT pi.*, s.name as supplier_name, s.phone as supplier_phone, w.name as warehouse_name, u.username as user_name
         FROM purchase_invoices pi
         JOIN suppliers s ON pi.supplier_id = s.id
         JOIN warehouses w ON pi.warehouse_id = w.id
         JOIN users u ON pi.user_id = u.id
         WHERE pi.id = ?`
      )
      .get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'فاتورة الشراء غير موجودة' });

    const items = db
      .prepare(
        `SELECT pitem.*, p.code as product_code, p.name as product_name, u.name as unit_name,
          COALESCE((SELECT SUM(pri.quantity) FROM purchase_return_items pri WHERE pri.purchase_item_id = pitem.id), 0) as returned_qty
         FROM purchase_items pitem
         JOIN products p ON pitem.product_id = p.id
         JOIN units u ON pitem.unit_id = u.id
         WHERE pitem.purchase_invoice_id = ?`
      )
      .all(req.params.id);

    res.json({ invoice: inv, items });
  });

  router.post('/purchases', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const {
      invoice_number,
      supplier_invoice_no,
      invoice_date,
      supplier_id,
      warehouse_id,
      payment_type,
      cashbox_id,
      invoice_discount,
      tax_amount,
      extra_expenses,
      allocate_expenses,
      paid_amount,
      notes,
      items,
    } = req.body;

    if (!supplier_id || !warehouse_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'يرجى تحديد المورد والمخزن وإضافة صنف واحد على الأقل' });
    }

    const tx = db.transaction(() => {
      assertTxLicenseWitness(db, 'PURCHASES_POST');
      const invNum = invoice_number?.trim() || nextDocNumber(db, 'purchase_invoices', 'invoice_number', 'PUR');
      const dup = db.prepare('SELECT id FROM purchase_invoices WHERE invoice_number = ?').get(invNum);
      if (dup) throw new Error(`رقم الفاتورة ${invNum} مسجل مسبقًا`);

      let subtotal = 0;
      let itemsDiscount = 0;
      const computedLines: Array<{
        product_id: number;
        unit_id: number;
        conversion_factor: number;
        quantity: number;
        base_quantity: number;
        unit_price: number;
        discount_value: number;
        discount_percent: number;
        tax_amount: number;
        line_total: number;
      }> = [];

      for (const it of items) {
        const qty = Number(it.quantity);
        const factor = Number(it.conversion_factor || 1);
        const price = Number(it.unit_price);
        if (qty <= 0 || price < 0 || factor <= 0) throw new Error('الكميات يجب أن تكون أكبر من صفر والأسعار غير سالبة');

        const gross = qty * price;
        const discPct = Number(it.discount_percent || 0);
        const discVal = it.discount_value ? Number(it.discount_value) : (gross * discPct) / 100;
        const lineTax = Number(it.tax_amount || 0);
        const lineTotal = gross - discVal + lineTax;

        subtotal += gross;
        itemsDiscount += discVal;
        computedLines.push({
          product_id: Number(it.product_id),
          unit_id: Number(it.unit_id),
          conversion_factor: factor,
          quantity: qty,
          base_quantity: qty * factor,
          unit_price: price,
          discount_value: discVal,
          discount_percent: discPct,
          tax_amount: lineTax,
          line_total: lineTotal,
        });
      }

      const invDisc = Number(invoice_discount || 0);
      const invTax = Number(tax_amount || 0);
      const extraExp = Number(extra_expenses || 0);
      const allocExp = allocate_expenses ? 1 : 0;
      const linesNetSum = computedLines.reduce((s, l) => s + l.line_total, 0);
      const netTotal = Math.max(0, linesNetSum - invDisc + invTax + extraExp);

      const paid = payment_type === 'CASH' ? (paid_amount !== undefined ? Number(paid_amount) : netTotal) : Number(paid_amount || 0);
      const remaining = netTotal - paid;
      const invDate = invoice_date || new Date().toISOString().slice(0, 16).replace('T', ' ');

      const invRes = db
        .prepare(
          `INSERT INTO purchase_invoices (invoice_number, supplier_invoice_no, invoice_date, supplier_id, warehouse_id, payment_type, cashbox_id, subtotal, items_discount, invoice_discount, tax_amount, extra_expenses, allocate_expenses, net_total, paid_amount, remaining_amount, notes, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          invNum,
          supplier_invoice_no || '',
          invDate,
          supplier_id,
          warehouse_id,
          payment_type || 'CASH',
          cashbox_id || 1,
          subtotal,
          itemsDiscount,
          invDisc,
          invTax,
          extraExp,
          allocExp,
          netTotal,
          paid,
          remaining,
          notes || '',
          actor.userId
        );
      const invId = Number(invRes.lastInsertRowid);

      for (const l of computedLines) {
        const shareRatio = linesNetSum > 0 ? l.line_total / linesNetSum : 0;
        const allocatedExpense = allocExp ? extraExp * shareRatio : 0;
        const allocatedInvDisc = linesNetSum > 0 ? invDisc * shareRatio : 0;
        const effectiveTotalCost = Math.max(0, l.line_total - allocatedInvDisc + allocatedExpense);
        const effectiveBaseCost = effectiveTotalCost / l.base_quantity;

        db.prepare(
          `INSERT INTO purchase_items (purchase_invoice_id, product_id, unit_id, conversion_factor, quantity, base_quantity, unit_price, discount_value, discount_percent, tax_amount, allocated_expense, line_total, effective_base_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          invId,
          l.product_id,
          l.unit_id,
          l.conversion_factor,
          l.quantity,
          l.base_quantity,
          l.unit_price,
          l.discount_value,
          l.discount_percent,
          l.tax_amount,
          allocatedExpense,
          l.line_total,
          effectiveBaseCost
        );

        // Moving Weighted Average Cost Update across all warehouses
        const prod = db.prepare('SELECT avg_cost FROM products WHERE id = ?').get(l.product_id) as { avg_cost: number };
        const totalOldQtyRow = db.prepare('SELECT COALESCE(SUM(quantity), 0) as q FROM warehouse_stock WHERE product_id = ?').get(l.product_id) as { q: number };
        const oldTotalQty = Math.max(0, totalOldQtyRow.q);
        const newAvgCost =
          oldTotalQty + l.base_quantity > 0
            ? (oldTotalQty * prod.avg_cost + l.base_quantity * effectiveBaseCost) / (oldTotalQty + l.base_quantity)
            : effectiveBaseCost;

        db.prepare('UPDATE products SET last_cost = ?, purchase_price = ?, avg_cost = ? WHERE id = ?').run(
          effectiveBaseCost,
          effectiveBaseCost,
          newAvgCost,
          l.product_id
        );

        // Update Warehouse Stock
        db.prepare(
          `INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)
           ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`
        ).run(warehouse_id, l.product_id, l.base_quantity);

        const newWhBal = (db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(warehouse_id, l.product_id) as { quantity: number }).quantity;

        db.prepare(
          `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
           VALUES (?, ?, ?, 'IN_PURCHASE', 'PURCHASE_INVOICE', ?, ?, ?, 0, ?, ?, ?, ?)`
        ).run(invDate, l.product_id, warehouse_id, invId, invNum, l.base_quantity, effectiveBaseCost, newWhBal, `شراء فاتورة ${invNum}`, actor.userId);
      }

      // Supplier Account Ledger: Purchase increases supplier payable (credit), Payment decreases it (debit)
      const sup = db.prepare('SELECT current_balance FROM suppliers WHERE id = ?').get(supplier_id) as { current_balance: number };
      let bal = sup.current_balance + netTotal;
      db.prepare(
        `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
         VALUES (?, 'SUPPLIER', ?, 'INVOICE', ?, 0, ?, ?, ?, ?)`
      ).run(invDate, supplier_id, invNum, netTotal, bal, `فاتورة مشتريات ${invNum}`, actor.userId);

      if (paid > 0) {
        bal -= paid;
        db.prepare(
          `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
           VALUES (?, 'SUPPLIER', ?, 'PAYMENT', ?, ?, 0, ?, ?, ?)`
        ).run(invDate, supplier_id, invNum, paid, bal, `سداد مع فاتورة مشتريات ${invNum}`, actor.userId);

        const cbId = Number(cashbox_id || 1);
        db.prepare('UPDATE cashboxes SET current_balance = current_balance - ? WHERE id = ?').run(paid, cbId);
        const cbBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(cbId) as { current_balance: number }).current_balance;
        db.prepare(
          `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
           VALUES (?, ?, 'PURCHASE', ?, 0, ?, ?, ?, ?)`
        ).run(invDate, cbId, invNum, paid, cbBal, `سداد فاتورة مشتريات ${invNum}`, actor.userId);
      }
      db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(bal, supplier_id);

      logAudit(db, actor.userId, actor.username, 'CREATE', 'PURCHASE_INVOICE', invId, invNum, null, { net_total: netTotal, paid_amount: paid }, 'اعتماد فاتورة مشتريات');
      return { id: invId, invoice_number: invNum };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/purchases/:id/cancel', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const id = Number(req.params.id);

    const tx = db.transaction(() => {
      const inv = db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!inv) throw new Error('الفاتورة غير موجودة');
      if (inv.status === 'CANCELLED') throw new Error('الفاتورة ملغاة بالفعل');

      const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_invoice_id = ?').all(id) as Array<Record<string, unknown>>;
      const today = new Date().toISOString().slice(0, 10);

      for (const it of items) {
        const ws = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(inv.warehouse_id, it.product_id) as { quantity: number } | undefined;
        const currQty = ws ? ws.quantity : 0;
        if (currQty < Number(it.base_quantity)) {
          throw new Error('لا يمكن إلغاء الفاتورة لأن جزءًا من الكمية تم صرفه بالفعل. استخدم مرتجع مشتريات.');
        }
        const newQty = currQty - Number(it.base_quantity);
        db.prepare('UPDATE warehouse_stock SET quantity = ? WHERE warehouse_id = ? AND product_id = ?').run(newQty, inv.warehouse_id, it.product_id);
        db.prepare(
          `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
           VALUES (?, ?, ?, 'ADJUSTMENT_OUT', 'PURCHASE_CANCEL', ?, ?, 0, ?, ?, ?, ?, ?)`
        ).run(today, it.product_id, inv.warehouse_id, id, inv.invoice_number, it.base_quantity, it.effective_base_cost, newQty, `إلغاء فاتورة شراء ${inv.invoice_number}`, actor.userId);
      }

      // Reverse Supplier Balance & Cashbox
      const sup = db.prepare('SELECT current_balance FROM suppliers WHERE id = ?').get(inv.supplier_id) as { current_balance: number };
      const revNet = Number(inv.net_total) - Number(inv.paid_amount);
      const newSupBal = sup.current_balance - revNet;
      db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(newSupBal, inv.supplier_id);
      db.prepare(
        `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
         VALUES (?, 'SUPPLIER', ?, 'REVERSAL', ?, ?, 0, ?, ?, ?)`
      ).run(today, inv.supplier_id, inv.invoice_number, revNet, newSupBal, `عكس قيد إلغاء فاتورة مشتريات ${inv.invoice_number}`, actor.userId);

      if (Number(inv.paid_amount) > 0 && inv.cashbox_id) {
        db.prepare('UPDATE cashboxes SET current_balance = current_balance + ? WHERE id = ?').run(inv.paid_amount, inv.cashbox_id);
        const cbBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(inv.cashbox_id) as { current_balance: number }).current_balance;
        db.prepare(
          `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
           VALUES (?, ?, 'REVERSAL', ?, ?, 0, ?, ?, ?)`
        ).run(today, inv.cashbox_id, inv.invoice_number, inv.paid_amount, cbBal, `استرداد نقدية إلغاء فاتورة شراء ${inv.invoice_number}`, actor.userId);
      }

      db.prepare("UPDATE purchase_invoices SET status = 'CANCELLED' WHERE id = ?").run(id);
      logAudit(db, actor.userId, actor.username, 'CANCEL', 'PURCHASE_INVOICE', id, String(inv.invoice_number), inv, { status: 'CANCELLED' }, 'إلغاء فاتورة مشتريات');
    });

    try {
      tx();
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ==========================================
  // SALES INVOICES (POS & Invoice + COGS + Profit)
  // ==========================================
  router.get('/sales', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { from, to, customer_id, q } = req.query;
    let sql = `
      SELECT si.*, c.name as customer_name, w.name as warehouse_name, u.username as user_name
      FROM sales_invoices si
      JOIN customers c ON si.customer_id = c.id
      JOIN warehouses w ON si.warehouse_id = w.id
      JOIN users u ON si.user_id = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (from) { sql += ' AND substr(si.invoice_date, 1, 10) >= ?'; params.push(from); }
    if (to) { sql += ' AND substr(si.invoice_date, 1, 10) <= ?'; params.push(to); }
    if (customer_id) { sql += ' AND si.customer_id = ?'; params.push(Number(customer_id)); }
    if (q) { sql += ' AND (si.invoice_number LIKE ? OR c.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY si.id DESC LIMIT 200';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/sales/:id', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const inv = db
      .prepare(
        `SELECT si.*, c.name as customer_name, c.phone as customer_phone, c.current_balance as customer_balance,
          w.name as warehouse_name, u.username as user_name
         FROM sales_invoices si
         JOIN customers c ON si.customer_id = c.id
         JOIN warehouses w ON si.warehouse_id = w.id
         JOIN users u ON si.user_id = u.id
         WHERE si.id = ?`
      )
      .get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'فاتورة البيع غير موجودة' });

    const items = db
      .prepare(
        `SELECT sitem.*, p.code as product_code, p.name as product_name, u.name as unit_name,
          COALESCE((SELECT SUM(sri.quantity) FROM sales_return_items sri WHERE sri.sales_item_id = sitem.id), 0) as returned_qty
         FROM sales_items sitem
         JOIN products p ON sitem.product_id = p.id
         JOIN units u ON sitem.unit_id = u.id
         WHERE sitem.sales_invoice_id = ?`
      )
      .all(req.params.id);

    res.json({ invoice: inv, items });
  });

  router.post('/sales', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const {
      invoice_number,
      invoice_date,
      customer_id,
      warehouse_id,
      sales_rep_id,
      payment_type,
      price_tier,
      cashbox_id,
      invoice_discount,
      extra_additions,
      tax_amount,
      paid_amount,
      notes,
      items,
    } = req.body;

    if (!customer_id || !warehouse_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'يرجى تحديد العميل والمخزن وإضافة صنف واحد على الأقل' });
    }

    const tx = db.transaction(() => {
      assertTxLicenseWitness(db, 'SALES_POST');
      const invNum = invoice_number?.trim() || nextDocNumber(db, 'sales_invoices', 'invoice_number', 'SAL');
      const dup = db.prepare('SELECT id FROM sales_invoices WHERE invoice_number = ?').get(invNum);
      if (dup) throw new Error(`رقم الفاتورة ${invNum} مسجل مسبقًا`);

      const allowNegGlobal =
        (db.prepare("SELECT value FROM settings WHERE key = 'allow_negative_stock_global'").get() as { value: string } | undefined)?.value === '1';
      const actorRow = db.prepare('SELECT allow_negative_stock FROM users WHERE id = ?').get(actor.userId) as { allow_negative_stock: number } | undefined;
      const canSellNegative = allowNegGlobal && actorRow?.allow_negative_stock === 1;

      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id) as Record<string, unknown>;
      if (!customer) throw new Error('العميل غير موجود');
      if (Number(customer.is_walkin) === 1 && payment_type === 'CREDIT') {
        throw new Error('لا يمكن البيع الآجل للعميل النقدي العام. اختر عميلًا مسجلًا.');
      }

      let subtotal = 0;
      let itemsDiscount = 0;
      let totalCost = 0;

      const computedLines: Array<{
        product_id: number;
        unit_id: number;
        conversion_factor: number;
        quantity: number;
        base_quantity: number;
        is_bonus: number;
        unit_price: number;
        discount_value: number;
        discount_percent: number;
        tax_amount: number;
        line_total: number;
        cost_at_sale: number;
        line_profit: number;
        serial_numbers: string;
      }> = [];

      // Check cumulative stock per product across lines in same invoice
      const requestedBaseByProduct: Record<number, number> = {};

      for (const it of items) {
        const qty = Number(it.quantity);
        const factor = Number(it.conversion_factor || 1);
        const isBonus = it.is_bonus ? 1 : 0;
        const price = isBonus ? 0 : Number(it.unit_price);
        if (qty <= 0 || price < 0 || factor <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر والسعر غير سالب');

        const baseQty = qty * factor;
        const pid = Number(it.product_id);
        requestedBaseByProduct[pid] = (requestedBaseByProduct[pid] || 0) + baseQty;

        const prod = db.prepare('SELECT id, name, avg_cost FROM products WHERE id = ?').get(pid) as { id: number; name: string; avg_cost: number };
        if (!prod) throw new Error('صنف غير موجود');

        const gross = qty * price;
        const discPct = Number(it.discount_percent || 0);
        const discVal = it.discount_value ? Number(it.discount_value) : (gross * discPct) / 100;
        const lineTax = Number(it.tax_amount || 0);
        const lineTotal = gross - discVal + lineTax;
        const costAtSale = baseQty * prod.avg_cost;
        const lineProfit = lineTotal - lineTax - costAtSale;

        subtotal += gross;
        itemsDiscount += discVal;
        totalCost += costAtSale;

        computedLines.push({
          product_id: pid,
          unit_id: Number(it.unit_id),
          conversion_factor: factor,
          quantity: qty,
          base_quantity: baseQty,
          is_bonus: isBonus,
          unit_price: price,
          discount_value: discVal,
          discount_percent: discPct,
          tax_amount: lineTax,
          line_total: lineTotal,
          cost_at_sale: costAtSale,
          line_profit: lineProfit,
          serial_numbers: String(it.serial_numbers || ''),
        });
      }

      // Stock availability verification
      for (const [pidStr, reqQty] of Object.entries(requestedBaseByProduct)) {
        const pid = Number(pidStr);
        const ws = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(warehouse_id, pid) as { quantity: number } | undefined;
        const avail = ws ? ws.quantity : 0;
        if (!canSellNegative && avail < reqQty) {
          const pName = (db.prepare('SELECT name FROM products WHERE id = ?').get(pid) as { name: string }).name;
          throw new Error(`الرصيد المتاح للصنف "${pName}" في هذا المخزن (${avail}) أقل من الكمية المطلوبة (${reqQty})`);
        }
      }

      const invDisc = Number(invoice_discount || 0);
      const extraAdd = Number(extra_additions || 0);
      const invTax = Number(tax_amount || 0);
      const linesNetSum = computedLines.reduce((s, l) => s + l.line_total, 0);
      const netTotal = Math.max(0, linesNetSum - invDisc + extraAdd + invTax);
      const grossProfit = netTotal - invTax - totalCost;

      const paid =
        payment_type === 'CASH' || payment_type === 'VISA'
          ? paid_amount !== undefined
            ? Number(paid_amount)
            : netTotal
          : Number(paid_amount || 0);
      if (Number.isNaN(paid) || paid < 0) {
        throw new Error('المبلغ المدفوع غير صالح');
      }
      const remaining = netTotal - paid;

      if (Number(customer.is_walkin) === 1 && remaining > 0.001) {
        throw new Error('العميل النقدي يجب أن يسدد كامل قيمة الفاتورة');
      }
      if (Number(customer.credit_limit) > 0 && Number(customer.current_balance) + remaining > Number(customer.credit_limit)) {
        throw new Error(`تجاوز الحد الائتماني للعميل (${customer.credit_limit})`);
      }

      const invDate = invoice_date || new Date().toISOString().slice(0, 16).replace('T', ' ');
      const invRes = db
        .prepare(
          `INSERT INTO sales_invoices (invoice_number, invoice_date, customer_id, warehouse_id, sales_rep_id, payment_type, price_tier, cashbox_id, subtotal, items_discount, invoice_discount, extra_additions, tax_amount, net_total, total_cost, gross_profit, paid_amount, remaining_amount, notes, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          invNum,
          invDate,
          customer_id,
          warehouse_id,
          sales_rep_id || null,
          payment_type || 'CASH',
          price_tier || 'RETAIL',
          cashbox_id || 1,
          subtotal,
          itemsDiscount,
          invDisc,
          extraAdd,
          invTax,
          netTotal,
          totalCost,
          grossProfit,
          paid,
          remaining,
          notes || '',
          actor.userId
        );
      const invId = Number(invRes.lastInsertRowid);

      for (const l of computedLines) {
        db.prepare(
          `INSERT INTO sales_items (sales_invoice_id, product_id, unit_id, conversion_factor, quantity, base_quantity, is_bonus, unit_price, discount_value, discount_percent, tax_amount, line_total, cost_at_sale, line_profit, serial_numbers)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          invId,
          l.product_id,
          l.unit_id,
          l.conversion_factor,
          l.quantity,
          l.base_quantity,
          l.is_bonus,
          l.unit_price,
          l.discount_value,
          l.discount_percent,
          l.tax_amount,
          l.line_total,
          l.cost_at_sale,
          l.line_profit,
          l.serial_numbers
        );

        const wsRow = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(warehouse_id, l.product_id) as { quantity: number } | undefined;
        const newWhBal = (wsRow ? wsRow.quantity : 0) - l.base_quantity;
        if (wsRow) {
          db.prepare('UPDATE warehouse_stock SET quantity = ? WHERE warehouse_id = ? AND product_id = ?').run(newWhBal, warehouse_id, l.product_id);
        } else {
          db.prepare('INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)').run(warehouse_id, l.product_id, newWhBal);
        }

        const unitCost = l.base_quantity > 0 ? l.cost_at_sale / l.base_quantity : 0;
        db.prepare(
          `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
           VALUES (?, ?, ?, 'OUT_SALE', 'SALES_INVOICE', ?, ?, 0, ?, ?, ?, ?, ?)`
        ).run(invDate, l.product_id, warehouse_id, invId, invNum, l.base_quantity, unitCost, newWhBal, `بيع فاتورة ${invNum}`, actor.userId);
      }

      // Customer Account Ledger: Sale increases receivable (debit), Payment decreases it (credit)
      let bal = Number(customer.current_balance) + netTotal;
      if (Number(customer.is_walkin) === 0) {
        db.prepare(
          `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
           VALUES (?, 'CUSTOMER', ?, 'INVOICE', ?, ?, 0, ?, ?, ?)`
        ).run(invDate, customer_id, invNum, netTotal, bal, `فاتورة مبيعات ${invNum}`, actor.userId);
      }

      if (paid > 0) {
        bal -= paid;
        if (Number(customer.is_walkin) === 0) {
          db.prepare(
            `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
             VALUES (?, 'CUSTOMER', ?, 'RECEIPT', ?, 0, ?, ?, ?, ?)`
          ).run(invDate, customer_id, invNum, paid, bal, `تحصيل مع فاتورة مبيعات ${invNum}`, actor.userId);
        }

        const cbId = Number(cashbox_id || 1);
        db.prepare('UPDATE cashboxes SET current_balance = current_balance + ? WHERE id = ?').run(paid, cbId);
        const cbBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(cbId) as { current_balance: number }).current_balance;
        db.prepare(
          `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
           VALUES (?, ?, 'SALE', ?, ?, 0, ?, ?, ?)`
        ).run(invDate, cbId, invNum, paid, cbBal, `تحصيل فاتورة مبيعات ${invNum}`, actor.userId);
      }

      if (Number(customer.is_walkin) === 0) {
        db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(bal, customer_id);
      }

      logAudit(db, actor.userId, actor.username, 'CREATE', 'SALES_INVOICE', invId, invNum, null, { net_total: netTotal, total_cost: totalCost, gross_profit: grossProfit }, 'اعتماد فاتورة مبيعات');
      return { id: invId, invoice_number: invNum, net_total: netTotal, total_cost: totalCost, gross_profit: grossProfit };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/sales/:id/cancel', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const id = Number(req.params.id);

    const tx = db.transaction(() => {
      const inv = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!inv) throw new Error('الفاتورة غير موجودة');
      if (inv.status === 'CANCELLED') throw new Error('الفاتورة ملغاة بالفعل');

      const items = db.prepare('SELECT * FROM sales_items WHERE sales_invoice_id = ?').all(id) as Array<Record<string, unknown>>;
      const today = new Date().toISOString().slice(0, 10);

      for (const it of items) {
        const wsRow = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(inv.warehouse_id, it.product_id) as { quantity: number } | undefined;
        const newBal = (wsRow ? wsRow.quantity : 0) + Number(it.base_quantity);
        if (wsRow) {
          db.prepare('UPDATE warehouse_stock SET quantity = ? WHERE warehouse_id = ? AND product_id = ?').run(newBal, inv.warehouse_id, it.product_id);
        } else {
          db.prepare('INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)').run(inv.warehouse_id, it.product_id, newBal);
        }
        const unitCost = Number(it.base_quantity) > 0 ? Number(it.cost_at_sale) / Number(it.base_quantity) : 0;
        db.prepare(
          `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
           VALUES (?, ?, ?, 'ADJUSTMENT_IN', 'SALES_CANCEL', ?, ?, ?, 0, ?, ?, ?, ?)`
        ).run(today, it.product_id, inv.warehouse_id, id, inv.invoice_number, it.base_quantity, unitCost, newBal, `إلغاء فاتورة مبيعات ${inv.invoice_number}`, actor.userId);
      }

      const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(inv.customer_id) as Record<string, unknown>;
      if (Number(cust.is_walkin) === 0) {
        const revNet = Number(inv.net_total) - Number(inv.paid_amount);
        const newBal = Number(cust.current_balance) - revNet;
        db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newBal, inv.customer_id);
        db.prepare(
          `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
           VALUES (?, 'CUSTOMER', ?, 'REVERSAL', ?, 0, ?, ?, ?, ?)`
        ).run(today, inv.customer_id, inv.invoice_number, revNet, newBal, `عكس قيد إلغاء فاتورة مبيعات ${inv.invoice_number}`, actor.userId);
      }

      if (Number(inv.paid_amount) > 0 && inv.cashbox_id) {
        db.prepare('UPDATE cashboxes SET current_balance = current_balance - ? WHERE id = ?').run(inv.paid_amount, inv.cashbox_id);
        const cbBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(inv.cashbox_id) as { current_balance: number }).current_balance;
        db.prepare(
          `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
           VALUES (?, ?, 'REVERSAL', ?, 0, ?, ?, ?, ?)`
        ).run(today, inv.cashbox_id, inv.invoice_number, inv.paid_amount, cbBal, `رد نقدية إلغاء فاتورة بيع ${inv.invoice_number}`, actor.userId);
      }

      db.prepare("UPDATE sales_invoices SET status = 'CANCELLED' WHERE id = ?").run(id);
      logAudit(db, actor.userId, actor.username, 'CANCEL', 'SALES_INVOICE', id, String(inv.invoice_number), inv, { status: 'CANCELLED' }, 'إلغاء فاتورة مبيعات');
    });

    try {
      tx();
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ==========================================
  // RETURNS (Sales Returns & Purchase Returns)
  // ==========================================
  router.get('/returns/sales', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(
      db
        .prepare(
          `SELECT sr.*, si.invoice_number as original_invoice_number, c.name as customer_name, w.name as warehouse_name, u.username as user_name
           FROM sales_returns sr
           JOIN sales_invoices si ON sr.sales_invoice_id = si.id
           JOIN customers c ON sr.customer_id = c.id
           JOIN warehouses w ON sr.warehouse_id = w.id
           JOIN users u ON sr.user_id = u.id
           ORDER BY sr.id DESC LIMIT 200`
        )
        .all()
    );
  });

  router.post('/returns/sales', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const { sales_invoice_id, return_date, settlement_type, cashbox_id, reason, items } = req.body;

    if (!sales_invoice_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'يرجى تحديد الفاتورة الأصلية والأصناف المرتجعة' });
    }

    const tx = db.transaction(() => {
      assertTxLicenseWitness(db, 'SALES_RET_POST');
      const inv = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(sales_invoice_id) as Record<string, unknown> | undefined;
      if (!inv || inv.status !== 'APPROVED') throw new Error('فاتورة البيع الأصلية غير صالحة للمرتجع');

      const retNum = nextDocNumber(db, 'sales_returns', 'return_number', 'SRT');
      const rDate = return_date || new Date().toISOString().slice(0, 10);

      let totalAmount = 0;
      let totalCostRev = 0;

      const linesToSave: Array<{
        sales_item_id: number;
        product_id: number;
        unit_id: number;
        conversion_factor: number;
        quantity: number;
        base_quantity: number;
        unit_price: number;
        cost_at_sale: number;
        line_total: number;
        item_condition: string;
      }> = [];

      for (const it of items) {
        const qty = Number(it.quantity);
        if (qty <= 0) continue;
        const origItem = db.prepare('SELECT * FROM sales_items WHERE id = ? AND sales_invoice_id = ?').get(it.sales_item_id, sales_invoice_id) as Record<string, unknown> | undefined;
        if (!origItem) throw new Error('بند الفاتورة غير مطابق');

        const prevReturnedRow = db
          .prepare('SELECT COALESCE(SUM(quantity), 0) as r FROM sales_return_items WHERE sales_item_id = ?')
          .get(origItem.id) as { r: number };
        const remainingReturnable = Number(origItem.quantity) - prevReturnedRow.r;
        if (qty > remainingReturnable + 0.0001) {
          throw new Error(`الكمية المرتجعة (${qty}) تتجاوز المتبقي القابل للإرجاع (${remainingReturnable})`);
        }

        const factor = Number(origItem.conversion_factor);
        const baseQty = qty * factor;
        const unitNetPrice = Number(origItem.quantity) > 0 ? Number(origItem.line_total) / Number(origItem.quantity) : 0;
        const lineTotal = qty * unitNetPrice;
        const unitCostAtSale = Number(origItem.base_quantity) > 0 ? Number(origItem.cost_at_sale) / Number(origItem.base_quantity) : 0;
        const costReversed = baseQty * unitCostAtSale;
        const cond = ['VALID', 'DAMAGED', 'INSPECTION'].includes(it.item_condition) ? it.item_condition : 'VALID';

        totalAmount += lineTotal;
        totalCostRev += costReversed;

        linesToSave.push({
          sales_item_id: Number(origItem.id),
          product_id: Number(origItem.product_id),
          unit_id: Number(origItem.unit_id),
          conversion_factor: factor,
          quantity: qty,
          base_quantity: baseQty,
          unit_price: unitNetPrice,
          cost_at_sale: costReversed,
          line_total: lineTotal,
          item_condition: cond,
        });
      }

      if (linesToSave.length === 0) throw new Error('لم يتم تحديد أي كميات صالحة للإرجاع');

      const srRes = db
        .prepare(
          `INSERT INTO sales_returns (return_number, return_date, sales_invoice_id, customer_id, warehouse_id, settlement_type, cashbox_id, total_amount, total_cost_reversed, reason, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          retNum,
          rDate,
          sales_invoice_id,
          inv.customer_id,
          inv.warehouse_id,
          settlement_type || 'CASH',
          cashbox_id || inv.cashbox_id || 1,
          totalAmount,
          totalCostRev,
          reason || '',
          actor.userId
        );
      const srId = Number(srRes.lastInsertRowid);

      for (const l of linesToSave) {
        db.prepare(
          `INSERT INTO sales_return_items (sales_return_id, sales_item_id, product_id, unit_id, conversion_factor, quantity, base_quantity, unit_price, cost_at_sale, line_total, item_condition)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          srId,
          l.sales_item_id,
          l.product_id,
          l.unit_id,
          l.conversion_factor,
          l.quantity,
          l.base_quantity,
          l.unit_price,
          l.cost_at_sale,
          l.line_total,
          l.item_condition
        );

        const wsRow = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(inv.warehouse_id, l.product_id) as { quantity: number } | undefined;
        const currBal = wsRow ? wsRow.quantity : 0;
        const unitCost = l.base_quantity > 0 ? l.cost_at_sale / l.base_quantity : 0;

        if (l.item_condition === 'VALID') {
          // Only VALID items return to sellable stock
          const newBal = currBal + l.base_quantity;
          if (wsRow) {
            db.prepare('UPDATE warehouse_stock SET quantity = ? WHERE warehouse_id = ? AND product_id = ?').run(newBal, inv.warehouse_id, l.product_id);
          } else {
            db.prepare('INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)').run(inv.warehouse_id, l.product_id, newBal);
          }
          db.prepare(
            `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
             VALUES (?, ?, ?, 'IN_SALES_RETURN', 'SALES_RETURN', ?, ?, ?, 0, ?, ?, ?, ?)`
          ).run(rDate, l.product_id, inv.warehouse_id, srId, retNum, l.base_quantity, unitCost, newBal, `مرتجع مبيعات صالح (${reason || ''})`, actor.userId);
        } else {
          // Damaged / Under inspection logged without adding to sellable inventory
          db.prepare(
            `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
             VALUES (?, ?, ?, 'RETURN_DAMAGED', 'SALES_RETURN', ?, ?, 0, 0, ?, ?, ?, ?)`
          ).run(
            rDate,
            l.product_id,
            inv.warehouse_id,
            srId,
            retNum,
            unitCost,
            currBal,
            `مرتجع مبيعات (${l.item_condition === 'DAMAGED' ? 'تالف' : 'تحت الفحص'}) كمية ${l.base_quantity} - لا يُعاد للمخزون القابل للبيع`,
            actor.userId
          );
        }
      }

      // Customer & Cashbox Settlement
      const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(inv.customer_id) as Record<string, unknown>;
      if (settlement_type === 'CASH') {
        const cbId = Number(cashbox_id || inv.cashbox_id || 1);
        db.prepare('UPDATE cashboxes SET current_balance = current_balance - ? WHERE id = ?').run(totalAmount, cbId);
        const cbBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(cbId) as { current_balance: number }).current_balance;
        db.prepare(
          `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
           VALUES (?, ?, 'SALES_RETURN', ?, 0, ?, ?, ?, ?)`
        ).run(rDate, cbId, retNum, totalAmount, cbBal, `صرف مرتجع مبيعات ${retNum}`, actor.userId);
      } else {
        if (Number(cust.is_walkin) === 1) {
          throw new Error('العميل النقدي العام لا يملك حساب آجل؛ يرجى اختيار تسوية نقدية (من الخزينة).');
        }
        const newBal = Number(cust.current_balance) - totalAmount;
        db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newBal, inv.customer_id);
        db.prepare(
          `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
           VALUES (?, 'CUSTOMER', ?, 'RETURN', ?, 0, ?, ?, ?, ?)`
        ).run(rDate, inv.customer_id, retNum, totalAmount, newBal, `مرتجع مبيعات آجل ${retNum}`, actor.userId);
      }

      logAudit(db, actor.userId, actor.username, 'CREATE', 'SALES_RETURN', srId, retNum, null, { total_amount: totalAmount }, 'اعتماد مرتجع مبيعات');
      return { id: srId, return_number: retNum, total_amount: totalAmount };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/returns/purchases', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(
      db
        .prepare(
          `SELECT pr.*, pi.invoice_number as original_invoice_number, s.name as supplier_name, w.name as warehouse_name, u.username as user_name
           FROM purchase_returns pr
           JOIN purchase_invoices pi ON pr.purchase_invoice_id = pi.id
           JOIN suppliers s ON pr.supplier_id = s.id
           JOIN warehouses w ON pr.warehouse_id = w.id
           JOIN users u ON pr.user_id = u.id
           ORDER BY pr.id DESC LIMIT 200`
        )
        .all()
    );
  });

  router.post('/returns/purchases', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const { purchase_invoice_id, return_date, settlement_type, cashbox_id, reason, items } = req.body;

    if (!purchase_invoice_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'يرجى تحديد فاتورة الشراء الأصلية والأصناف المرتجعة' });
    }

    const tx = db.transaction(() => {
      assertTxLicenseWitness(db, 'PURCH_RET_POST');
      const inv = db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(purchase_invoice_id) as Record<string, unknown> | undefined;
      if (!inv || inv.status !== 'APPROVED') throw new Error('فاتورة الشراء غير صالحة للمرتجع');

      const retNum = nextDocNumber(db, 'purchase_returns', 'return_number', 'PRT');
      const rDate = return_date || new Date().toISOString().slice(0, 10);

      let totalAmount = 0;
      const linesToSave: Array<{
        purchase_item_id: number;
        product_id: number;
        unit_id: number;
        conversion_factor: number;
        quantity: number;
        base_quantity: number;
        unit_price: number;
        line_total: number;
      }> = [];

      for (const it of items) {
        const qty = Number(it.quantity);
        if (qty <= 0) continue;
        const origItem = db.prepare('SELECT * FROM purchase_items WHERE id = ? AND purchase_invoice_id = ?').get(it.purchase_item_id, purchase_invoice_id) as Record<string, unknown> | undefined;
        if (!origItem) throw new Error('بند فاتورة الشراء غير مطابق');

        const prevReturnedRow = db
          .prepare('SELECT COALESCE(SUM(quantity), 0) as r FROM purchase_return_items WHERE purchase_item_id = ?')
          .get(origItem.id) as { r: number };
        const remainingReturnable = Number(origItem.quantity) - prevReturnedRow.r;
        if (qty > remainingReturnable + 0.0001) {
          throw new Error(`الكمية المرتجعة (${qty}) تتجاوز المتبقي القابل للإرجاع (${remainingReturnable})`);
        }

        const factor = Number(origItem.conversion_factor);
        const baseQty = qty * factor;
        const wsRow = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(inv.warehouse_id, origItem.product_id) as { quantity: number } | undefined;
        const avail = wsRow ? wsRow.quantity : 0;
        if (avail < baseQty) {
          throw new Error(`الرصيد الحالي بالمخزن (${avail}) أقل من الكمية المراد إرجاعها للمورد (${baseQty})`);
        }

        const unitNetPrice = Number(origItem.quantity) > 0 ? Number(origItem.line_total) / Number(origItem.quantity) : 0;
        const lineTotal = qty * unitNetPrice;
        totalAmount += lineTotal;

        linesToSave.push({
          purchase_item_id: Number(origItem.id),
          product_id: Number(origItem.product_id),
          unit_id: Number(origItem.unit_id),
          conversion_factor: factor,
          quantity: qty,
          base_quantity: baseQty,
          unit_price: unitNetPrice,
          line_total: lineTotal,
        });
      }

      if (linesToSave.length === 0) throw new Error('لم يتم تحديد كميات صالحة للإرجاع');

      const prRes = db
        .prepare(
          `INSERT INTO purchase_returns (return_number, return_date, purchase_invoice_id, supplier_id, warehouse_id, settlement_type, cashbox_id, total_amount, reason, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          retNum,
          rDate,
          purchase_invoice_id,
          inv.supplier_id,
          inv.warehouse_id,
          settlement_type || 'CREDIT',
          cashbox_id || inv.cashbox_id || 1,
          totalAmount,
          reason || '',
          actor.userId
        );
      const prId = Number(prRes.lastInsertRowid);

      for (const l of linesToSave) {
        db.prepare(
          `INSERT INTO purchase_return_items (purchase_return_id, purchase_item_id, product_id, unit_id, conversion_factor, quantity, base_quantity, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(prId, l.purchase_item_id, l.product_id, l.unit_id, l.conversion_factor, l.quantity, l.base_quantity, l.unit_price, l.line_total);

        const wsRow = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(inv.warehouse_id, l.product_id) as { quantity: number };
        const newBal = wsRow.quantity - l.base_quantity;
        db.prepare('UPDATE warehouse_stock SET quantity = ? WHERE warehouse_id = ? AND product_id = ?').run(newBal, inv.warehouse_id, l.product_id);

        db.prepare(
          `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
           VALUES (?, ?, ?, 'OUT_PURCHASE_RETURN', 'PURCHASE_RETURN', ?, ?, 0, ?, ?, ?, ?, ?)`
        ).run(rDate, l.product_id, inv.warehouse_id, prId, retNum, l.base_quantity, l.unit_price / l.conversion_factor, newBal, `مرتجع مشتريات (${reason || ''})`, actor.userId);
      }

      if (settlement_type === 'CASH') {
        const cbId = Number(cashbox_id || inv.cashbox_id || 1);
        db.prepare('UPDATE cashboxes SET current_balance = current_balance + ? WHERE id = ?').run(totalAmount, cbId);
        const cbBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(cbId) as { current_balance: number }).current_balance;
        db.prepare(
          `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
           VALUES (?, ?, 'PURCHASE_RETURN', ?, ?, 0, ?, ?, ?)`
        ).run(rDate, cbId, retNum, totalAmount, cbBal, `استرداد نقدية مرتجع مشتريات ${retNum}`, actor.userId);
      } else {
        const sup = db.prepare('SELECT current_balance FROM suppliers WHERE id = ?').get(inv.supplier_id) as { current_balance: number };
        const newBal = sup.current_balance - totalAmount;
        db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(newBal, inv.supplier_id);
        db.prepare(
          `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
           VALUES (?, 'SUPPLIER', ?, 'RETURN', ?, ?, 0, ?, ?, ?)`
        ).run(rDate, inv.supplier_id, retNum, totalAmount, newBal, `مرتجع مشتريات آجل ${retNum}`, actor.userId);
      }

      logAudit(db, actor.userId, actor.username, 'CREATE', 'PURCHASE_RETURN', prId, retNum, null, { total_amount: totalAmount }, 'اعتماد مرتجع مشتريات');
      return { id: prId, return_number: retNum, total_amount: totalAmount };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ==========================================
  // INVENTORY: Balances, Stock Card, Adjustments, Stocktake, Transfers
  // ==========================================
  router.get('/inventory/balances', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { warehouse_id, q, filter } = req.query;
    let sql = `
      SELECT p.id, p.code, p.name, p.barcode, p.avg_cost, p.sale_price, p.min_stock, p.reorder_level,
        c.name as category_name, u.name as unit_name,
        COALESCE(SUM(ws.quantity), 0) as total_qty,
        (SELECT MAX(sm.movement_date) FROM stock_movements sm WHERE sm.product_id = p.id AND sm.movement_type = 'OUT_SALE') as last_sale_date
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN units u ON p.base_unit_id = u.id
      LEFT JOIN warehouse_stock ws ON p.id = ws.product_id ${warehouse_id ? 'AND ws.warehouse_id = ?' : ''}
      WHERE p.is_active = 1
    `;
    const params: unknown[] = [];
    if (warehouse_id) params.push(Number(warehouse_id));
    if (q) {
      sql += ' AND (p.code LIKE ? OR p.name LIKE ? OR p.barcode LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += ' GROUP BY p.id';
    if (filter === 'LOW') sql += ' HAVING total_qty <= p.reorder_level';
    if (filter === 'ZERO') sql += ' HAVING total_qty <= 0';
    sql += ' ORDER BY p.id DESC';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    if (filter === 'STAGNANT') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      return res.json(rows.filter((r) => Number(r.total_qty) > 0 && (!r.last_sale_date || String(r.last_sale_date) < thirtyDaysAgo)));
    }
    res.json(rows);
  });

  router.get('/inventory/card/:productId', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { warehouse_id, from, to } = req.query;
    const product = db
      .prepare('SELECT p.*, u.name as unit_name, c.name as category_name FROM products p LEFT JOIN units u ON p.base_unit_id = u.id LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?')
      .get(req.params.productId);
    if (!product) return res.status(404).json({ error: 'الصنف غير موجود' });

    let sql = `
      SELECT sm.*, w.name as warehouse_name, u.username as user_name
      FROM stock_movements sm
      JOIN warehouses w ON sm.warehouse_id = w.id
      JOIN users u ON sm.user_id = u.id
      WHERE sm.product_id = ?
    `;
    const params: unknown[] = [req.params.productId];
    if (warehouse_id) { sql += ' AND sm.warehouse_id = ?'; params.push(Number(warehouse_id)); }
    if (from) { sql += ' AND substr(sm.movement_date, 1, 10) >= ?'; params.push(from); }
    if (to) { sql += ' AND substr(sm.movement_date, 1, 10) <= ?'; params.push(to); }
    sql += ' ORDER BY sm.id ASC';

    res.json({ product, movements: db.prepare(sql).all(...params) });
  });

  router.get('/inventory/adjustments', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    const docs = db
      .prepare(
        `SELECT sa.*, w.name as warehouse_name, u.username as user_name,
          (SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id) as items_count
         FROM stock_adjustments sa
         JOIN warehouses w ON sa.warehouse_id = w.id
         JOIN users u ON sa.user_id = u.id
         ORDER BY sa.id DESC LIMIT 100`
      )
      .all();
    res.json(docs);
  });

  router.post('/inventory/adjustments', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const { warehouse_id, doc_type, doc_date, reason, items } = req.body;

    if (!warehouse_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'يرجى تحديد المخزن والأصناف' });
    }

    const tx = db.transaction(() => {
      assertTxLicenseWitness(db, 'INV_ADJ_POST');
      const prefix = doc_type === 'OPENING' ? 'OPN' : doc_type === 'STOCKTAKE' ? 'STK' : 'ADJ';
      const docNum = nextDocNumber(db, 'stock_adjustments', 'doc_number', prefix);
      const dDate = doc_date || new Date().toISOString().slice(0, 10);

      const adjRes = db
        .prepare(
          `INSERT INTO stock_adjustments (doc_number, doc_date, warehouse_id, doc_type, reason, user_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(docNum, dDate, warehouse_id, doc_type || 'ADJUSTMENT', reason || 'تسوية مخزون', actor.userId);
      const adjId = Number(adjRes.lastInsertRowid);

      for (const it of items) {
        const pid = Number(it.product_id);
        const actualQty = Number(it.actual_qty);
        if (actualQty < 0) throw new Error('الكمية الفعلية لا يمكن أن تكون سالبة');

        const prod = db.prepare('SELECT avg_cost FROM products WHERE id = ?').get(pid) as { avg_cost: number };
        const wsRow = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(warehouse_id, pid) as { quantity: number } | undefined;
        const bookQty = wsRow ? wsRow.quantity : 0;
        const diffQty = doc_type === 'OPENING' ? actualQty : actualQty - bookQty;

        db.prepare(
          `INSERT INTO stock_adjustment_items (adjustment_id, product_id, book_qty, actual_qty, diff_qty, unit_cost)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(adjId, pid, bookQty, actualQty, diffQty, prod.avg_cost);

        const newBal = doc_type === 'OPENING' ? bookQty + actualQty : actualQty;
        if (wsRow) {
          db.prepare('UPDATE warehouse_stock SET quantity = ? WHERE warehouse_id = ? AND product_id = ?').run(newBal, warehouse_id, pid);
        } else {
          db.prepare('INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)').run(warehouse_id, pid, newBal);
        }

        if (diffQty !== 0) {
          const movType = doc_type === 'OPENING' ? 'OPENING' : diffQty > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
          db.prepare(
            `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
             VALUES (?, ?, ?, ?, 'STOCK_ADJUSTMENT', ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            dDate,
            pid,
            warehouse_id,
            movType,
            adjId,
            docNum,
            diffQty > 0 ? diffQty : 0,
            diffQty < 0 ? Math.abs(diffQty) : 0,
            prod.avg_cost,
            newBal,
            reason || (doc_type === 'STOCKTAKE' ? 'فروق جرد فعلي' : 'تسوية مخزنية'),
            actor.userId
          );
        }
      }

      logAudit(db, actor.userId, actor.username, 'CREATE', 'STOCK_ADJUSTMENT', adjId, docNum, null, { doc_type, count: items.length }, reason || 'اعتماد مستند مخزني');
      return { id: adjId, doc_number: docNum };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/inventory/transfers', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(
      db
        .prepare(
          `SELECT wt.*, wf.name as from_warehouse_name, wt2.name as to_warehouse_name, u.username as user_name,
            (SELECT COUNT(*) FROM warehouse_transfer_items WHERE transfer_id = wt.id) as items_count
           FROM warehouse_transfers wt
           JOIN warehouses wf ON wt.from_warehouse_id = wf.id
           JOIN warehouses wt2 ON wt.to_warehouse_id = wt2.id
           JOIN users u ON wt.user_id = u.id
           ORDER BY wt.id DESC LIMIT 100`
        )
        .all()
    );
  });

  router.post('/inventory/transfers', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const { from_warehouse_id, to_warehouse_id, transfer_date, notes, items } = req.body;

    if (!from_warehouse_id || !to_warehouse_id || from_warehouse_id === to_warehouse_id) {
      return res.status(400).json({ error: 'يرجى اختيار مخزنين مختلفين للتحويل' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'يرجى إضافة صنف واحد على الأقل للتحويل' });
    }

    const tx = db.transaction(() => {
      assertTxLicenseWitness(db, 'INV_TRF_POST');
      const trNum = nextDocNumber(db, 'warehouse_transfers', 'transfer_number', 'TRF');
      const tDate = transfer_date || new Date().toISOString().slice(0, 10);

      const trRes = db
        .prepare('INSERT INTO warehouse_transfers (transfer_number, transfer_date, from_warehouse_id, to_warehouse_id, notes, user_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(trNum, tDate, from_warehouse_id, to_warehouse_id, notes || '', actor.userId);
      const trId = Number(trRes.lastInsertRowid);

      for (const it of items) {
        const pid = Number(it.product_id);
        const qty = Number(it.quantity);
        if (qty <= 0) throw new Error('الكمية المحولة يجب أن تكون أكبر من صفر');

        const prod = db.prepare('SELECT name, avg_cost FROM products WHERE id = ?').get(pid) as { name: string; avg_cost: number };
        const fromWs = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(from_warehouse_id, pid) as { quantity: number } | undefined;
        const avail = fromWs ? fromWs.quantity : 0;
        if (avail < qty) {
          throw new Error(`الرصيد المتاح للصنف "${prod.name}" في المخزن المصدر (${avail}) أقل من الكمية المطلوبة (${qty})`);
        }

        const newFromBal = avail - qty;
        db.prepare('UPDATE warehouse_stock SET quantity = ? WHERE warehouse_id = ? AND product_id = ?').run(newFromBal, from_warehouse_id, pid);

        const toWs = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(to_warehouse_id, pid) as { quantity: number } | undefined;
        const newToBal = (toWs ? toWs.quantity : 0) + qty;
        if (toWs) {
          db.prepare('UPDATE warehouse_stock SET quantity = ? WHERE warehouse_id = ? AND product_id = ?').run(newToBal, to_warehouse_id, pid);
        } else {
          db.prepare('INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)').run(to_warehouse_id, pid, newToBal);
        }

        db.prepare('INSERT INTO warehouse_transfer_items (transfer_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)').run(trId, pid, qty, prod.avg_cost);

        db.prepare(
          `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
           VALUES (?, ?, ?, 'TRANSFER_OUT', 'WAREHOUSE_TRANSFER', ?, ?, 0, ?, ?, ?, ?, ?)`
        ).run(tDate, pid, from_warehouse_id, trId, trNum, qty, prod.avg_cost, newFromBal, `تحويل صادر مستند ${trNum}`, actor.userId);

        db.prepare(
          `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
           VALUES (?, ?, ?, 'TRANSFER_IN', 'WAREHOUSE_TRANSFER', ?, ?, ?, 0, ?, ?, ?, ?)`
        ).run(tDate, pid, to_warehouse_id, trId, trNum, qty, prod.avg_cost, newToBal, `تحويل وارد مستند ${trNum}`, actor.userId);
      }

      logAudit(db, actor.userId, actor.username, 'CREATE', 'WAREHOUSE_TRANSFER', trId, trNum, null, { items_count: items.length }, 'تحويل بضاعة بين المخازن');
      return { id: trId, transfer_number: trNum };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ==========================================
  // ACCOUNTS: Statement, Debt Aging, Receipts & Payments
  // ==========================================
  router.get('/accounts/statement', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { party_type, party_id, from, to } = req.query;
    if (!party_type || !party_id) return res.status(400).json({ error: 'حدد الطرف' });

    const party =
      party_type === 'CUSTOMER'
        ? db.prepare('SELECT * FROM customers WHERE id = ?').get(party_id)
        : db.prepare('SELECT * FROM suppliers WHERE id = ?').get(party_id);
    if (!party) return res.status(404).json({ error: 'الحساب غير موجود' });

    let sql = `
      SELECT at.*, u.username as user_name
      FROM account_transactions at
      JOIN users u ON at.user_id = u.id
      WHERE at.party_type = ? AND at.party_id = ?
    `;
    const params: unknown[] = [party_type, party_id];
    if (from) { sql += ' AND substr(at.tx_date, 1, 10) >= ?'; params.push(from); }
    if (to) { sql += ' AND substr(at.tx_date, 1, 10) <= ?'; params.push(to); }
    sql += ' ORDER BY at.id ASC';

    res.json({ party, transactions: db.prepare(sql).all(...params) });
  });

  router.get('/accounts/aging', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const partyType = String(req.query.party_type || 'CUSTOMER');
    const now = Date.now();

    if (partyType === 'CUSTOMER') {
      const custs = db.prepare('SELECT * FROM customers WHERE is_walkin = 0 AND current_balance > 0').all() as Array<Record<string, unknown>>;
      const result = custs.map((c) => {
        const lastTx = db
          .prepare("SELECT MAX(tx_date) as d FROM account_transactions WHERE party_type = 'CUSTOMER' AND party_id = ? AND debit > 0")
          .get(c.id) as { d: string | null };
        const days = lastTx?.d ? Math.max(0, Math.floor((now - new Date(lastTx.d).getTime()) / 86400000)) : 0;
        const bal = Number(c.current_balance);
        return {
          ...c,
          last_invoice_date: lastTx?.d || '-',
          days_outstanding: days,
          bucket_0_30: days <= 30 ? bal : 0,
          bucket_31_60: days > 30 && days <= 60 ? bal : 0,
          bucket_61_90: days > 60 && days <= 90 ? bal : 0,
          bucket_90_plus: days > 90 ? bal : 0,
        };
      });
      return res.json(result);
    }

    const sups = db.prepare('SELECT * FROM suppliers WHERE current_balance > 0').all() as Array<Record<string, unknown>>;
    const result = sups.map((s) => {
      const lastTx = db
        .prepare("SELECT MAX(tx_date) as d FROM account_transactions WHERE party_type = 'SUPPLIER' AND party_id = ? AND credit > 0")
        .get(s.id) as { d: string | null };
      const days = lastTx?.d ? Math.max(0, Math.floor((now - new Date(lastTx.d).getTime()) / 86400000)) : 0;
      const bal = Number(s.current_balance);
      return {
        ...s,
        last_invoice_date: lastTx?.d || '-',
        days_outstanding: days,
        bucket_0_30: days <= 30 ? bal : 0,
        bucket_31_60: days > 30 && days <= 60 ? bal : 0,
        bucket_61_90: days > 60 && days <= 90 ? bal : 0,
        bucket_90_plus: days > 90 ? bal : 0,
      };
    });
    res.json(result);
  });

  router.get('/receipts-payments', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(
      db
        .prepare(
          `SELECT rp.*, cb.name as cashbox_name, u.username as user_name,
            CASE WHEN rp.party_type = 'CUSTOMER' THEN (SELECT name FROM customers WHERE id = rp.party_id)
                 ELSE (SELECT name FROM suppliers WHERE id = rp.party_id) END as party_name
           FROM receipts_payments rp
           JOIN cashboxes cb ON rp.cashbox_id = cb.id
           JOIN users u ON rp.user_id = u.id
           ORDER BY rp.id DESC LIMIT 200`
        )
        .all()
    );
  });

  router.post('/receipts-payments', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const { voucher_date, kind, party_type, party_id, cashbox_id, amount, payment_method, reference_no, notes } = req.body;
    const amt = Number(amount);
    if (!party_id || !cashbox_id || amt <= 0) {
      return res.status(400).json({ error: 'يرجى تحديد الحساب والخزينة ومبلغ أكبر من صفر' });
    }

    const tx = db.transaction(() => {
      assertTxLicenseWitness(db, 'RECEIPT_PAY_POST');
      const prefix = kind === 'RECEIPT' ? 'REC' : 'PAY';
      const vNum = nextDocNumber(db, 'receipts_payments', 'voucher_number', prefix);
      const vDate = voucher_date || new Date().toISOString().slice(0, 10);

      const rpRes = db
        .prepare(
          `INSERT INTO receipts_payments (voucher_number, voucher_date, kind, party_type, party_id, cashbox_id, amount, payment_method, reference_no, notes, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(vNum, vDate, kind, party_type, party_id, cashbox_id, amt, payment_method || 'نقدي', reference_no || '', notes || '', actor.userId);

      if (party_type === 'CUSTOMER') {
        const cust = db.prepare('SELECT current_balance FROM customers WHERE id = ?').get(party_id) as { current_balance: number };
        const newBal = kind === 'RECEIPT' ? cust.current_balance - amt : cust.current_balance + amt;
        db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newBal, party_id);
        db.prepare(
          `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
           VALUES (?, 'CUSTOMER', ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(vDate, party_id, kind, vNum, kind === 'PAYMENT' ? amt : 0, kind === 'RECEIPT' ? amt : 0, newBal, notes || `سند ${kind === 'RECEIPT' ? 'قبض' : 'صرف'} ${vNum}`, actor.userId);
      } else {
        const sup = db.prepare('SELECT current_balance FROM suppliers WHERE id = ?').get(party_id) as { current_balance: number };
        const newBal = kind === 'PAYMENT' ? sup.current_balance - amt : sup.current_balance + amt;
        db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(newBal, party_id);
        db.prepare(
          `INSERT INTO account_transactions (tx_date, party_type, party_id, tx_type, reference_number, debit, credit, balance_after, notes, user_id)
           VALUES (?, 'SUPPLIER', ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(vDate, party_id, kind, vNum, kind === 'PAYMENT' ? amt : 0, kind === 'RECEIPT' ? amt : 0, newBal, notes || `سند ${kind === 'PAYMENT' ? 'صرف' : 'قبض'} ${vNum}`, actor.userId);
      }

      if (kind === 'RECEIPT') {
        db.prepare('UPDATE cashboxes SET current_balance = current_balance + ? WHERE id = ?').run(amt, cashbox_id);
      } else {
        db.prepare('UPDATE cashboxes SET current_balance = current_balance - ? WHERE id = ?').run(amt, cashbox_id);
      }
      const cbBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(cashbox_id) as { current_balance: number }).current_balance;
      db.prepare(
        `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(vDate, cashbox_id, kind, vNum, kind === 'RECEIPT' ? amt : 0, kind === 'PAYMENT' ? amt : 0, cbBal, notes || vNum, actor.userId);

      logAudit(db, actor.userId, actor.username, 'CREATE', 'RECEIPT_PAYMENT', Number(rpRes.lastInsertRowid), vNum, null, { amount: amt, kind }, 'تسجيل سند مالي');
      return { id: Number(rpRes.lastInsertRowid), voucher_number: vNum };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ==========================================
  // TREASURY: Expenses, Revenues, Cashbox Transfers & Ledger
  // ==========================================
  router.get('/treasury/vouchers', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(
      db
        .prepare(
          `SELECT er.*, ert.name as type_name, cb.name as cashbox_name, u.username as user_name
           FROM expenses_revenues er
           JOIN expense_revenue_types ert ON er.type_id = ert.id
           JOIN cashboxes cb ON er.cashbox_id = cb.id
           JOIN users u ON er.user_id = u.id
           ORDER BY er.id DESC LIMIT 200`
        )
        .all()
    );
  });

  router.post('/treasury/vouchers', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const { voucher_number, voucher_date, kind, type_id, cashbox_id, amount, payment_method, description, attachment_name } = req.body;
    const amt = Number(amount);
    if (!type_id || !cashbox_id || amt <= 0 || !description?.trim()) {
      return res.status(400).json({ error: 'يرجى تحديد البند والخزينة والبيان ومبلغ أكبر من صفر' });
    }

    const tx = db.transaction(() => {
      assertTxLicenseWitness(db, 'TREASURY_VOUCHER');
      const prefix = kind === 'EXPENSE' ? 'EXP' : 'REV';
      const vNum = voucher_number?.trim() || nextDocNumber(db, 'expenses_revenues', 'voucher_number', prefix);
      const dup = db.prepare('SELECT id FROM expenses_revenues WHERE voucher_number = ?').get(vNum);
      if (dup) throw new Error(`رقم السند ${vNum} مسجل مسبقًا (منع التكرار)`);

      const vDate = voucher_date || new Date().toISOString().slice(0, 10);
      const resV = db
        .prepare(
          `INSERT INTO expenses_revenues (voucher_number, voucher_date, kind, type_id, cashbox_id, amount, payment_method, description, attachment_name, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(vNum, vDate, kind, type_id, cashbox_id, amt, payment_method || 'نقدي', description.trim(), attachment_name || '', actor.userId);

      if (kind === 'EXPENSE') {
        db.prepare('UPDATE cashboxes SET current_balance = current_balance - ? WHERE id = ?').run(amt, cashbox_id);
      } else {
        db.prepare('UPDATE cashboxes SET current_balance = current_balance + ? WHERE id = ?').run(amt, cashbox_id);
      }
      const cbBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(cashbox_id) as { current_balance: number }).current_balance;
      db.prepare(
        `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(vDate, cashbox_id, kind, vNum, kind === 'REVENUE' ? amt : 0, kind === 'EXPENSE' ? amt : 0, cbBal, description.trim(), actor.userId);

      logAudit(db, actor.userId, actor.username, 'CREATE', 'EXPENSE_REVENUE', Number(resV.lastInsertRowid), vNum, null, { kind, amount: amt }, description.trim());
      return { id: Number(resV.lastInsertRowid), voucher_number: vNum };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/treasury/transfers', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(
      db
        .prepare(
          `SELECT ct.*, cf.name as from_name, cto.name as to_name, u.username as user_name
           FROM cashbox_transfers ct
           JOIN cashboxes cf ON ct.from_cashbox_id = cf.id
           JOIN cashboxes cto ON ct.to_cashbox_id = cto.id
           JOIN users u ON ct.user_id = u.id
           ORDER BY ct.id DESC LIMIT 100`
        )
        .all()
    );
  });

  router.post('/treasury/transfers', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const { from_cashbox_id, to_cashbox_id, transfer_date, amount, notes } = req.body;
    const amt = Number(amount);
    if (!from_cashbox_id || !to_cashbox_id || from_cashbox_id === to_cashbox_id || amt <= 0) {
      return res.status(400).json({ error: 'يرجى تحديد خزينتين مختلفتين ومبلغ أكبر من صفر' });
    }

    const tx = db.transaction(() => {
      const tNum = nextDocNumber(db, 'cashbox_transfers', 'transfer_number', 'CBT');
      const tDate = transfer_date || new Date().toISOString().slice(0, 10);

      const fromCb = db.prepare('SELECT current_balance, name FROM cashboxes WHERE id = ?').get(from_cashbox_id) as { current_balance: number; name: string };
      if (fromCb.current_balance < amt) throw new Error(`رصيد "${fromCb.name}" غير كافٍ للتحويل`);

      db.prepare('INSERT INTO cashbox_transfers (transfer_number, transfer_date, from_cashbox_id, to_cashbox_id, amount, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        tNum,
        tDate,
        from_cashbox_id,
        to_cashbox_id,
        amt,
        notes || '',
        actor.userId
      );

      db.prepare('UPDATE cashboxes SET current_balance = current_balance - ? WHERE id = ?').run(amt, from_cashbox_id);
      db.prepare('UPDATE cashboxes SET current_balance = current_balance + ? WHERE id = ?').run(amt, to_cashbox_id);

      const fromBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(from_cashbox_id) as { current_balance: number }).current_balance;
      const toBal = (db.prepare('SELECT current_balance FROM cashboxes WHERE id = ?').get(to_cashbox_id) as { current_balance: number }).current_balance;

      db.prepare(
        `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
         VALUES (?, ?, 'TRANSFER_OUT', ?, 0, ?, ?, ?, ?)`
      ).run(tDate, from_cashbox_id, tNum, amt, fromBal, `تحويل صادر ${tNum}`, actor.userId);

      db.prepare(
        `INSERT INTO cashbox_movements (movement_date, cashbox_id, movement_type, reference_number, amount_in, amount_out, balance_after, notes, user_id)
         VALUES (?, ?, 'TRANSFER_IN', ?, ?, 0, ?, ?, ?)`
      ).run(tDate, to_cashbox_id, tNum, amt, toBal, `تحويل وارد ${tNum}`, actor.userId);

      return { transfer_number: tNum };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/treasury/ledger/:cashboxId', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const cashbox = db.prepare('SELECT * FROM cashboxes WHERE id = ?').get(req.params.cashboxId);
    const movements = db
      .prepare(
        `SELECT cm.*, u.username as user_name FROM cashbox_movements cm JOIN users u ON cm.user_id = u.id
         WHERE cm.cashbox_id = ? ORDER BY cm.id DESC LIMIT 300`
      )
      .all(req.params.cashboxId);
    res.json({ cashbox, movements });
  });

  // ==========================================
  // OPERATIONS: Bulk Price Update & Checks/Installments
  // ==========================================
  router.post('/operations/bulk-price-update', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const { category_id, target_field, mode, value } = req.body;
    const val = Number(value);
    if (!['sale_price', 'wholesale_price', 'special_price'].includes(target_field)) {
      return res.status(400).json({ error: 'حقل السعر غير صالح' });
    }
    if (Number.isNaN(val) || val === 0) {
      return res.status(400).json({ error: 'يرجى إدخال قيمة تعديل صالحة' });
    }

    const tx = db.transaction(() => {
      const products = category_id
        ? (db.prepare('SELECT id, sale_price, wholesale_price, special_price FROM products WHERE category_id = ? AND is_active = 1').all(Number(category_id)) as Array<Record<string, number>>)
        : (db.prepare('SELECT id, sale_price, wholesale_price, special_price FROM products WHERE is_active = 1').all() as Array<Record<string, number>>);

      let updated = 0;
      for (const p of products) {
        const curr = Number(p[target_field] || 0);
        const nextVal = mode === 'PERCENT' ? Math.max(0, Number((curr * (1 + val / 100)).toFixed(2))) : Math.max(0, Number((curr + val).toFixed(2)));
        db.prepare(`UPDATE products SET ${target_field} = ? WHERE id = ?`).run(nextVal, p.id);
        updated++;
      }

      logAudit(db, actor.userId, actor.username, 'UPDATE', 'BULK_PRICE', category_id || 'ALL', '', null, { target_field, mode, value: val, updated }, 'تحديث أسعار جماعي');
      return { updated };
    });

    res.json(tx());
  });

  router.get('/operations/checks', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(
      db
        .prepare(
          `SELECT ci.*,
            CASE WHEN ci.party_type = 'CUSTOMER' THEN (SELECT name FROM customers WHERE id = ci.party_id)
                 ELSE (SELECT name FROM suppliers WHERE id = ci.party_id) END as party_name
           FROM checks_installments ci ORDER BY ci.due_date ASC`
        )
        .all()
    );
  });

  router.post('/operations/checks', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const { record_type, party_type, party_id, doc_number, bank_name, due_date, amount, notes } = req.body;
      const amt = Number(amount);
      if (!party_id || !doc_number?.trim() || !due_date || Number.isNaN(amt) || amt <= 0) {
        return res.status(400).json({ error: 'يرجى تحديد الطرف ورقم المستند وتاريخ الاستحقاق ومبلغ أكبر من صفر' });
      }
      const info = db
        .prepare(
          `INSERT INTO checks_installments (record_type, party_type, party_id, doc_number, bank_name, due_date, amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(record_type || 'CHECK', party_type || 'CUSTOMER', party_id, doc_number.trim(), bank_name || '', due_date, amt, notes || '');
      res.json({ id: info.lastInsertRowid });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message || 'تعذر تسجيل الشيك / القسط' });
    }
  });

  router.patch('/operations/checks/:id/status', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const { status } = req.body;
      if (!['PENDING', 'COLLECTED', 'BOUNCED', 'PAID'].includes(String(status || ''))) {
        return res.status(400).json({ error: 'حالة الشيك / القسط غير صالحة' });
      }
      db.prepare('UPDATE checks_installments SET status = ? WHERE id = ?').run(status, req.params.id);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message || 'تعذر تحديث الحالة' });
    }
  });

  return router;
}

