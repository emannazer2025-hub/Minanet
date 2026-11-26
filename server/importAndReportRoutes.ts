import express from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { getDb, DB_PATH, reloadDb, getBackupsDir, resetCleanBusinessDatabase } from './db.ts';
import { formatBackupDateTimeFilename } from '../shared/dbSchema.ts';
import { getActor, getLicenseState, logAudit, nextDocNumber, requireOperationalLicense } from './erpRoutes.ts';
import { assertTxLicenseWitness, verifyRuntimeIntegrity } from './licenseGuard.ts';
import {
  autoMapColumns,
  type ColumnMapping,
  detectHeaderRowIndex,
  parseUploadedFile,
} from './importParser.ts';
import {
  decodeActivationCode,
  getDeviceFingerprint,
  verifySignedLicense,
} from './licenseCrypto.ts';

export function createImportAndReportRouter(): express.Router {
  const router = express.Router();

  // ==========================================
  // SMART DATA IMPORT ENGINE
  // ==========================================
  router.post('/import/analyze', requireOperationalLicense, (req, res) => {
    try {
      const { fileName, base64Content, sheetIndex, headerRowIndex } = req.body as {
        fileName: string;
        base64Content: string;
        sheetIndex?: number;
        headerRowIndex?: number;
      };
      if (!fileName || !base64Content) {
        return res.status(400).json({ error: 'يرجى إرفاق ملف صالح' });
      }

      const parsed = parseUploadedFile(fileName, base64Content);
      if (parsed.sheets.length === 0) {
        return res.status(400).json({ error: 'الملف لا يحتوي على أي جداول أو أوراق عمل' });
      }

      const activeIdx = Math.min(sheetIndex ?? 0, parsed.sheets.length - 1);
      const sheet = parsed.sheets[activeIdx];
      const detectedHeaderIdx = headerRowIndex !== undefined ? headerRowIndex : detectHeaderRowIndex(sheet.rows);
      const headerRow = sheet.rows[detectedHeaderIdx] || [];
      const dataRows = sheet.rows.slice(detectedHeaderIdx + 1).filter((r) => r.some((c) => String(c || '').trim() !== ''));
      const mapping = autoMapColumns(headerRow);

      res.json({
        fileType: parsed.fileType,
        sheets: parsed.sheets.map((s, idx) => ({ index: idx, name: s.name, rowCount: s.rows.length })),
        activeSheetIndex: activeIdx,
        headerRowIndex: detectedHeaderIdx,
        headers: headerRow,
        mapping,
        totalRows: dataRows.length,
        previewRows: dataRows.slice(0, 100),
      });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/import/validate', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const { fileName, base64Content, sheetIndex, headerRowIndex, mapping } = req.body as {
        fileName: string;
        base64Content: string;
        sheetIndex: number;
        headerRowIndex: number;
        mapping: ColumnMapping;
      };

      const parsed = parseUploadedFile(fileName, base64Content);
      const sheet = parsed.sheets[sheetIndex || 0];
      const dataRows = sheet.rows.slice((headerRowIndex || 0) + 1).filter((r) => r.some((c) => String(c || '').trim() !== ''));

      const existingCodes = new Set(
        (db.prepare('SELECT code FROM products').all() as Array<{ code: string }>).map((r) => r.code.trim().toLowerCase())
      );
      const existingBarcodes = new Set(
        (db.prepare("SELECT barcode FROM products WHERE barcode != ''").all() as Array<{ barcode: string }>).map((r) => r.barcode.trim())
      );

      const seenCodesInFile = new Set<string>();
      const seenBarcodesInFile = new Set<string>();

      const issues: Array<{ rowNumber: number; type: 'ERROR' | 'WARNING'; message: string; name: string }> = [];
      let existingMatchCount = 0;
      let newCount = 0;

      dataRows.forEach((row, idx) => {
        const rowNum = (headerRowIndex || 0) + 2 + idx;
        const val = (col: number | null) => (col !== null && col !== undefined ? String(row[col] ?? '').trim() : '');

        const name = val(mapping.name);
        const code = val(mapping.code);
        const barcode = val(mapping.barcode);
        const pPrice = mapping.purchase_price !== null ? Number(val(mapping.purchase_price) || 0) : 0;
        const sPrice = mapping.sale_price !== null ? Number(val(mapping.sale_price) || 0) : 0;
        const qty = mapping.quantity !== null ? Number(val(mapping.quantity) || 0) : 0;

        if (!name && mapping.name !== null) {
          issues.push({ rowNumber: rowNum, type: 'ERROR', message: 'اسم الصنف مفقود', name: code || '-' });
        }
        if (Number.isNaN(pPrice) || pPrice < 0) {
          issues.push({ rowNumber: rowNum, type: 'ERROR', message: 'سعر الشراء غير صالح أو سالب', name });
        }
        if (Number.isNaN(sPrice) || sPrice < 0) {
          issues.push({ rowNumber: rowNum, type: 'ERROR', message: 'سعر البيع غير صالح أو سالب', name });
        }
        if (Number.isNaN(qty) || qty < 0) {
          issues.push({ rowNumber: rowNum, type: 'ERROR', message: 'الكمية غير صالحة أو سالبة', name });
        }

        if (code) {
          const lc = code.toLowerCase();
          if (seenCodesInFile.has(lc)) {
            issues.push({ rowNumber: rowNum, type: 'WARNING', message: `كود مكرر داخل الملف: ${code}`, name });
          }
          seenCodesInFile.add(lc);
        }
        if (barcode) {
          if (seenBarcodesInFile.has(barcode)) {
            issues.push({ rowNumber: rowNum, type: 'WARNING', message: `باركود مكرر داخل الملف: ${barcode}`, name });
          }
          seenBarcodesInFile.add(barcode);
        }

        const exists = (code && existingCodes.has(code.toLowerCase())) || (barcode && existingBarcodes.has(barcode));
        if (exists) existingMatchCount++;
        else newCount++;
      });

      res.json({
        totalRows: dataRows.length,
        existingMatchCount,
        newCount,
        errorCount: issues.filter((i) => i.type === 'ERROR').length,
        warningCount: issues.filter((i) => i.type === 'WARNING').length,
        issues: issues.slice(0, 200),
      });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/import/execute', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const {
      fileName,
      base64Content,
      sheetIndex,
      headerRowIndex,
      mapping,
      duplicatePolicy,
      updateScope,
      warehouseId,
    } = req.body as {
      fileName: string;
      base64Content: string;
      sheetIndex: number;
      headerRowIndex: number;
      mapping: ColumnMapping;
      duplicatePolicy: 'skip' | 'update' | 'create_new';
      updateScope: 'master' | 'prices_only' | 'opening_stock';
      warehouseId: number;
    };

    try {
      const parsed = parseUploadedFile(fileName, base64Content);
      const sheet = parsed.sheets[sheetIndex || 0];
      const dataRows = sheet.rows.slice((headerRowIndex || 0) + 1).filter((r) => r.some((c) => String(c || '').trim() !== ''));

      const result = db.transaction(() => {
        assertTxLicenseWitness(db, 'IMPORT_EXEC');
        const defaultUnitId =
          (db.prepare('SELECT id FROM units ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined)?.id || 1;
        const targetWhId = Number(warehouseId || 1);
        const today = new Date().toISOString().slice(0, 10);

        const jobRes = db
          .prepare(
            `INSERT INTO import_jobs (file_name, file_type, total_rows, duplicate_policy, update_scope, user_id)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(fileName, parsed.fileType, dataRows.length, duplicatePolicy, updateScope, actor.userId);
        const jobId = Number(jobRes.lastInsertRowid);

        let insertedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const affectedProductIds: number[] = [];
        let openingAdjId: number | null = null;
        let openingDocNum = '';

        const ensureAdjustmentHeader = () => {
          if (!openingAdjId) {
            openingDocNum = nextDocNumber(db, 'stock_adjustments', 'doc_number', 'IMP');
            const r = db
              .prepare(
                `INSERT INTO stock_adjustments (doc_number, doc_date, warehouse_id, doc_type, reason, user_id)
                 VALUES (?, ?, ?, 'OPENING', ?, ?)`
              )
              .run(openingDocNum, today, targetWhId, `أرصدة استيراد ذكي (${fileName})`, actor.userId);
            openingAdjId = Number(r.lastInsertRowid);
          }
          return openingAdjId;
        };

        for (let idx = 0; idx < dataRows.length; idx++) {
          const row = dataRows[idx];
          const rowNum = (headerRowIndex || 0) + 2 + idx;
          const val = (col: number | null) => (col !== null && col !== undefined ? String(row[col] ?? '').trim() : '');

          try {
            const name = val(mapping.name);
            let code = val(mapping.code);
            const altName = val(mapping.alt_name);
            const barcode = val(mapping.barcode);
            const catName = val(mapping.category);
            const unitName = val(mapping.unit);
            const pPrice = mapping.purchase_price !== null && val(mapping.purchase_price) !== '' ? Number(val(mapping.purchase_price)) : null;
            const sPrice = mapping.sale_price !== null && val(mapping.sale_price) !== '' ? Number(val(mapping.sale_price)) : null;
            const wPrice = mapping.wholesale_price !== null && val(mapping.wholesale_price) !== '' ? Number(val(mapping.wholesale_price)) : null;
            const spPrice = mapping.special_price !== null && val(mapping.special_price) !== '' ? Number(val(mapping.special_price)) : null;
            const qty = mapping.quantity !== null && val(mapping.quantity) !== '' ? Number(val(mapping.quantity)) : 0;
            const minStock = mapping.min_stock !== null && val(mapping.min_stock) !== '' ? Number(val(mapping.min_stock)) : 0;
            const reorderLevel = mapping.reorder_level !== null && val(mapping.reorder_level) !== '' ? Number(val(mapping.reorder_level)) : 5;
            const notes = val(mapping.notes);

            if ((pPrice !== null && (Number.isNaN(pPrice) || pPrice < 0)) || (sPrice !== null && (Number.isNaN(sPrice) || sPrice < 0))) {
              throw new Error('سعر سالب أو غير رقمي');
            }
            if (Number.isNaN(qty) || qty < 0) {
              throw new Error('الكمية سالبة أو غير رقمية');
            }

            // Find existing by code or barcode
            let existing: Record<string, unknown> | undefined;
            if (code) {
              existing = db.prepare('SELECT * FROM products WHERE code = ?').get(code) as Record<string, unknown> | undefined;
            }
            if (!existing && barcode) {
              existing = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode) as Record<string, unknown> | undefined;
            }

            // Resolve category & unit
            let categoryId: number | null = null;
            if (catName) {
              const catRow = db.prepare('SELECT id FROM categories WHERE name = ?').get(catName) as { id: number } | undefined;
              if (catRow) categoryId = catRow.id;
              else {
                categoryId = Number(db.prepare('INSERT INTO categories (name) VALUES (?)').run(catName).lastInsertRowid);
              }
            }

            let unitId = defaultUnitId;
            if (unitName) {
              const uRow = db.prepare('SELECT id FROM units WHERE name = ?').get(unitName) as { id: number } | undefined;
              if (uRow) unitId = uRow.id;
              else {
                unitId = Number(db.prepare('INSERT INTO units (name) VALUES (?)').run(unitName).lastInsertRowid);
              }
            }

            if (existing) {
              if (duplicatePolicy === 'skip') {
                skippedCount++;
                continue;
              }
              if (duplicatePolicy === 'update') {
                const pid = Number(existing.id);
                if (updateScope === 'prices_only') {
                  db.prepare(
                    `UPDATE products SET
                      purchase_price = COALESCE(?, purchase_price),
                      sale_price = COALESCE(?, sale_price),
                      wholesale_price = COALESCE(?, wholesale_price),
                      special_price = COALESCE(?, special_price)
                     WHERE id = ?`
                  ).run(pPrice, sPrice, wPrice, spPrice, pid);
                } else {
                  db.prepare(
                    `UPDATE products SET
                      name = COALESCE(NULLIF(?, ''), name),
                      alt_name = COALESCE(NULLIF(?, ''), alt_name),
                      category_id = COALESCE(?, category_id),
                      purchase_price = COALESCE(?, purchase_price),
                      sale_price = COALESCE(?, sale_price),
                      wholesale_price = COALESCE(?, wholesale_price),
                      special_price = COALESCE(?, special_price),
                      notes = COALESCE(NULLIF(?, ''), notes)
                     WHERE id = ?`
                  ).run(name, altName, categoryId, pPrice, sPrice, wPrice, spPrice, notes, pid);
                }
                if (updateScope === 'opening_stock' && qty > 0) {
                  const adjId = ensureAdjustmentHeader();
                  const wsRow = db.prepare('SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(targetWhId, pid) as { quantity: number } | undefined;
                  const bookQty = wsRow ? wsRow.quantity : 0;
                  const newBal = bookQty + qty;
                  if (wsRow) {
                    db.prepare('UPDATE warehouse_stock SET quantity = ? WHERE warehouse_id = ? AND product_id = ?').run(newBal, targetWhId, pid);
                  } else {
                    db.prepare('INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)').run(targetWhId, pid, newBal);
                  }
                  db.prepare('INSERT INTO stock_adjustment_items (adjustment_id, product_id, book_qty, actual_qty, diff_qty, unit_cost) VALUES (?, ?, ?, ?, ?, ?)').run(
                    adjId,
                    pid,
                    bookQty,
                    newBal,
                    qty,
                    pPrice ?? Number(existing.avg_cost)
                  );
                  db.prepare(
                    `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
                     VALUES (?, ?, ?, 'IMPORT_OPENING', 'IMPORT_JOB', ?, ?, ?, 0, ?, ?, ?, ?)`
                  ).run(today, pid, targetWhId, jobId, openingDocNum, qty, pPrice ?? Number(existing.avg_cost), newBal, `استيراد رصيد (${fileName})`, actor.userId);
                }
                updatedCount++;
                continue;
              }
              // duplicatePolicy === 'create_new' -> generate unique code
              code = `${code || 'IMP'}-${Date.now().toString().slice(-4)}-${idx + 1}`;
            }

            if (!name) {
              throw new Error('اسم الصنف مطلوب لإنشاء صنف جديد');
            }
            const finalCode = code || `IMP-${jobId}-${idx + 1}`;
            const finalPur = pPrice ?? 0;
            const finalSale = sPrice ?? finalPur;

            const pRes = db
              .prepare(
                `INSERT INTO products (code, name, alt_name, barcode, category_id, base_unit_id, purchase_price, last_cost, avg_cost, sale_price, wholesale_price, special_price, min_stock, reorder_level, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                finalCode,
                name,
                altName,
                duplicatePolicy === 'create_new' && existing ? '' : barcode,
                categoryId,
                unitId,
                finalPur,
                finalPur,
                finalPur,
                finalSale,
                wPrice ?? finalSale,
                spPrice ?? finalSale,
                minStock,
                reorderLevel,
                notes
              );
            const pid = Number(pRes.lastInsertRowid);
            affectedProductIds.push(pid);

            if (barcode && !(duplicatePolicy === 'create_new' && existing)) {
              db.prepare('INSERT OR IGNORE INTO barcodes (product_id, barcode, unit_id) VALUES (?, ?, ?)').run(pid, barcode, unitId);
            }

            if (updateScope === 'opening_stock' && qty > 0) {
              const adjId = ensureAdjustmentHeader();
              db.prepare('INSERT INTO warehouse_stock (warehouse_id, product_id, quantity) VALUES (?, ?, ?)').run(targetWhId, pid, qty);
              db.prepare('INSERT INTO stock_adjustment_items (adjustment_id, product_id, book_qty, actual_qty, diff_qty, unit_cost) VALUES (?, ?, 0, ?, ?, ?)').run(
                adjId,
                pid,
                qty,
                qty,
                finalPur
              );
              db.prepare(
                `INSERT INTO stock_movements (movement_date, product_id, warehouse_id, movement_type, reference_type, reference_id, reference_number, qty_in, qty_out, unit_cost, balance_after, notes, user_id)
                 VALUES (?, ?, ?, 'IMPORT_OPENING', 'IMPORT_JOB', ?, ?, ?, 0, ?, ?, ?, ?)`
              ).run(today, pid, targetWhId, jobId, openingDocNum, qty, finalPur, qty, `رصيد افتتاحي مستورد (${fileName})`, actor.userId);
            }

            insertedCount++;
          } catch (rowErr: unknown) {
            errorCount++;
            db.prepare('INSERT INTO import_errors (import_job_id, row_number, raw_data, error_message) VALUES (?, ?, ?, ?)').run(
              jobId,
              rowNum,
              JSON.stringify(row),
              (rowErr as Error).message
            );
          }
        }

        db.prepare(
          `UPDATE import_jobs SET inserted_count = ?, updated_count = ?, skipped_count = ?, error_count = ?, affected_product_ids = ?, adjustment_id = ? WHERE id = ?`
        ).run(insertedCount, updatedCount, skippedCount, errorCount, JSON.stringify(affectedProductIds), openingAdjId, jobId);

        logAudit(
          db,
          actor.userId,
          actor.username,
          'IMPORT',
          'IMPORT_JOB',
          jobId,
          fileName,
          null,
          { insertedCount, updatedCount, skippedCount, errorCount },
          `استيراد ذكي من ملف ${fileName}`
        );

        const errors = db.prepare('SELECT * FROM import_errors WHERE import_job_id = ?').all(jobId);
        return { jobId, insertedCount, updatedCount, skippedCount, errorCount, errors, openingDocNum };
      });

      res.json(result());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/import/jobs', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(
      db
        .prepare(
          `SELECT ij.*, u.username as user_name FROM import_jobs ij JOIN users u ON ij.user_id = u.id ORDER BY ij.id DESC LIMIT 50`
        )
        .all()
    );
  });

  router.post('/import/jobs/:id/rollback', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const id = Number(req.params.id);

    const tx = db.transaction(() => {
      const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!job) throw new Error('سجل الاستيراد غير موجود');
      if (Number(job.is_rolled_back) === 1) throw new Error('تم التراجع عن عملية الاستيراد هذه مسبقًا');

      const productIds: number[] = JSON.parse(String(job.affected_product_ids || '[]'));
      if (productIds.length === 0) throw new Error('لا توجد أصناف جديدة للتراجع عنها في هذه العملية');

      // Ensure no subsequent operational movements exist on these products
      const placeholders = productIds.map(() => '?').join(',');
      const usedInSales = (
        db.prepare(`SELECT COUNT(*) as c FROM sales_items WHERE product_id IN (${placeholders})`).get(...productIds) as { c: number }
      ).c;
      const usedInPurchases = (
        db.prepare(`SELECT COUNT(*) as c FROM purchase_items WHERE product_id IN (${placeholders})`).get(...productIds) as { c: number }
      ).c;

      if (usedInSales > 0 || usedInPurchases > 0) {
        throw new Error('لا يمكن التراجع عن الاستيراد لأن بعض الأصناف المستوردة دخلت بالفعل في فواتير بيع أو شراء');
      }

      db.prepare(`DELETE FROM stock_movements WHERE reference_type = 'IMPORT_JOB' AND reference_id = ?`).run(id);
      if (job.adjustment_id) {
        db.prepare('DELETE FROM stock_adjustments WHERE id = ?').run(job.adjustment_id);
      }
      db.prepare(`DELETE FROM warehouse_stock WHERE product_id IN (${placeholders})`).run(...productIds);
      db.prepare(`DELETE FROM barcodes WHERE product_id IN (${placeholders})`).run(...productIds);
      db.prepare(`DELETE FROM products WHERE id IN (${placeholders})`).run(...productIds);

      db.prepare('UPDATE import_jobs SET is_rolled_back = 1 WHERE id = ?').run(id);
      logAudit(db, actor.userId, actor.username, 'ROLLBACK', 'IMPORT_JOB', id, String(job.file_name), null, { deleted_products: productIds.length }, 'التراجع الآمن عن الاستيراد');
      return { deleted: productIds.length };
    });

    try {
      res.json(tx());
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/import/template', requireOperationalLicense, (_req, res) => {
    const headers = [
      'كود الصنف',
      'اسم الصنف',
      'الباركود',
      'الفئة',
      'الوحدة',
      'سعر الشراء',
      'سعر البيع',
      'سعر الجملة',
      'الكمية',
      'الحد الأدنى',
      'ملاحظات',
    ];
    const sample = ['2001', 'شاحن أنكر 20 وات', '622100002001', 'إكسسوارات كمبيوتر', 'قطعة', 250, 350, 310, 15, 3, 'صنف مستورد من القالب'];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الأصناف');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="MINA_NET_PRODUCTS_TEMPLATE.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  });

  router.get('/import/export-products', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT p.code as 'كود الصنف', p.name as 'اسم الصنف', p.barcode as 'الباركود',
          c.name as 'الفئة', u.name as 'الوحدة', p.purchase_price as 'سعر الشراء',
          p.avg_cost as 'متوسط التكلفة', p.sale_price as 'سعر البيع', p.wholesale_price as 'سعر الجملة',
          COALESCE((SELECT SUM(quantity) FROM warehouse_stock WHERE product_id = p.id), 0) as 'الكمية'
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN units u ON p.base_unit_id = u.id
         WHERE p.is_active = 1
         ORDER BY p.id ASC`
      )
      .all();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الأصناف الحالية');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="MINA_NET_PRODUCTS_EXPORT.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  });

  // ==========================================
  // REPORTS CENTER
  // ==========================================
  router.get('/reports/generate', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const { type, from, to, warehouse_id, customer_id, supplier_id, user_id } = req.query;
    const fDate = String(from || '2000-01-01');
    const tDate = String(to || '2099-12-31');

    if (type === 'SALES_SUMMARY') {
      let sql = `SELECT si.invoice_number as 'رقم الفاتورة', si.invoice_date as 'التاريخ', c.name as 'العميل',
        w.name as 'المخزن', si.payment_type as 'نوع الدفع', si.net_total as 'صافي الفاتورة',
        si.total_cost as 'التكلفة', si.gross_profit as 'الربح', si.paid_amount as 'المدفوع', si.remaining_amount as 'المتبقي', u.username as 'المستخدم'
        FROM sales_invoices si
        JOIN customers c ON si.customer_id = c.id
        JOIN warehouses w ON si.warehouse_id = w.id
        JOIN users u ON si.user_id = u.id
        WHERE si.status = 'APPROVED' AND substr(si.invoice_date,1,10) BETWEEN ? AND ?`;
      const p: unknown[] = [fDate, tDate];
      if (warehouse_id) { sql += ' AND si.warehouse_id = ?'; p.push(Number(warehouse_id)); }
      if (customer_id) { sql += ' AND si.customer_id = ?'; p.push(Number(customer_id)); }
      if (user_id) { sql += ' AND si.user_id = ?'; p.push(Number(user_id)); }
      return res.json({ title: 'تقرير المبيعات التفصيلي', rows: db.prepare(sql + ' ORDER BY si.id DESC').all(...p) });
    }

    if (type === 'PURCHASES_SUMMARY') {
      let sql = `SELECT pi.invoice_number as 'رقم الفاتورة', pi.invoice_date as 'التاريخ', s.name as 'المورد',
        w.name as 'المخزن', pi.payment_type as 'النوع', pi.net_total as 'الصافي',
        pi.paid_amount as 'المدفوع', pi.remaining_amount as 'المتبقي', u.username as 'المستخدم'
        FROM purchase_invoices pi
        JOIN suppliers s ON pi.supplier_id = s.id
        JOIN warehouses w ON pi.warehouse_id = w.id
        JOIN users u ON pi.user_id = u.id
        WHERE pi.status = 'APPROVED' AND substr(pi.invoice_date,1,10) BETWEEN ? AND ?`;
      const p: unknown[] = [fDate, tDate];
      if (warehouse_id) { sql += ' AND pi.warehouse_id = ?'; p.push(Number(warehouse_id)); }
      if (supplier_id) { sql += ' AND pi.supplier_id = ?'; p.push(Number(supplier_id)); }
      return res.json({ title: 'تقرير المشتريات التفصيلي', rows: db.prepare(sql + ' ORDER BY pi.id DESC').all(...p) });
    }

    if (type === 'RETURNS') {
      const salesRet = db
        .prepare(
          `SELECT 'مرتجع مبيعات' as 'النوع', sr.return_number as 'رقم المستند', sr.return_date as 'التاريخ',
            c.name as 'الطرف', sr.total_amount as 'القيمة', sr.reason as 'السبب'
           FROM sales_returns sr JOIN customers c ON sr.customer_id = c.id
           WHERE substr(sr.return_date,1,10) BETWEEN ? AND ?`
        )
        .all(fDate, tDate);
      const purRet = db
        .prepare(
          `SELECT 'مرتجع مشتريات' as 'النوع', pr.return_number as 'رقم المستند', pr.return_date as 'التاريخ',
            s.name as 'الطرف', pr.total_amount as 'القيمة', pr.reason as 'السبب'
           FROM purchase_returns pr JOIN suppliers s ON pr.supplier_id = s.id
           WHERE substr(pr.return_date,1,10) BETWEEN ? AND ?`
        )
        .all(fDate, tDate);
      return res.json({ title: 'تقرير مرتجعات البيع والشراء', rows: [...salesRet, ...purRet] });
    }

    if (type === 'INVENTORY_BALANCES') {
      let sql = `SELECT p.code as 'الكود', p.name as 'اسم الصنف', c.name as 'الفئة', u.name as 'الوحدة',
        COALESCE(SUM(ws.quantity), 0) as 'الرصيد الحالي', p.avg_cost as 'متوسط التكلفة',
        ROUND(COALESCE(SUM(ws.quantity), 0) * p.avg_cost, 2) as 'قيمة المخزون بالتكلفة',
        p.sale_price as 'سعر البيع'
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN units u ON p.base_unit_id = u.id
        LEFT JOIN warehouse_stock ws ON p.id = ws.product_id ${warehouse_id ? 'AND ws.warehouse_id = ?' : ''}
        WHERE p.is_active = 1 GROUP BY p.id ORDER BY p.id DESC`;
      const p = warehouse_id ? [Number(warehouse_id)] : [];
      return res.json({ title: 'تقرير أرصدة وتقييم المخزون', rows: db.prepare(sql).all(...p) });
    }

    if (type === 'PROFIT_LOSS') {
      const sales = db
        .prepare("SELECT COALESCE(SUM(net_total), 0) as rev, COALESCE(SUM(total_cost), 0) as cogs, COALESCE(SUM(gross_profit), 0) as gp FROM sales_invoices WHERE status = 'APPROVED' AND substr(invoice_date,1,10) BETWEEN ? AND ?")
        .get(fDate, tDate) as { rev: number; cogs: number; gp: number };
      const sRet = db
        .prepare('SELECT COALESCE(SUM(total_amount), 0) as amt, COALESCE(SUM(total_cost_reversed), 0) as cogs_rev FROM sales_returns WHERE substr(return_date,1,10) BETWEEN ? AND ?')
        .get(fDate, tDate) as { amt: number; cogs_rev: number };
      const exp = db
        .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses_revenues WHERE kind = 'EXPENSE' AND substr(voucher_date,1,10) BETWEEN ? AND ?")
        .get(fDate, tDate) as { total: number };
      const rev = db
        .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses_revenues WHERE kind = 'REVENUE' AND substr(voucher_date,1,10) BETWEEN ? AND ?")
        .get(fDate, tDate) as { total: number };

      const netSales = sales.rev - sRet.amt;
      const netCogs = sales.cogs - sRet.cogs_rev;
      const grossProfit = netSales - netCogs;
      const netProfit = grossProfit - exp.total + rev.total;

      return res.json({
        title: 'تقرير الأرباح والخسائر وتكلفة البضاعة المباعة',
        rows: [
          { 'البند المحاسبي': 'إجمالي المبيعات المعتمدة', 'القيمة': sales.rev },
          { 'البند المحاسبي': '(-) مرتجعات المبيعات', 'القيمة': -sRet.amt },
          { 'البند المحاسبي': 'صافي المبيعات', 'القيمة': netSales },
          { 'البند المحاسبي': '(-) صافي تكلفة البضاعة المباعة (COGS)', 'القيمة': -netCogs },
          { 'البند المحاسبي': 'مجمل ربح المبيعات', 'القيمة': grossProfit },
          { 'البند المحاسبي': '(+) الإيرادات الأخرى', 'القيمة': rev.total },
          { 'البند المحاسبي': '(-) المصروفات العمومية والتشغيلية', 'القيمة': -exp.total },
          { 'البند المحاسبي': 'صافي الربح / الخسارة', 'القيمة': netProfit },
        ],
      });
    }

    if (type === 'TOP_SELLING') {
      const rows = db
        .prepare(
          `SELECT p.code as 'الكود', p.name as 'الصنف', SUM(si.base_quantity) as 'الكمية المباعة',
            SUM(si.line_total) as 'إجمالي المبيعات', SUM(si.cost_at_sale) as 'التكلفة', SUM(si.line_profit) as 'الربح'
           FROM sales_items si
           JOIN sales_invoices inv ON si.sales_invoice_id = inv.id
           JOIN products p ON si.product_id = p.id
           WHERE inv.status = 'APPROVED' AND substr(inv.invoice_date,1,10) BETWEEN ? AND ?
           GROUP BY p.id ORDER BY SUM(si.line_total) DESC`
        )
        .all(fDate, tDate);
      return res.json({ title: 'تقرير الأصناف الأكثر مبيعًا وربحية', rows });
    }

    if (type === 'LOW_STOCK') {
      const rows = db
        .prepare(
          `SELECT p.code as 'الكود', p.name as 'الصنف', p.min_stock as 'الحد الأدنى', p.reorder_level as 'حد الطلب',
            COALESCE(SUM(ws.quantity), 0) as 'الرصيد المتاح'
           FROM products p LEFT JOIN warehouse_stock ws ON p.id = ws.product_id
           WHERE p.is_active = 1 GROUP BY p.id HAVING COALESCE(SUM(ws.quantity), 0) <= p.reorder_level`
        )
        .all();
      return res.json({ title: 'تقرير الأصناف تحت حد الطلب', rows });
    }

    if (type === 'EXPENSES_REVENUES') {
      const rows = db
        .prepare(
          `SELECT er.voucher_number as 'رقم السند', er.voucher_date as 'التاريخ',
            CASE WHEN er.kind='EXPENSE' THEN 'مصروف' ELSE 'إيراد' END as 'النوع',
            ert.name as 'التصنيف', cb.name as 'الخزينة', er.amount as 'المبلغ', er.description as 'البيان'
           FROM expenses_revenues er
           JOIN expense_revenue_types ert ON er.type_id = ert.id
           JOIN cashboxes cb ON er.cashbox_id = cb.id
           WHERE substr(er.voucher_date,1,10) BETWEEN ? AND ?
           ORDER BY er.id DESC`
        )
        .all(fDate, tDate);
      return res.json({ title: 'تقرير المصروفات والإيرادات', rows });
    }

    if (type === 'CASHBOX_MOVEMENT') {
      const rows = db
        .prepare(
          `SELECT cm.movement_date as 'التاريخ', cb.name as 'الخزينة / البنك', cm.movement_type as 'الحركة',
            cm.reference_number as 'المرجع', cm.amount_in as 'وارد', cm.amount_out as 'صادر',
            cm.balance_after as 'الرصيد بعد الحركة', cm.notes as 'البيان'
           FROM cashbox_movements cm JOIN cashboxes cb ON cm.cashbox_id = cb.id
           WHERE substr(cm.movement_date,1,10) BETWEEN ? AND ?
           ORDER BY cm.id DESC`
        )
        .all(fDate, tDate);
      return res.json({ title: 'تقرير حركة الخزائن والبنوك', rows });
    }

    res.json({ title: 'تقرير', rows: [] });
  });

  router.post('/reports/export-excel', requireOperationalLicense, (req, res) => {
    const { title, rows } = req.body as { title: string; rows: Array<Record<string, unknown>> };
    const ws = XLSX.utils.json_to_sheet(rows || []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="MINA_NET_REPORT.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
    void title;
  });

  // ==========================================
  // USERS, ROLES, PERMISSIONS & AUDIT LOGS
  // ==========================================
  router.get('/users', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(
      db
        .prepare(
          `SELECT u.id, u.username, u.full_name, u.role_id, u.is_active, u.allow_negative_stock, u.allow_price_change, u.created_at, r.name as role_name
           FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.id ASC`
        )
        .all()
    );
  });

  router.post('/users', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const actor = getActor(req);
      const { username, full_name, password, role_id, allow_negative_stock, allow_price_change } = req.body;
      if (!username?.trim() || !password) return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
      if (existing) return res.status(400).json({ error: 'اسم المستخدم مسجل مسبقًا، اختر اسمًا آخر' });
      const hash = bcrypt.hashSync(password, 10);
      const info = db
        .prepare(
          `INSERT INTO users (username, full_name, password_hash, role_id, allow_negative_stock, allow_price_change)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(username.trim(), full_name || username.trim(), hash, role_id || 1, allow_negative_stock ? 1 : 0, allow_price_change ? 1 : 0);
      logAudit(db, actor.userId, actor.username, 'CREATE', 'USER', Number(info.lastInsertRowid), username, null, { full_name, role_id }, 'إنشاء مستخدم جديد');
      res.json({ id: info.lastInsertRowid });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message || 'تعذر إنشاء المستخدم' });
    }
  });

  router.put('/users/:id', requireOperationalLicense, (req, res) => {
    try {
      const db = getDb();
      const actor = getActor(req);
      const userId = Number(req.params.id);
      const { username, full_name, password, role_id, is_active, allow_negative_stock, allow_price_change } = req.body;
      const target = db.prepare('SELECT id, username, role_id FROM users WHERE id = ?').get(userId) as
        | { id: number; username: string; role_id: number }
        | undefined;
      if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

      const cleanUsername = typeof username === 'string' && username.trim() ? username.trim() : target.username;
      const duplicate = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUsername, userId);
      if (duplicate) return res.status(400).json({ error: 'اسم الدخول مسجل لمستخدم آخر، اختر اسماً مختلفاً' });

      const nextRoleId = Number(role_id || target.role_id || 1);
      const nextIsActive = is_active === undefined ? 1 : is_active ? 1 : 0;

      // Prevent locking out the system by removing/disabling the last active system administrator
      if (target.role_id === 1 && (nextRoleId !== 1 || nextIsActive === 0)) {
        const otherAdmins = db
          .prepare('SELECT COUNT(*) as c FROM users WHERE role_id = 1 AND is_active = 1 AND id != ?')
          .get(userId) as { c: number };
        if (otherAdmins.c === 0) {
          return res.status(400).json({ error: 'لا يمكن تعطيل أو تغيير دور آخر مدير نظام نشط في البرنامج' });
        }
      }

      if (password && String(password).trim()) {
        const hash = bcrypt.hashSync(String(password), 10);
        db.prepare('UPDATE users SET username = ?, full_name = ?, password_hash = ?, role_id = ?, is_active = ?, allow_negative_stock = ?, allow_price_change = ? WHERE id = ?').run(
          cleanUsername,
          full_name || cleanUsername,
          hash,
          nextRoleId,
          nextIsActive,
          allow_negative_stock ? 1 : 0,
          allow_price_change ? 1 : 0,
          userId
        );
      } else {
        db.prepare('UPDATE users SET username = ?, full_name = ?, role_id = ?, is_active = ?, allow_negative_stock = ?, allow_price_change = ? WHERE id = ?').run(
          cleanUsername,
          full_name || cleanUsername,
          nextRoleId,
          nextIsActive,
          allow_negative_stock ? 1 : 0,
          allow_price_change ? 1 : 0,
          userId
        );
      }
      logAudit(
        db,
        actor.userId,
        actor.username,
        'UPDATE',
        'USER',
        userId,
        cleanUsername,
        null,
        { username: cleanUsername, full_name, role_id: nextRoleId, is_active: nextIsActive, allow_negative_stock, allow_price_change, passwordChanged: Boolean(password && String(password).trim()) },
        'تعديل بيانات المستخدم'
      );
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message || 'تعذر تحديث بيانات المستخدم' });
    }
  });

  router.get('/roles', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    const roles = db.prepare('SELECT * FROM roles ORDER BY id ASC').all() as Array<Record<string, unknown>>;
    const permStmt = db.prepare('SELECT * FROM permissions WHERE role_id = ?');
    res.json(roles.map((r) => ({ ...r, permissions: permStmt.all(r.id) })));
  });

  router.put('/roles/:id/permissions', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const roleId = Number(req.params.id);
    const { permissions } = req.body as { permissions: Array<Record<string, unknown>> };
    const tx = db.transaction(() => {
      for (const p of permissions) {
        db.prepare(
          `INSERT INTO permissions (role_id, module_key, can_view, can_add, can_edit, can_delete, can_approve, can_print, can_export, can_view_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(role_id, module_key) DO UPDATE SET
             can_view = excluded.can_view, can_add = excluded.can_add, can_edit = excluded.can_edit,
             can_delete = excluded.can_delete, can_approve = excluded.can_approve, can_print = excluded.can_print,
             can_export = excluded.can_export, can_view_cost = excluded.can_view_cost`
        ).run(
          roleId,
          p.module_key,
          p.can_view ? 1 : 0,
          p.can_add ? 1 : 0,
          p.can_edit ? 1 : 0,
          p.can_delete ? 1 : 0,
          p.can_approve ? 1 : 0,
          p.can_print ? 1 : 0,
          p.can_export ? 1 : 0,
          p.can_view_cost ? 1 : 0
        );
      }
      logAudit(db, actor.userId, actor.username, 'UPDATE', 'ROLE_PERMISSIONS', roleId, '', null, { count: permissions.length }, 'تحديث مصفوفة الصلاحيات');
    });
    tx();
    res.json({ ok: true });
  });

  router.get('/audit-logs', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300').all());
  });

  // ==========================================
  // SETTINGS, BACKUP & RESTORE
  // ==========================================
  router.put('/settings', requireOperationalLicense, (req, res) => {
    const db = getDb();
    const actor = getActor(req);
    const entries = Object.entries(req.body as Record<string, string>);
    const tx = db.transaction(() => {
      const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of entries) stmt.run(k, String(v ?? ''));
      logAudit(db, actor.userId, actor.username, 'UPDATE', 'SETTINGS', 'ALL', '', null, req.body, 'تحديث إعدادات المنشأة');
    });
    tx();
    res.json({ ok: true });
  });

  router.get('/backup/info', (_req, res) => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          "SELECT key, value FROM settings WHERE key IN ('auto_backup_enabled', 'auto_backup_time', 'auto_backup_dir', 'auto_backup_last_date')"
        )
        .all() as Array<{ key: string; value: string }>;
      const map = new Map(rows.map((r) => [r.key, r.value]));
      let effectiveDir = '/backups';
      try {
        effectiveDir = getBackupsDir();
      } catch {
        effectiveDir = map.get('auto_backup_dir') || '/backups';
      }
      res.json({
        effectiveDir,
        configuredDir: map.get('auto_backup_dir') || '',
        autoBackupEnabled: map.get('auto_backup_enabled') === '1',
        autoBackupTime: map.get('auto_backup_time') || '23:00',
        lastAutoBackupDate: map.get('auto_backup_last_date') || '',
      });
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message || 'تعذر قراءة معلومات النسخ الاحتياطي' });
    }
  });

  router.get('/backup/list', (_req, res) => {
    try {
      const dir = getBackupsDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.db') && !f.startsWith('TEMP_UPLOAD_'))
        .map((f) => {
          const stat = fs.statSync(path.join(dir, f));
          const dt = stat.mtime instanceof Date ? stat.mtime : new Date(stat.mtime);
          return { filename: f, sizeBytes: stat.size, createdAt: dt.toISOString() };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json(files);
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message || 'تعذر قراءة قائمة النسخ الاحتياطية' });
    }
  });

  router.post('/backup/create', async (req, res) => {
    try {
      const db = getDb();
      const actor = getActor(req);
      const dir = getBackupsDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const now = new Date();
      const filename = formatBackupDateTimeFilename(now);
      const destPath = path.join(dir, filename);
      await db.backup(destPath);
      logAudit(db, actor.userId, actor.username, 'BACKUP', 'DATABASE', filename, filename, null, null, 'إنشاء نسخة احتياطية');
      res.json({ filename, dir, createdAt: now.toISOString() });
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message || 'تعذر إنشاء النسخة الاحتياطية' });
    }
  });

  router.get('/backup/download/:filename', (req, res) => {
    try {
      const safeName = path.basename(req.params.filename);
      const filePath = path.join(getBackupsDir(), safeName);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'ملف النسخة الاحتياطية غير موجود' });
      res.download(filePath, safeName);
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message || 'تعذر تنزيل النسخة الاحتياطية' });
    }
  });

  router.post('/backup/restore', requireOperationalLicense, async (req, res) => {
    let tempUploadPath = '';
    try {
      const { filename, base64Db } = req.body as { filename?: string; base64Db?: string };
      const db = getDb();
      const dir = getBackupsDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let sourcePath = '';
      if (filename) {
        sourcePath = path.join(dir, path.basename(filename));
        if (!fs.existsSync(sourcePath)) return res.status(404).json({ error: 'ملف النسخة غير موجود' });
      } else if (base64Db) {
        tempUploadPath = path.join(dir, `TEMP_UPLOAD_${Date.now()}.db`);
        fs.writeFileSync(tempUploadPath, Buffer.from(base64Db, 'base64'));
        sourcePath = tempUploadPath;
      } else {
        return res.status(400).json({ error: 'يرجى اختيار نسخة احتياطية للاستعادة' });
      }

      // Verify SQLite magic header before closing current DB
      const fileBuf = fs.readFileSync(sourcePath);
      const header = Buffer.from(fileBuf).subarray(0, 15).toString('ascii');
      if (!header.startsWith('SQLite format 3')) {
        return res.status(400).json({ error: 'الملف المختار ليس قاعدة بيانات SQLite صالحة' });
      }

      // Always create a safety backup before replacing
      const safetyPath = path.join(dir, `SAFETY_BEFORE_RESTORE_${Date.now()}.db`);
      await db.backup(safetyPath);

      db.close();
      if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
      if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
      fs.copyFileSync(sourcePath, DB_PATH);
      await reloadDb();
      res.json({ ok: true, message: 'تمت استعادة النسخة الاحتياطية بنجاح مع حفظ نسخة أمان تلقائية' });
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message || 'تعذر استعادة النسخة الاحتياطية' });
    } finally {
      if (tempUploadPath && fs.existsSync(tempUploadPath)) {
        try {
          fs.unlinkSync(tempUploadPath);
        } catch {
          // ignore cleanup failure
        }
      }
    }
  });

  router.get('/backup/export-json', (_req, res) => {
    try {
      const db = getDb();
      const tables = ['categories', 'units', 'warehouses', 'products', 'customers', 'suppliers', 'sales_invoices', 'purchase_invoices', 'expenses_revenues', 'settings'];
      const exportObj: Record<string, unknown> = { exportedAt: new Date().toISOString() };
      for (const t of tables) {
        exportObj[t] = db.prepare(`SELECT * FROM ${t}`).all();
      }
      res.setHeader('Content-Disposition', 'attachment; filename="MINA_NET_FULL_EXPORT.json"');
      res.json(exportObj);
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message || 'تعذر تصدير البيانات' });
    }
  });

  router.post('/system/reset-demo', requireOperationalLicense, (_req, res) => {
    const db = getDb();
    resetCleanBusinessDatabase(db);
    res.json({ ok: true });
  });

  // ==========================================
  // LICENSING & PLAZA LICENSE MANAGER (Ed25519)
  // ==========================================
  router.get('/license/status', (_req, res) => {
    const db = getDb();
    res.json(getLicenseState(db));
  });

  router.post('/license/activate', (req, res) => {
    const integrity = verifyRuntimeIntegrity(true);
    if (!integrity.ok) {
      return res.status(403).json({ error: integrity.reason || 'تم رصد تلاعب في ملفات الحماية' });
    }
    const db = getDb();
    const actor = getActor(req);
    const { activationInput } = req.body as { activationInput: string };
    if (!activationInput?.trim()) return res.status(400).json({ error: 'يرجى إدخال كود التفعيل أو استيراد ملف الترخيص' });

    try {
      const signed = decodeActivationCode(activationInput);
      const fp = getDeviceFingerprint();
      const revocations = (db.prepare('SELECT license_id FROM license_revocations').all() as Array<{ license_id: string }>).map(
        (r) => r.license_id
      );
      const verify = verifySignedLicense(signed, fp, revocations);
      if (!verify.valid) {
        return res.status(400).json({ error: verify.reason || 'ملف الترخيص غير صالح' });
      }

      db.prepare(
        `UPDATE licenses SET is_activated = 1, license_id = ?, customer_name = ?, license_type = ?,
         device_fingerprint = ?, max_devices = ?, issued_at = ?, expires_at = ?, raw_license_json = ?`
      ).run(
        signed.payload.license_id,
        signed.payload.customer_name,
        signed.payload.license_type,
        signed.payload.device_fingerprint,
        signed.payload.max_devices,
        signed.payload.issued_at,
        signed.payload.expires_at || '',
        JSON.stringify(signed)
      );

      logAudit(db, actor.userId, actor.username, 'LICENSE', 'LICENSE', signed.payload.license_id, signed.payload.license_id, null, signed.payload, 'تفعيل ترخيص البرنامج');
      res.json({ ok: true, state: getLicenseState(db) });
    } catch {
      res.status(400).json({ error: 'صيغة كود التفعيل أو ملف الترخيص غير صحيحة' });
    }
  });

  return router;
}
