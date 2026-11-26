export interface PermissionRow {
  id?: number;
  role_id: number;
  module_key: string;
  can_view: number;
  can_add: number;
  can_edit: number;
  can_delete: number;
  can_approve: number;
  can_print: number;
  can_export: number;
  can_view_cost: number;
}

export interface UserInfo {
  id: number;
  username: string;
  full_name: string;
  role_id: number;
  role_name: string;
  is_active: number;
  allow_negative_stock: number;
  allow_price_change: number;
}

export interface LicenseState {
  status: 'TRIAL' | 'TRIAL_EXPIRED' | 'ACTIVATED' | 'INVALID_OR_EXPIRED';
  is_operational: boolean;
  license_id: string;
  customer_name: string;
  license_type: 'TRIAL' | 'MONTHLY' | 'YEARLY' | 'LIFETIME';
  device_fingerprint: string;
  bound_fingerprint: string;
  max_devices: number;
  issued_at: string;
  expires_at: string | null;
  days_left: number | null;
  warning_level: string;
  clock_tamper: boolean;
  tamper_detected?: boolean;
  strict_activation?: boolean;
  key_id?: string;
  message: string;
}

export interface BootstrapData {
  settings: Record<string, string>;
  users: UserInfo[];
  currentUser: UserInfo | null;
  permissions: PermissionRow[];
  modules: Array<{ key: string; label: string }>;
  license: LicenseState;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  alt_name: string;
  barcode: string;
  category_id: number | null;
  category_name?: string;
  brand: string;
  base_unit_id: number;
  unit_name?: string;
  purchase_price: number;
  last_cost: number;
  avg_cost: number;
  sale_price: number;
  wholesale_price: number;
  special_price: number;
  min_stock: number;
  reorder_level: number;
  notes: string;
  image_url?: string;
  is_active: number;
  stock_qty?: number;
  conversions?: Array<{
    id: number;
    unit_id: number;
    unit_name: string;
    conversion_factor: number;
    sale_price: number;
    wholesale_price: number;
  }>;
  extra_barcodes?: Array<{ id: number; barcode: string }>;
  warehouse_stocks?: Array<{ warehouse_id: number; warehouse_name: string; quantity: number }>;
}

export interface DefinitionsBundle {
  categories: Array<{ id: number; name: string; notes: string }>;
  units: Array<{ id: number; name: string }>;
  warehouses: Array<{ id: number; name: string; location: string; is_default: number }>;
  cashboxes: Array<{ id: number; name: string; type: string; account_number: string; opening_balance: number; current_balance: number; is_default: number }>;
  expense_revenue_types: Array<{ id: number; name: string; kind: 'EXPENSE' | 'REVENUE' }>;
  sales_reps: Array<{ id: number; name: string; phone: string; commission_rate: number }>;
  customers: Array<{
    id: number;
    code: string;
    name: string;
    phone: string;
    address: string;
    tax_number: string;
    opening_balance: number;
    current_balance: number;
    credit_limit: number;
    is_walkin: number;
    is_active: number;
    notes: string;
  }>;
  suppliers: Array<{
    id: number;
    code: string;
    name: string;
    phone: string;
    address: string;
    tax_number: string;
    opening_balance: number;
    current_balance: number;
    is_active: number;
    notes: string;
  }>;
}

export type ViewKey =
  | 'dashboard'
  | 'definitions'
  | 'purchases'
  | 'sales'
  | 'returns'
  | 'inventory'
  | 'accounts'
  | 'treasury'
  | 'operations'
  | 'import'
  | 'reports'
  | 'users'
  | 'settings';

export type SettingsSubTab = 'company' | 'hardware' | 'backup' | 'license' | 'updates';

export interface PromoSlide {
  id: string;
  title: string;
  subtitle?: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  badge?: string;
}

export interface HeldInvoiceItem {
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

export interface HeldInvoice {
  id: string;
  createdAt: string;
  label: string;
  customerId: number;
  customerName: string;
  warehouseId: number;
  cashboxId: number;
  paymentType: 'CASH' | 'CREDIT' | 'VISA';
  priceTier: 'RETAIL' | 'WHOLESALE' | 'SPECIAL';
  invoiceDiscount: number;
  extraAdditions: number;
  notes: string;
  items: HeldInvoiceItem[];
  netTotal: number;
}

export interface CustomerDisplayLine {
  name: string;
  unitName: string;
  quantity: number;
  unitPrice: number;
  discountValue: number;
  lineTotal: number;
  isBonus?: boolean;
}

export interface CustomerDisplayState {
  mode: 'IDLE' | 'CART' | 'PAID';
  updatedAt: number;
  companyName: string;
  companyLogo?: string;
  companyPhone?: string;
  currency: string;
  cashierName: string;
  customerName: string;
  invoiceNumber?: string;
  items: CustomerDisplayLine[];
  lastAddedIndex?: number;
  subtotal: number;
  discount: number;
  additions: number;
  tax: number;
  netTotal: number;
  paidAmount: number;
  remainingAmount: number;
  changeAmount: number;
  paymentType: 'CASH' | 'CREDIT' | 'VISA';
  welcomeText?: string;
  tickerText?: string;
  qrEnabled?: boolean;
  qrLabel?: string;
  qrValue?: string;
  slides?: PromoSlide[];
}

export interface UpdateStateInfo {
  version: string;
  buildId: string;
  releasedAt: string;
  updatedAt: string;
  notes: string;
}

export interface UpdateReleaseManifest {
  version: string;
  buildId: string;
  releasedAt: string;
  notes: string;
  serverUrl: string;
  packageUrl: string;
  directHtmlUrl: string;
  setupExeUrl: string;
  sha256: string;
  packageSizeBytes: number;
  integrityIssuedAt: string;
}

export interface UpdateStatusResponse {
  mode: 'master' | 'client';
  isClient: boolean;
  manifest?: UpdateReleaseManifest;
  config?: { updateServerUrl: string; updatedAt: string };
  localState?: UpdateStateInfo;
  remoteManifest?: UpdateReleaseManifest | null;
  hasUpdate?: boolean;
  checkError?: string | null;
}
