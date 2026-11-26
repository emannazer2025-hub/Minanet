import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Printer,
  Search,
  RotateCcw,
  TrendingUp,
  History,
  X,
  ScanBarcode,
  PauseCircle,
  PlayCircle,
  Grid2x2,
  Monitor,
  Vault,
  Volume2,
  VolumeX,
  Package,
} from 'lucide-react';
import { apiFetch, formatMoney, formatNum, nowDateTimeStr } from '../api.ts';
import type { DefinitionsBundle, HeldInvoice, Product, UserInfo } from '../types.ts';
import { PrintInvoiceModal } from '../components/PrintInvoiceModal.tsx';
import { playPosBeep, triggerCashDrawer } from '../utils/posHardware.ts';
import {
  detectSecondaryScreen,
  isCustomerDisplayWindowOpen,
  openCustomerDisplayWindow,
  parsePromoSlides,
  publishCustomerDisplayState,
} from '../utils/customerDisplaySync.ts';

interface SaleLine {
  product_id: number;
  product_code: string;
  product_name: string;
  unit_id: number;
  unit_name: string;
  conversion_factor: number;
  quantity: number;
  is_bonus: boolean;
  unit_price: number;
  avg_cost: number;
  discount_percent: number;
  discount_value: number;
  line_total: number;
  available_stock: number;
  serial_numbers: string;
}

interface SalesViewProps {
  settings: Record<string, string>;
  currentUser: UserInfo;
  canViewCost: boolean;
}

const HELD_STORAGE_KEY = 'mina_net_held_invoices_v1';

function loadHeldInvoices(): HeldInvoice[] {
  try {
    const raw = localStorage.getItem(HELD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HeldInvoice[]) : [];
  } catch {
    return [];
  }
}

export const SalesView: React.FC<SalesViewProps> = ({ settings, currentUser, canViewCost }) => {
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [invoiceDate, setInvoiceDate] = useState(nowDateTimeStr());
  const [customerId, setCustomerId] = useState<number>(1);
  const [warehouseId, setWarehouseId] = useState<number>(1);
  const [cashboxId, setCashboxId] = useState<number>(1);
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT' | 'VISA'>('CASH');
  const [priceTier, setPriceTier] = useState<'RETAIL' | 'WHOLESALE' | 'SPECIAL'>('RETAIL');
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [extraAdditions, setExtraAdditions] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [itemQuery, setItemQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [entryQty, setEntryQty] = useState<number>(1);
  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [entryUnitId, setEntryUnitId] = useState<number>(1);
  const [entryFactor, setEntryFactor] = useState<number>(1);
  const [entryUnitName, setEntryUnitName] = useState<string>('قطعة');
  const [entryBonus, setEntryBonus] = useState<boolean>(false);

  const [lines, setLines] = useState<SaleLine[]>([]);
  const [lastAddedIndex, setLastAddedIndex] = useState<number | undefined>(undefined);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [scanToast, setScanToast] = useState('');
  const [saving, setSaving] = useState(false);

  const [lastSavedInvoice, setLastSavedInvoice] = useState<{ invoice_number: string; id: number } | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [autoPrintPending, setAutoPrintPending] = useState(false);
  const [profitModalOpen, setProfitModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<Array<Record<string, unknown>>>([]);

  // POS Hardware, Touch Grid, Hold Queue & Dual Customer Display
  const [touchOpen, setTouchOpen] = useState<boolean>(() => settings.pos_touch_panel_default !== '0');
  const [touchCategory, setTouchCategory] = useState<string>('ALL');
  const [autoMergeScan, setAutoMergeScan] = useState<boolean>(() => settings.pos_auto_merge_scan !== '0');
  const [beepEnabled, setBeepEnabled] = useState<boolean>(() => settings.pos_scan_beep !== '0');
  const [heldList, setHeldList] = useState<HeldInvoice[]>(loadHeldInvoices);
  const [heldModalOpen, setHeldModalOpen] = useState(false);
  const [hasSecondMonitor, setHasSecondMonitor] = useState(false);
  const [displayActive, setDisplayActive] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef<{ text: string; lastKeyAt: number }>({ text: '', lastKeyAt: 0 });
  const currency = settings.currency || 'ج.م.';

  const loadDefinitionsAndProducts = useCallback(async (whId?: number) => {
    try {
      const targetWh = whId || warehouseId;
      const [d, p] = await Promise.all([
        apiFetch<DefinitionsBundle>('/api/definitions/all'),
        apiFetch<Product[]>(`/api/products?warehouse_id=${targetWh}`),
      ]);
      setDefs(d);
      setAllProducts(p);
      return d;
    } catch (err: unknown) {
      setError((err as Error).message);
      return null;
    }
  }, [warehouseId]);

  useEffect(() => {
    void loadDefinitionsAndProducts(1).then((d) => {
      if (!d) return;
      const walkin = d.customers.find((c) => c.is_walkin === 1) || d.customers[0];
      if (walkin) setCustomerId(walkin.id);
      const defWh = d.warehouses.find((w) => w.is_default === 1) || d.warehouses[0];
      if (defWh) setWarehouseId(defWh.id);
      const defCb = d.cashboxes.find((c) => c.is_default === 1) || d.cashboxes[0];
      if (defCb) setCashboxId(defCb.id);
    });
    barcodeInputRef.current?.focus();
  }, []);

  useEffect(() => {
    void apiFetch<Product[]>(`/api/products?warehouse_id=${warehouseId}`)
      .then(setAllProducts)
      .catch(() => {});
  }, [warehouseId]);

  // Persist held queue to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HELD_STORAGE_KEY, JSON.stringify(heldList));
    } catch {
      // ignore
    }
  }, [heldList]);

  // Automatic 2nd Monitor Detection & Launch
  useEffect(() => {
    let alive = true;
    void detectSecondaryScreen().then((info) => {
      if (!alive) return;
      setHasSecondMonitor(info.hasExtendedScreen);
      setDisplayActive(isCustomerDisplayWindowOpen());
      if (settings.customer_display_auto === '1' && info.hasExtendedScreen && !isCustomerDisplayWindowOpen()) {
        void openCustomerDisplayWindow(true).then((res) => {
          if (alive && res.opened) setDisplayActive(true);
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [settings.customer_display_auto]);

  const getTierPrice = useCallback(
    (p: Product, tier: typeof priceTier) => {
      if (tier === 'WHOLESALE') return p.wholesale_price || p.sale_price;
      if (tier === 'SPECIAL') return p.special_price || p.sale_price;
      return p.sale_price;
    },
    []
  );

  // Add/Increment product line cleanly (used by rapid scanner, touch grid, & manual insert)
  const addProductDirectToCart = useCallback(
    (
      p: Product,
      qty = 1,
      unitId?: number,
      unitName?: string,
      factor = 1,
      priceOverride?: number,
      isBonus = false
    ) => {
      const targetUnitId = unitId ?? p.base_unit_id;
      const targetUnitName = unitName ?? (p.unit_name || 'قطعة');
      const unitP = isBonus ? 0 : priceOverride ?? getTierPrice(p, priceTier);

      setError('');
      setLines((prev) => {
        if (autoMergeScan && !isBonus) {
          const existingIdx = prev.findIndex(
            (l) => l.product_id === p.id && l.unit_id === targetUnitId && !l.is_bonus
          );
          if (existingIdx >= 0) {
            const next = prev.map((l, i) => {
              if (i !== existingIdx) return l;
              const nextQty = Number((l.quantity + qty).toFixed(4));
              const gross = nextQty * l.unit_price;
              const disc = l.discount_percent > 0 ? (gross * l.discount_percent) / 100 : l.discount_value;
              return {
                ...l,
                quantity: nextQty,
                discount_value: disc,
                line_total: Math.max(0, gross - disc),
              };
            });
            setLastAddedIndex(existingIdx);
            return next;
          }
        }
        const nextIdx = prev.length;
        setLastAddedIndex(nextIdx);
        return [
          ...prev,
          {
            product_id: p.id,
            product_code: p.code,
            product_name: p.name,
            unit_id: targetUnitId,
            unit_name: targetUnitName,
            conversion_factor: factor,
            quantity: qty,
            is_bonus: isBonus,
            unit_price: unitP,
            avg_cost: p.avg_cost,
            discount_percent: 0,
            discount_value: 0,
            line_total: qty * unitP,
            available_stock: Number(p.stock_qty || 0),
            serial_numbers: '',
          },
        ];
      });
      playPosBeep('ok', beepEnabled);
      setScanToast(`تمت إضافة: ${p.name}`);
      window.setTimeout(() => setScanToast(''), 1800);
    },
    [autoMergeScan, beepEnabled, getTierPrice, priceTier]
  );

  // Instant Barcode Lookup & Auto-Add (Zero-click rapid scanning)
  const processScannedBarcode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      try {
        const res = await apiFetch<Product[]>(
          `/api/products/lookup?q=${encodeURIComponent(code)}&warehouse_id=${warehouseId}`
        );
        const exact = res.find(
          (p) =>
            p.barcode === code ||
            p.code === code ||
            p.extra_barcodes?.some((eb) => eb.barcode === code)
        );
        const match = exact || (res.length === 1 ? res[0] : null);
        if (match) {
          if (lastSavedInvoice) {
            // Start a fresh invoice automatically if cashier scans after saving!
            setLines([]);
            setInvoiceDiscount(0);
            setExtraAdditions(0);
            setPaidAmount('');
            setNotes('');
            setLastSavedInvoice(null);
            setSuccessMsg('');
            setInvoiceDate(nowDateTimeStr());
          }
          addProductDirectToCart(match, 1);
          setSelectedProduct(null);
          setItemQuery('');
          setLookupResults([]);
          barcodeInputRef.current?.focus();
        } else {
          playPosBeep('error', beepEnabled);
          setError(`لم يتم العثور على صنف بالباركود: ${code}`);
          setItemQuery('');
          barcodeInputRef.current?.focus();
        }
      } catch (err: unknown) {
        playPosBeep('error', beepEnabled);
        setError((err as Error).message);
      }
    },
    [addProductDirectToCart, beepEnabled, lastSavedInvoice, warehouseId]
  );

  // Global HID Keyboard-Wedge Barcode Scanner Listener (works without clicking the search box!)
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (printOpen || historyOpen || profitModalOpen || heldModalOpen) return;

      // Shortcuts: F8 Hold Invoice, F9 Open Drawer
      if (e.key === 'F8') {
        e.preventDefault();
        if (lines.length > 0) holdCurrentInvoice();
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        void handleManualOpenDrawer();
        return;
      }

      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isBarcodeBox = document.activeElement === barcodeInputRef.current;
      const inOtherInput =
        !isBarcodeBox &&
        (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select');

      const now = Date.now();
      const gap = now - scanBufferRef.current.lastKeyAt;

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (!inOtherInput && !isBarcodeBox && scanBufferRef.current.text.length >= 3 && gap < 90) {
          e.preventDefault();
          const code = scanBufferRef.current.text;
          scanBufferRef.current = { text: '', lastKeyAt: 0 };
          void processScannedBarcode(code);
          return;
        }
        scanBufferRef.current = { text: '', lastKeyAt: 0 };
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;

      // If focus is NOT in any other input (e.g., cashier clicked a button or table), capture automatically!
      if (!inOtherInput && !isBarcodeBox) {
        if (gap > 120) {
          scanBufferRef.current = { text: e.key, lastKeyAt: now };
        } else {
          scanBufferRef.current = { text: scanBufferRef.current.text + e.key, lastKeyAt: now };
        }
        // Redirect focus smoothly to barcode box if someone starts scanning directly
        if (scanBufferRef.current.text.length >= 2 && gap < 60 && barcodeInputRef.current) {
          barcodeInputRef.current.focus();
          setItemQuery(scanBufferRef.current.text);
          scanBufferRef.current = { text: '', lastKeyAt: 0 };
        }
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  });

  const searchProduct = async (q: string) => {
    setItemQuery(q);
    if (!q.trim()) {
      setLookupResults([]);
      return;
    }
    try {
      const res = await apiFetch<Product[]>(`/api/products/lookup?q=${encodeURIComponent(q)}&warehouse_id=${warehouseId}`);
      setLookupResults(res);
      const exact = res.find((p) => p.barcode === q.trim() || p.code === q.trim());
      if (exact && q.trim().length >= 4) {
        addProductDirectToCart(exact, 1);
        setSelectedProduct(null);
        setItemQuery('');
        setLookupResults([]);
        barcodeInputRef.current?.focus();
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const pickProduct = (p: Product) => {
    setSelectedProduct(p);
    setEntryUnitId(p.base_unit_id);
    setEntryUnitName(p.unit_name || 'قطعة');
    setEntryFactor(1);
    setEntryPrice(getTierPrice(p, priceTier));
    setEntryQty(1);
    setEntryBonus(false);
    setLookupResults([]);
  };

  const insertLine = () => {
    if (!selectedProduct) return;
    if (entryQty <= 0) {
      setError('الكمية يجب أن تكون أكبر من صفر');
      return;
    }
    addProductDirectToCart(
      selectedProduct,
      entryQty,
      entryUnitId,
      entryUnitName,
      entryFactor,
      entryPrice,
      entryBonus
    );
    setSelectedProduct(null);
    setItemQuery('');
    setEntryQty(1);
    setEntryBonus(false);
    barcodeInputRef.current?.focus();
  };

  const updateLine = (idx: number, patch: Partial<SaleLine>) => {
    setLastAddedIndex(idx);
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        const gross = next.quantity * (next.is_bonus ? 0 : next.unit_price);
        const disc = next.discount_percent > 0 ? (gross * next.discount_percent) / 100 : next.discount_value;
        next.discount_value = disc;
        next.line_total = Math.max(0, gross - disc);
        return next;
      })
    );
  };

  const subtotal = lines.reduce((s, l) => s + l.quantity * (l.is_bonus ? 0 : l.unit_price), 0);
  const itemsDiscount = lines.reduce((s, l) => s + l.discount_value, 0);
  const taxRate = settings.tax_enabled === '1' ? Number(settings.tax_rate || 0) : 0;
  const taxableBase = Math.max(0, subtotal - itemsDiscount - invoiceDiscount + extraAdditions);
  const taxAmount = Number(((taxableBase * taxRate) / 100).toFixed(2));
  const netTotal = Number((taxableBase + taxAmount).toFixed(2));
  const estimatedCost = lines.reduce((s, l) => s + l.quantity * l.conversion_factor * l.avg_cost, 0);
  const estimatedProfit = netTotal - taxAmount - estimatedCost;

  const effectivePaid = paidAmount !== '' ? Number(paidAmount) : paymentType === 'CREDIT' ? 0 : netTotal;
  const remaining = Math.max(0, netTotal - effectivePaid);
  const changeAmount = Math.max(0, effectivePaid - netTotal);

  const selectedCustomer = defs?.customers.find((c) => c.id === customerId);
  const selectedWarehouse = defs?.warehouses.find((w) => w.id === warehouseId);

  // Real-Time Sync to Customer Display Window
  useEffect(() => {
    const slides = parsePromoSlides(settings.customer_display_slides_json, settings.company_name || 'Mina Net');
    const mode = lastSavedInvoice ? 'PAID' : lines.length > 0 ? 'CART' : 'IDLE';
    publishCustomerDisplayState({
      mode,
      updatedAt: Date.now(),
      companyName: settings.company_name || 'Mina Net',
      companyLogo: settings.company_logo || '',
      companyPhone: settings.company_phone || '01153672084',
      currency,
      cashierName: currentUser.full_name || currentUser.username,
      customerName: selectedCustomer?.name || 'عميل نقدي',
      invoiceNumber: lastSavedInvoice?.invoice_number,
      items: lines.map((l) => ({
        name: l.product_name,
        unitName: l.unit_name,
        quantity: l.quantity,
        unitPrice: l.unit_price,
        discountValue: l.discount_value,
        lineTotal: l.line_total,
        isBonus: l.is_bonus,
      })),
      lastAddedIndex,
      subtotal,
      discount: itemsDiscount + invoiceDiscount,
      additions: extraAdditions,
      tax: taxAmount,
      netTotal,
      paidAmount: effectivePaid,
      remainingAmount: remaining,
      changeAmount,
      paymentType,
      welcomeText: settings.customer_display_welcome,
      tickerText: settings.customer_display_ticker,
      qrEnabled: settings.customer_display_qr_enabled !== '0',
      qrLabel: settings.customer_display_qr_label,
      qrValue: settings.customer_display_qr_value,
      slides,
    });
  }, [
    lines,
    lastAddedIndex,
    lastSavedInvoice,
    selectedCustomer?.name,
    subtotal,
    itemsDiscount,
    invoiceDiscount,
    extraAdditions,
    taxAmount,
    netTotal,
    effectivePaid,
    remaining,
    changeAmount,
    paymentType,
    settings,
    currency,
    currentUser,
  ]);

  const resetInvoice = () => {
    setLines([]);
    setLastAddedIndex(undefined);
    setInvoiceDiscount(0);
    setExtraAdditions(0);
    setPaidAmount('');
    setNotes('');
    setError('');
    setSuccessMsg('');
    setLastSavedInvoice(null);
    setInvoiceDate(nowDateTimeStr());
    barcodeInputRef.current?.focus();
  };

  const holdCurrentInvoice = () => {
    if (lines.length === 0) {
      setError('لا توجد أصناف في الفاتورة لتعليقها');
      return;
    }
    const held: HeldInvoice = {
      id: `HOLD-${Date.now()}`,
      createdAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      label: selectedCustomer?.name || 'عميل نقدي',
      customerId,
      customerName: selectedCustomer?.name || 'عميل نقدي',
      warehouseId,
      cashboxId,
      paymentType,
      priceTier,
      invoiceDiscount,
      extraAdditions,
      notes,
      items: lines,
      netTotal,
    };
    setHeldList((prev) => [held, ...prev]);
    resetInvoice();
    setSuccessMsg(`تم تعليق الفاتورة (${held.customerName}) بنجاح — تفضل بخدمة العميل التالي.`);
  };

  const recallHeldInvoice = (held: HeldInvoice) => {
    if (lines.length > 0) {
      // Auto-park current active draft so nothing is lost
      holdCurrentInvoice();
    }
    setCustomerId(held.customerId);
    setWarehouseId(held.warehouseId);
    setCashboxId(held.cashboxId);
    setPaymentType(held.paymentType);
    setPriceTier(held.priceTier);
    setInvoiceDiscount(held.invoiceDiscount);
    setExtraAdditions(held.extraAdditions);
    setNotes(held.notes);
    setLines(held.items);
    setLastAddedIndex(held.items.length - 1);
    setLastSavedInvoice(null);
    setHeldList((prev) => prev.filter((x) => x.id !== held.id));
    setHeldModalOpen(false);
    setSuccessMsg(`تم استرجاع الفاتورة المعلقة (${held.customerName}) بنجاح`);
    barcodeInputRef.current?.focus();
  };

  const handleManualOpenDrawer = async () => {
    setError('');
    const res = await triggerCashDrawer(settings);
    if (res.ok) {
      setSuccessMsg(`تم فتح درج النقدية (${res.channel})`);
    } else if (res.error) {
      setError(res.error);
    }
  };

  const handleOpenCustomerDisplay = async () => {
    const res = await openCustomerDisplayWindow(false);
    if (res.opened) {
      setDisplayActive(true);
      setSuccessMsg(
        res.onSecondMonitor
          ? 'تم فتح شاشة العميل تلقائياً على الشاشة الثانية!'
          : 'تم فتح نافذة شاشة العميل — يمكنك سحبها لأي شاشة أو تكبيرها لملء الشاشة.'
      );
    } else if (res.reason === 'BLOCKED_POPUP') {
      setError('المتصفح منع النافذة المنبثقة — يرجى السماح بالنوافذ المنبثقة لهذا الموقع لفتح شاشة العميل تلقائياً.');
    }
  };

  const handleSave = async () => {
    if (lines.length === 0) {
      setError('يرجى إدراج صنف واحد على الأقل في الفاتورة');
      return;
    }
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await apiFetch<{ id: number; invoice_number: string }>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          invoice_date: invoiceDate,
          customer_id: customerId,
          warehouse_id: warehouseId,
          cashbox_id: cashboxId,
          payment_type: paymentType,
          price_tier: priceTier,
          invoice_discount: invoiceDiscount,
          extra_additions: extraAdditions,
          tax_amount: taxAmount,
          paid_amount: effectivePaid,
          notes,
          items: lines,
        }),
      });
      setLastSavedInvoice(res);
      setSuccessMsg(`تم حفظ واعتماد فاتورة البيع رقم ${res.invoice_number} بنجاح`);

      // Automatic Cash Drawer kick on Cash sales
      if (paymentType === 'CASH' && settings.pos_cash_drawer_auto !== '0') {
        void triggerCashDrawer(settings);
      }

      // Automatic Thermal / Receipt Print if enabled
      if (settings.pos_auto_print_on_save === '1') {
        setAutoPrintPending(true);
        setPrintOpen(true);
      }

      void loadDefinitionsAndProducts(warehouseId);
      barcodeInputRef.current?.focus();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async () => {
    setError('');
    try {
      const list = await apiFetch<Array<Record<string, unknown>>>('/api/sales');
      setHistoryList(list);
      setHistoryOpen(true);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const cancelSavedInvoice = async (id: number) => {
    try {
      await apiFetch(`/api/sales/${id}/cancel`, { method: 'POST' });
      await loadHistory();
      void loadDefinitionsAndProducts(warehouseId);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const touchFilteredProducts = useMemo(() => {
    return allProducts.filter((p) => {
      if (p.is_active !== 1) return false;
      if (touchCategory === 'NO_BARCODE') return !p.barcode || !p.barcode.trim();
      if (touchCategory !== 'ALL' && String(p.category_id || '') !== touchCategory) return false;
      return true;
    });
  }, [allProducts, touchCategory]);

  return (
    <div className="bg-sky-50/85 text-slate-900 border border-sky-200/90 rounded-xl p-3.5 space-y-2.5 text-xs shadow-xs">
      {/* Smart POS Hardware & Quick Controls Strip */}
      <div className="bg-white/95 border border-sky-200 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
            <ScanBarcode className="w-3.5 h-3.5 text-emerald-600" />
            <span>القارئ التلقائي نشط</span>
          </div>

          <button
            type="button"
            onClick={() => setTouchOpen((v) => !v)}
            className={`px-2.5 py-1 rounded-md border font-bold flex items-center gap-1.5 transition-colors ${
              touchOpen ? 'bg-[#0f3d5e] text-white border-[#0f3d5e]' : 'win-btn text-slate-800'
            }`}
          >
            <Grid2x2 className="w-3.5 h-3.5" />
            <span>أزرار اللمس السريع</span>
          </button>

          <button
            type="button"
            onClick={holdCurrentInvoice}
            disabled={lines.length === 0}
            className="win-btn px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 text-amber-900 disabled:opacity-50"
            title="اختصار F8"
          >
            <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>تعليق الفاتورة (F8)</span>
          </button>

          <button
            type="button"
            onClick={() => setHeldModalOpen(true)}
            className={`px-2.5 py-1 rounded-md border font-bold flex items-center gap-1.5 ${
              heldList.length > 0
                ? 'bg-amber-100 text-amber-950 border-amber-400'
                : 'win-btn text-slate-700'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5 text-amber-700" />
            <span>الفواتير المعلقة ({heldList.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAutoMergeScan((v) => !v)}
            className={`px-2.5 py-1 rounded-md border font-bold text-[11px] ${
              autoMergeScan ? 'bg-sky-100 text-[#0f3d5e] border-sky-300' : 'win-btn text-slate-600'
            }`}
            title="زيادة الكمية تلقائياً عند مسح نفس الصنف"
          >
            تجميع المكرر: {autoMergeScan ? 'مفعل' : 'متوقف'}
          </button>

          <button
            type="button"
            onClick={() => setBeepEnabled((v) => !v)}
            className="win-btn p-1.5 rounded-md text-slate-700"
            title={beepEnabled ? 'صوت الباركود مفعل' : 'صوت الباركود صامت'}
          >
            {beepEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-700" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          <button
            type="button"
            onClick={() => void handleManualOpenDrawer()}
            className="win-btn px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 text-slate-800"
            title="فتح درج النقدية (F9)"
          >
            <Vault className="w-3.5 h-3.5 text-teal-700" />
            <span>فتح الدرج (F9)</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenCustomerDisplay()}
            className={`px-2.5 py-1 rounded-md border font-bold flex items-center gap-1.5 ${
              displayActive || hasSecondMonitor
                ? 'bg-teal-600 text-white border-teal-700'
                : 'win-btn text-[#0f3d5e]'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>
              {displayActive
                ? 'شاشة العميل متصلة'
                : hasSecondMonitor
                ? 'تشغيل شاشة العميل (شاشة 2)'
                : 'شاشة العميل الثانية'}
            </span>
          </button>
        </div>
      </div>

      {/* Sales Invoice Header */}
      <div className="border-b border-sky-200 pb-2.5 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="font-bold text-slate-700 whitespace-nowrap">الكاشير</span>
            <div className="flex-1 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 font-bold text-slate-900">
              {currentUser.username}
            </div>
          </div>

          <div className="md:col-span-3 flex justify-center">
            <div className="bg-[#0f3d5e] text-white border border-[#0f3d5e] rounded-lg px-6 py-1.5 font-display font-extrabold text-sm shadow-xs">
              فاتورة بيع
            </div>
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">التاريخ</span>
            <div className="flex-1 bg-white border border-slate-500 px-2 py-1 text-center font-mono-num font-semibold">
              {invoiceDate}
            </div>
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">رقم الفاتورة</span>
            <div className="flex-1 bg-white border border-slate-500 px-2 py-1 text-center font-mono-num font-bold text-blue-900">
              {lastSavedInvoice ? lastSavedInvoice.invoice_number : 'تلقائي'}
            </div>
          </div>
        </div>

        {/* Customer, Phone, Balance & Warehouse Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="md:col-span-4 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">العميل</span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(Number(e.target.value))}
              className="flex-1 px-2 py-1 border border-slate-500 bg-white font-bold"
            >
              {defs?.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">رصيد العميل</span>
            <div className="flex-1 bg-white border border-slate-500 px-2.5 py-1 text-center font-mono-num font-extrabold text-slate-900">
              {formatMoney(selectedCustomer?.current_balance || 0, currency)}
            </div>
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">تليفون</span>
            <div className="flex-1 bg-white border border-slate-500 px-2 py-1 font-mono-num">
              {selectedCustomer?.phone || '-'}
            </div>
          </div>

          <div className="md:col-span-2 flex items-center gap-1.5">
            <span className="font-bold whitespace-nowrap">المخزن</span>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(Number(e.target.value))}
              className="flex-1 px-1.5 py-1 border border-slate-500 bg-white font-semibold"
            >
              {defs?.warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Item Entry Band + Live Warehouse Balance Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch">
        <div className="lg:col-span-9 border border-sky-200 bg-white/95 rounded-lg p-3 space-y-2 shadow-2xs">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
            <div className="md:col-span-5 relative flex items-center gap-1.5">
              <span className="font-bold whitespace-nowrap">الباركود / الصنف</span>
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-1.5" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={itemQuery}
                  onChange={(e) => void searchProduct(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (selectedProduct) {
                        insertLine();
                      } else if (itemQuery.trim()) {
                        void processScannedBarcode(itemQuery);
                      } else if (lookupResults.length > 0) {
                        addProductDirectToCart(lookupResults[0], 1);
                        setItemQuery('');
                        setLookupResults([]);
                      }
                    }
                  }}
                  placeholder="امسح الباركود مباشرة أو اكتب الاسم..."
                  className="w-full pr-7 pl-2 py-1 border border-slate-500 bg-white font-semibold focus:ring-2 focus:ring-teal-500"
                />
                {lookupResults.length > 0 && (
                  <div className="absolute z-30 w-full mt-0.5 bg-white border border-slate-500 shadow-lg max-h-52 overflow-y-auto">
                    {lookupResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickProduct(p)}
                        className="w-full px-2.5 py-1.5 text-right hover:bg-[#d8e9fc] flex items-center justify-between border-b border-slate-200"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{p.name}</div>
                          <div className="text-[11px] text-slate-600 font-mono-num">
                            كود: {p.code} · رصيد: {formatNum(p.stock_qty)}
                          </div>
                        </div>
                        <div className="font-mono-num font-bold text-blue-900">
                          {formatMoney(getTierPrice(p, priceTier), currency)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-4 flex items-center gap-1.5">
              <span className="font-bold whitespace-nowrap">سعر المحاسبة</span>
              <select
                value={priceTier}
                onChange={(e) => {
                  const t = e.target.value as typeof priceTier;
                  setPriceTier(t);
                  if (selectedProduct) setEntryPrice(getTierPrice(selectedProduct, t));
                }}
                className="flex-1 px-2 py-1 border border-slate-500 bg-white font-semibold"
              >
                <option value="RETAIL">سعر المستهلك</option>
                <option value="WHOLESALE">سعر الجملة</option>
                <option value="SPECIAL">سعر خاص</option>
              </select>
            </div>

            <div className="md:col-span-3 flex items-center gap-1.5">
              <span className="font-bold whitespace-nowrap">السعر</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={currentUser.allow_price_change === 0}
                value={entryBonus ? 0 : entryPrice}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className="flex-1 px-2 py-1 border border-slate-500 bg-white font-mono-num font-bold text-center"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
            <div className="md:col-span-4 flex items-center gap-1.5">
              <span className="font-bold whitespace-nowrap">الصنف</span>
              <div className="flex-1 px-2 py-1 border border-slate-500 bg-white font-bold truncate">
                {selectedProduct ? selectedProduct.name : 'جاهز للمسح المتتالي...'}
              </div>
            </div>

            <div className="md:col-span-3 flex items-center gap-1.5">
              <span className="font-bold whitespace-nowrap">الوحدة</span>
              <select
                value={entryUnitId}
                disabled={!selectedProduct}
                onChange={(e) => {
                  const uid = Number(e.target.value);
                  setEntryUnitId(uid);
                  if (selectedProduct) {
                    if (uid === selectedProduct.base_unit_id) {
                      setEntryFactor(1);
                      setEntryUnitName(selectedProduct.unit_name || 'قطعة');
                      setEntryPrice(getTierPrice(selectedProduct, priceTier));
                    } else {
                      const conv = selectedProduct.conversions?.find((c) => c.unit_id === uid);
                      if (conv) {
                        setEntryFactor(conv.conversion_factor);
                        setEntryUnitName(conv.unit_name);
                        setEntryPrice(conv.sale_price || getTierPrice(selectedProduct, priceTier) * conv.conversion_factor);
                      }
                    }
                  }
                }}
                className="flex-1 px-2 py-1 border border-slate-500 bg-white font-semibold"
              >
                {selectedProduct ? (
                  <>
                    <option value={selectedProduct.base_unit_id}>{selectedProduct.unit_name || 'قطعة'}</option>
                    {selectedProduct.conversions?.map((c) => (
                      <option key={c.unit_id} value={c.unit_id}>
                        {c.unit_name} (×{c.conversion_factor})
                      </option>
                    ))}
                  </>
                ) : (
                  <option value="1">قطعة</option>
                )}
              </select>
            </div>

            <div className="md:col-span-2 flex items-center gap-1.5">
              <span className="font-bold whitespace-nowrap">الكمية</span>
              <input
                type="number"
                min="0.01"
                step="any"
                value={entryQty}
                onChange={(e) => setEntryQty(Number(e.target.value))}
                className="w-full px-2 py-1 border border-slate-500 bg-white font-mono-num font-bold text-center"
              />
            </div>

            <div className="md:col-span-3 flex items-center gap-2">
              <label className="flex items-center gap-1 font-bold text-red-700 whitespace-nowrap">
                <input type="checkbox" checked={entryBonus} onChange={(e) => setEntryBonus(e.target.checked)} />
                بونص
              </label>
              <button
                type="button"
                disabled={!selectedProduct}
                onClick={insertLine}
                className="win-btn flex-1 py-1 px-3 font-bold rounded-xs flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> إدراج
              </button>
            </div>
          </div>
        </div>

        {/* Live Warehouse Balance Box */}
        <div className="lg:col-span-3 bg-white border border-sky-200 rounded-lg overflow-hidden flex flex-col shadow-2xs">
          <div className="bg-sky-100/90 border-b border-sky-200 px-2.5 py-1.5 font-bold text-center text-[11px] text-[#0f3d5e]">
            رصيد الصنف في المخزن
          </div>
          <div className="flex-1 p-2.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">{selectedWarehouse?.name || 'مخزن رئيسي'}</span>
            <span className="font-mono-num font-extrabold text-sm text-[#0f3d5e]">
              {selectedProduct ? formatNum(selectedProduct.stock_qty) : '-'}
            </span>
          </div>
        </div>
      </div>

      {scanToast && (
        <div className="px-3 py-1.5 bg-teal-50 text-teal-900 border border-teal-300 rounded-lg font-bold flex items-center justify-between">
          <span>{scanToast}</span>
          <span className="text-[11px] font-mono-num">إجمالي الفاتورة: {formatMoney(netTotal, currency)}</span>
        </div>
      )}
      {error && (
        <div className="p-2.5 bg-red-50 text-red-900 border border-red-300 rounded-lg font-semibold">{error}</div>
      )}
      {successMsg && (
        <div className="p-2.5 bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-lg font-semibold">{successMsg}</div>
      )}

      {/* Main Split: Items Data Grid + Touch Screen Quick-Sale Panel */}
      <div className={`grid grid-cols-1 ${touchOpen ? 'xl:grid-cols-12' : ''} gap-3 items-start`}>
        {/* Items Data Grid */}
        <div className={`${touchOpen ? 'xl:col-span-7' : ''} bg-white border border-slate-300 rounded-lg min-h-[250px] overflow-x-auto shadow-2xs`}>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gradient-to-b from-slate-100 to-sky-100/80 border-b border-slate-300 text-[#0f3d5e]">
                <th className="py-1.5 px-2.5 border-l border-slate-400 text-right">رقم الصنف</th>
                <th className="py-1.5 px-2.5 border-l border-slate-400 text-right">الصنـــــــف</th>
                <th className="py-1.5 px-2.5 border-l border-slate-400 text-center w-20">الكمية</th>
                <th className="py-1.5 px-2.5 border-l border-slate-400 text-center">الوحدة</th>
                <th className="py-1.5 px-2.5 border-l border-slate-400 text-center w-24">السعر</th>
                <th className="py-1.5 px-2.5 border-l border-slate-400 text-center w-20">خصم %</th>
                <th className="py-1.5 px-2.5 border-l border-slate-400 text-center">الإجمالي</th>
                <th className="py-1.5 px-2.5 text-center w-12">حذف</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    امسح الباركود مباشرة (بدون ضغط بالماوس) أو اختر من أزرار البيع السريع
                  </td>
                </tr>
              ) : (
                lines.map((l, idx) => (
                  <tr
                    key={`${l.product_id}-${l.unit_id}-${idx}`}
                    className={`border-b border-slate-300 ${
                      idx === lastAddedIndex ? 'bg-emerald-50/75' : 'hover:bg-[#eef5fd]'
                    }`}
                  >
                    <td className="py-1.5 px-2.5 border-l border-slate-300 font-mono-num">{l.product_code}</td>
                    <td className="py-1.5 px-2.5 border-l border-slate-300 font-bold">
                      {l.product_name}
                      {l.is_bonus && <span className="mr-1.5 text-red-700 font-bold">(بونص)</span>}
                    </td>
                    <td className="py-1 px-1.5 border-l border-slate-300">
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={l.quantity}
                        onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                        className="w-full px-1 py-0.5 border border-slate-300 text-center font-mono-num bg-white font-bold"
                      />
                    </td>
                    <td className="py-1.5 px-2.5 border-l border-slate-300 text-center">{l.unit_name}</td>
                    <td className="py-1 px-1.5 border-l border-slate-300">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={l.is_bonus || currentUser.allow_price_change === 0}
                        value={l.unit_price}
                        onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) })}
                        className="w-full px-1 py-0.5 border border-slate-300 text-center font-mono-num bg-white"
                      />
                    </td>
                    <td className="py-1 px-1.5 border-l border-slate-300">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={l.discount_percent}
                        onChange={(e) => updateLine(idx, { discount_percent: Number(e.target.value) })}
                        className="w-full px-1 py-0.5 border border-slate-300 text-center font-mono-num bg-white"
                      />
                    </td>
                    <td className="py-1.5 px-2.5 border-l border-slate-300 text-center font-mono-num font-bold">
                      {formatMoney(l.line_total, currency)}
                    </td>
                    <td className="py-1 px-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="win-btn p-1 rounded-xs text-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Touch Screen Quick Items Panel */}
        {touchOpen && (
          <div className="xl:col-span-5 bg-white border border-sky-200 rounded-lg p-2.5 shadow-2xs flex flex-col gap-2 max-h-[340px]">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div className="font-bold text-[#0f3d5e] flex items-center gap-1.5">
                <Grid2x2 className="w-4 h-4 text-teal-600" />
                <span>أزرار البيع السريع (Touch POS)</span>
              </div>
              <span className="text-[11px] text-slate-500">اضغط على الصنف للإضافة فوراً</span>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setTouchCategory('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                  touchCategory === 'ALL' ? 'bg-[#0f3d5e] text-white border-[#0f3d5e]' : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setTouchCategory('NO_BARCODE')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                  touchCategory === 'NO_BARCODE' ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                بدون باركود
              </button>
              {defs?.categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setTouchCategory(String(cat.id))}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                    touchCategory === String(cat.id)
                      ? 'bg-[#0f3d5e] text-white border-[#0f3d5e]'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Product Touch Tiles Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {touchFilteredProducts.length === 0 ? (
                <div className="col-span-full py-10 text-center text-slate-400">
                  لا توجد أصناف في هذا التصنيف
                </div>
              ) : (
                touchFilteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      addProductDirectToCart(p, 1);
                      barcodeInputRef.current?.focus();
                    }}
                    className="group text-right bg-slate-50 hover:bg-sky-50 active:scale-[0.98] border border-slate-200 hover:border-teal-500 rounded-xl p-2 flex flex-col justify-between gap-1.5 transition-all shadow-2xs"
                  >
                    <div className="flex items-start gap-2">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-sky-100 text-[#0f3d5e] flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-[11px] leading-tight line-clamp-2">
                          {p.name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                      <span className="font-mono-num font-extrabold text-xs text-emerald-700">
                        {formatMoney(getTierPrice(p, priceTier), currency)}
                      </span>
                      <span className="text-[10px] font-mono-num text-slate-500">
                        رصيد: {formatNum(p.stock_qty || 0)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Settlement Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start pt-1">
        <div className="lg:col-span-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold mb-0.5">خصومات</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={invoiceDiscount}
                onChange={(e) => setInvoiceDiscount(Number(e.target.value))}
                className="w-full px-2 py-1 bg-white border border-slate-600 font-mono-num font-bold text-red-700 text-center"
              />
            </div>
            <div>
              <label className="block font-bold mb-0.5">إضافات</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={extraAdditions}
                onChange={(e) => setExtraAdditions(Number(e.target.value))}
                className="w-full px-2 py-1 bg-white border border-slate-600 font-mono-num font-bold text-center"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {(['CASH', 'CREDIT', 'VISA'] as const).map((pt) => (
              <button
                key={pt}
                type="button"
                onClick={() => setPaymentType(pt)}
                className={`py-1.5 font-bold rounded-md border transition-colors ${
                  paymentType === pt
                    ? 'bg-[#0f3d5e] text-white border-[#0f3d5e] shadow-xs'
                    : 'win-btn'
                }`}
              >
                {pt === 'CASH' ? 'نقدي' : pt === 'CREDIT' ? 'آجل' : 'فيزا'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={cashboxId}
              onChange={(e) => setCashboxId(Number(e.target.value))}
              className="px-2 py-1 border border-slate-300 rounded-md bg-white font-semibold"
            >
              {defs?.cashboxes.map((cb) => (
                <option key={cb.id} value={cb.id}>{cb.name}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paidAmount}
              placeholder={
                changeAmount > 0
                  ? `الباقي للعميل: ${changeAmount.toFixed(2)}`
                  : `مدفوع (${remaining.toFixed(2)} باقي)`
              }
              onChange={(e) => setPaidAmount(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-md bg-white font-mono-num text-center"
            />
          </div>
        </div>

        <div className="lg:col-span-5 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm text-slate-800 whitespace-nowrap">الإجمالي</span>
            <div className="w-16 bg-white border border-slate-300 rounded-md py-1.5 text-center font-mono-num font-extrabold text-base">
              {formatNum(lines.reduce((s, l) => s + l.quantity, 0))}
            </div>
            <div className="flex-1 bg-white border border-slate-300 rounded-md py-1.5 px-3 text-center font-mono-num font-extrabold text-lg text-[#0f3d5e]">
              {formatMoney(netTotal, currency)}
            </div>
          </div>

          {changeAmount > 0 && (
            <div className="bg-emerald-100 border border-emerald-400 rounded-md px-3 py-1 flex items-center justify-between font-bold text-emerald-900">
              <span>الباقي للعميل:</span>
              <span className="font-mono-num text-sm">{formatMoney(changeAmount, currency)}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 bg-white/90 border border-sky-200 rounded-lg p-2">
            <button type="button" onClick={resetInvoice} className="win-btn px-3 py-1.5 font-bold rounded-xs flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5 text-emerald-700" /> جديد
            </button>
            <button type="button" onClick={loadHistory} className="win-btn px-3 py-1.5 font-bold rounded-xs flex items-center gap-1">
              <History className="w-3.5 h-3.5 text-blue-800" /> بحث
            </button>
            <button
              type="button"
              disabled={saving || !!lastSavedInvoice}
              onClick={handleSave}
              className="win-btn flex-1 px-3 py-1.5 font-extrabold rounded-xs flex items-center justify-center gap-1 text-emerald-900"
            >
              <Save className="w-3.5 h-3.5 text-emerald-700" />
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
            <button
              type="button"
              disabled={lines.length === 0}
              onClick={() => {
                setAutoPrintPending(false);
                setPrintOpen(true);
              }}
              className="win-btn px-3 py-1.5 font-bold rounded-xs flex items-center gap-1"
            >
              <Printer className="w-3.5 h-3.5 text-slate-700" /> طباعة
            </button>
            {canViewCost && (
              <button
                type="button"
                onClick={() => setProfitModalOpen(true)}
                className="win-btn px-2.5 py-1.5 font-bold rounded-xs flex items-center gap-1"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-700" /> ربح الفاتورة
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <label className="block font-bold mb-0.5">ملاحظات:</label>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-2 bg-white border border-slate-300 rounded-md"
            placeholder="ملاحظات الفاتورة..."
          />
        </div>
      </div>

      {/* Held Invoices Queue Modal */}
      {heldModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="win-window w-full max-w-2xl rounded-xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="h-9 bg-[#0f3d5e] text-white px-4 flex items-center justify-between font-bold">
              <span>الفواتير المعلقة (صف الانتظار)</span>
              <button type="button" onClick={() => setHeldModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2.5 bg-white">
              {heldList.length === 0 ? (
                <div className="py-10 text-center text-slate-500 font-semibold">
                  لا توجد فواتير معلقة حالياً. يمكنك تعليق الفاتورة الحالية بالضغط على (F8).
                </div>
              ) : (
                heldList.map((h) => (
                  <div
                    key={h.id}
                    className="border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50"
                  >
                    <div>
                      <div className="font-bold text-sm text-[#0f3d5e]">{h.customerName}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        الوقت: <span className="font-mono-num">{h.createdAt}</span> · الأصناف:{' '}
                        <span className="font-mono-num font-bold">{h.items.length}</span> · الإجمالي:{' '}
                        <span className="font-mono-num font-bold text-emerald-700">{formatMoney(h.netTotal, currency)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => recallHeldInvoice(h)}
                        className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1"
                      >
                        <PlayCircle className="w-3.5 h-3.5" /> استرجاع للفاتورة
                      </button>
                      <button
                        type="button"
                        onClick={() => setHeldList((prev) => prev.filter((x) => x.id !== h.id))}
                        className="win-btn p-1.5 rounded-md text-red-700"
                        title="حذف الفاتورة المعلقة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profit Modal */}
      {profitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="win-window w-full max-w-md rounded-xs overflow-hidden">
            <div className="h-8 bg-white border-b border-slate-300 px-3 flex items-center justify-between font-bold">
              <span>تحليل ربح الفاتورة</span>
              <button type="button" onClick={() => setProfitModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between">
                <span>صافي قيمة البيع (بدون ضريبة):</span>
                <span className="font-mono-num font-bold">{formatMoney(netTotal - taxAmount, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>تكلفة البضاعة المباعة (المتوسط المرجح):</span>
                <span className="font-mono-num text-red-700 font-bold">{formatMoney(estimatedCost, currency)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-400 text-sm font-extrabold text-emerald-800">
                <span>مجمل ربح الفاتورة:</span>
                <span className="font-mono-num">{formatMoney(estimatedProfit, currency)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="win-window w-full max-w-4xl rounded-xs overflow-hidden max-h-[85vh] flex flex-col">
            <div className="h-8 bg-white border-b border-slate-300 px-3 flex items-center justify-between font-bold">
              <span>بحث وسجل فواتير المبيعات</span>
              <button type="button" onClick={() => setHistoryOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-white">
              <table className="w-full text-xs border-collapse border border-slate-400">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-3 border border-slate-500 text-right">رقم الفاتورة</th>
                    <th className="py-2 px-3 border border-slate-500 text-right">التاريخ</th>
                    <th className="py-2 px-3 border border-slate-500 text-right">العميل</th>
                    <th className="py-2 px-3 border border-slate-500 text-left">الصافي</th>
                    {canViewCost && <th className="py-2 px-3 border border-slate-500 text-left">الربح</th>}
                    <th className="py-2 px-3 border border-slate-500 text-center">الحالة</th>
                    <th className="py-2 px-3 border border-slate-500 text-center">إلغاء</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map((inv) => (
                    <tr key={String(inv.id)} className="border-b border-slate-300 hover:bg-slate-50">
                      <td className="py-1.5 px-3 font-mono-num font-bold">{String(inv.invoice_number)}</td>
                      <td className="py-1.5 px-3 font-mono-num">{String(inv.invoice_date)}</td>
                      <td className="py-1.5 px-3">{String(inv.customer_name)}</td>
                      <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(Number(inv.net_total), currency)}</td>
                      {canViewCost && <td className="py-1.5 px-3 text-left font-mono-num text-emerald-700 font-bold">{formatMoney(Number(inv.gross_profit), currency)}</td>}
                      <td className="py-1.5 px-3 text-center">{inv.status === 'APPROVED' ? 'معتمدة' : 'ملغاة'}</td>
                      <td className="py-1.5 px-3 text-center">
                        {inv.status === 'APPROVED' && (
                          <button type="button" onClick={() => cancelSavedInvoice(Number(inv.id))} className="text-red-700 font-bold hover:underline">
                            إلغاء وعكس
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <PrintInvoiceModal
        open={printOpen}
        onClose={() => {
          setPrintOpen(false);
          setAutoPrintPending(false);
        }}
        title="فاتورة مبيعات"
        invoiceNumber={lastSavedInvoice?.invoice_number || 'مسودة'}
        invoiceDate={invoiceDate}
        partyLabel="العميل"
        partyName={selectedCustomer?.name || 'عميل نقدي'}
        partyPhone={selectedCustomer?.phone}
        warehouseName={selectedWarehouse?.name || 'مخزن رئيسي'}
        paymentType={paymentType}
        cashierName={currentUser.username}
        subtotal={subtotal}
        discount={itemsDiscount + invoiceDiscount}
        additions={extraAdditions}
        tax={taxAmount}
        netTotal={netTotal}
        paidAmount={effectivePaid}
        remainingAmount={remaining}
        notes={notes}
        items={lines}
        settings={settings}
        autoPrint={autoPrintPending}
      />
    </div>
  );
};
