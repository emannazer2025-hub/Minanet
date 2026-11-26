export type MinaLayoutId =
  | 'mina-classic'
  | 'modern-sidebar'
  | 'pos-ribbon'
  | 'win11-fluent'
  | 'dark-executive'
  | 'cloud-analytics'
  | 'crimson-3d-store'
  | 'radial-wheel';

export type MinaThemeId =
  | 'mina-classic'
  | 'aliphia-teal'
  | 'crimson-store'
  | 'emerald-trade'
  | 'royal-burgundy'
  | 'steel-graphite'
  | 'amber-bronze'
  | 'sky-azure'
  | 'clinical-teal'
  | 'fresh-citrus'
  | 'rose-cashmere'
  | 'obsidian-violet';

export type MinaIndustryId =
  | 'general-classic'
  | 'fashion-apparel'
  | 'pharmacy-medical'
  | 'supermarket-grocery'
  | 'mobile-electronics'
  | 'perfumes-cosmetics'
  | 'restaurant-cafe'
  | 'autoparts-hardware'
  | 'jewelry-watches'
  | 'stationery-library'
  | 'wholesale-distribution'
  | 'optics-eyewear';

export type MinaIndustryCategory = 'retail' | 'fashion-beauty' | 'tech-service' | 'wholesale';

export interface MinaLayoutDefinition {
  id: MinaLayoutId;
  nameAr: string;
  subtitleAr: string;
  structureSummary: string;
  defaultTheme: MinaThemeId;
}

export interface MinaThemeDefinition {
  id: MinaThemeId;
  nameAr: string;
  subtitleAr: string;
  preview: {
    desktopBg: string;
    capsuleBg: string;
    capsuleBorder: string;
    taskbarBg: string;
    headerBg: string;
    winBg: string;
    panelBg: string;
    accentColor: string;
  };
}

export interface MinaIndustryDefinition {
  id: MinaIndustryId;
  category: MinaIndustryCategory;
  nameAr: string;
  shortBadgeAr: string;
  taglineAr: string;
  heroTitleAr: string;
  defaultLayout: MinaLayoutId;
  defaultTheme: MinaThemeId;
  highlights: string[];
  moduleLabels: {
    sales: { label: string; sublabel: string };
    purchases: { label: string; sublabel: string };
    products: { label: string; sublabel: string };
    inventory: { label: string; sublabel: string };
    returnsSales: { label: string; sublabel: string };
    accounts: { label: string; sublabel: string };
  };
}

export const MINA_LAYOUTS: MinaLayoutDefinition[] = [
  {
    id: 'cloud-analytics',
    nameAr: 'لوحة التحليلات السحابية (Aliphia Style)',
    subtitleAr: 'شريط علوي داكن وقائمة بيضاء جانبية بتحديد تيل مع بطاقات أرباح ومبيعات ملونة، رسم بياني دائري، وتنبيهات المخزن والفواتير الأخيرة',
    structureSummary: 'قائمة بيضاء بتحديد تيل · 4 مؤشرات ملونة · رسم دائري · جدول النواقص والفواتير',
    defaultTheme: 'aliphia-teal',
  },
  {
    id: 'crimson-3d-store',
    nameAr: 'واجهة المتجر الثلاثية الأبعاد (Crimson Store)',
    subtitleAr: 'خلفية بيضاء ناصعة مع رسم ثلاثي الأبعاد مركزي وعمودين متماثلين من الأزرار الحمراء اللامعة وأيقونات التشغيل السريع',
    structureSummary: 'خلفية بيضاء ناصعة · أزرار 3D حمراء لامعة · رسم مركزي ثلاثي الأبعاد',
    defaultTheme: 'crimson-store',
  },
  {
    id: 'radial-wheel',
    nameAr: 'العجلة الدائرية الملونة (Radial Store Wheel)',
    subtitleAr: 'شاشة رئيسية بعجلة دائرية من 6 قطاعات ملونة حول سلة المشتريات المركزية على خلفية مخازن مضيئة ناعمة',
    structureSummary: 'عجلة 6 قطاعات ملونة · مركز سلة التسوق · خلفية مخازن ناعمة',
    defaultTheme: 'fresh-citrus',
  },
  {
    id: 'modern-sidebar',
    nameAr: 'واجهة المؤسسات الحديثة (قائمة جانبية)',
    subtitleAr: 'تصميم احترافي بقائمة جانبية ثابتة، شريط مؤشرات بالأعلى، وشاشات كاملة بدون نوافذ منبثقة',
    structureSummary: 'قائمة جانبية يمنى · شريط علوي · بطاقات مؤشرات · أزرار مسطحة عصرية',
    defaultTheme: 'steel-graphite',
  },
  {
    id: 'pos-ribbon',
    nameAr: 'واجهة الكاشير والأشرطة السريعة (POS Ribbon)',
    subtitleAr: 'شريط أزرار وأيقونات علوي سريع مع شبكة مربعات كبيرة مناسبة للكاشير وشاشات اللمس',
    structureSummary: 'شريط أوامر علوي · شبكة مربعات كبيرة · وصول بضغطة واحدة',
    defaultTheme: 'fresh-citrus',
  },
  {
    id: 'win11-fluent',
    nameAr: 'واجهة ويندوز 11 الزجاجية (Fluent Glass)',
    subtitleAr: 'نوافذ دائرية شفافة حديثة مع شريط مهام عائم في المنتصف وقائمة ابدأ منظمة',
    structureSummary: 'تصميم زجاجي ناعم · شريط مهام عائم · حواف دائرية حديثة',
    defaultTheme: 'sky-azure',
  },
  {
    id: 'dark-executive',
    nameAr: 'الواجهة الليلية الداكنة (Dark Executive)',
    subtitleAr: 'تصميم ليلي متكامل بخلفيات داكنة مريحة للعين ونصوص عالية التباين في كل الشاشات',
    structureSummary: 'وضع ليلي كامل · قائمة جانبية مدمجة · مؤشرات مالية بارزة',
    defaultTheme: 'obsidian-violet',
  },
  {
    id: 'mina-classic',
    nameAr: 'واجهة Mina Net القياسية',
    subtitleAr: 'الواجهة القياسية المعتمدة لنظام Mina Net ببطاقات الوصول السريع ونوافذ العمل المنظمة وشريط المهام السفلي',
    structureSummary: 'شاشة بطاقات منظمة · نوافذ عمل سريعة · شريط مهام سفلي',
    defaultTheme: 'mina-classic',
  },
];

export const MINA_THEMES: MinaThemeDefinition[] = [
  {
    id: 'aliphia-teal',
    nameAr: 'تيل التحليلات الداكن',
    subtitleAr: 'شريط علوي رمادي فحمي مع تيل نعناعي ساطع وخلفية عمل بيضاء',
    preview: {
      desktopBg: 'linear-gradient(125deg, #f3f3f4 0%, #e5e7eb 100%)',
      capsuleBg: 'linear-gradient(180deg, #1bb394 0%, #15947a 100%)',
      capsuleBorder: '#ffffff',
      taskbarBg: '#2b333e',
      headerBg: '#1bb394',
      winBg: '#f3f3f4',
      panelBg: '#ffffff',
      accentColor: '#2563eb',
    },
  },
  {
    id: 'crimson-store',
    nameAr: 'أحمر المتجر اللامع',
    subtitleAr: 'خلفية بيضاء ناصعة مع أزرار حمراء ثلاثية الأبعاد وتباين عالٍ',
    preview: {
      desktopBg: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
      capsuleBg: 'linear-gradient(180deg, #ef4444 0%, #991b1b 100%)',
      capsuleBorder: '#fee2e2',
      taskbarBg: '#991b1b',
      headerBg: '#dc2626',
      winBg: '#f8fafc',
      panelBg: '#ffffff',
      accentColor: '#b91c1c',
    },
  },
  {
    id: 'mina-classic',
    nameAr: 'الأزرق الفولاذي والتيل',
    subtitleAr: 'الهوية البصرية الرسمية لنظام Mina Net بالأزرق الفولاذي ولمسات التيل',
    preview: {
      desktopBg: 'linear-gradient(135deg, #edf2f7 0%, #dce5ef 50%, #cddae8 100%)',
      capsuleBg: 'linear-gradient(180deg, #164e78 0%, #0f3d5e 100%)',
      capsuleBorder: '#e2e8f0',
      taskbarBg: '#0f172a',
      headerBg: '#0f3d5e',
      winBg: '#f1f5f9',
      panelBg: '#ffffff',
      accentColor: '#0f766e',
    },
  },
  {
    id: 'clinical-teal',
    nameAr: 'التيل الطبي الثلجي',
    subtitleAr: 'أخضر طبي ونعناع فاتح مريح للصيدليات والمراكز',
    preview: {
      desktopBg: 'linear-gradient(125deg, #ecfeff 0%, #cffafe 50%, #a5f3fc 100%)',
      capsuleBg: 'linear-gradient(180deg, #0d9488 0%, #115e59 100%)',
      capsuleBorder: '#f0fdfa',
      taskbarBg: '#134e4a',
      headerBg: '#0f766e',
      winBg: '#f0fdfa',
      panelBg: '#f8fafc',
      accentColor: '#0369a1',
    },
  },
  {
    id: 'fresh-citrus',
    nameAr: 'أخضر المتاجر والبرتقالي',
    subtitleAr: 'ألوان السوبر ماركت الحيوية والواضحة للكاشير',
    preview: {
      desktopBg: 'linear-gradient(125deg, #f0fdf4 0%, #dcfce7 50%, #bbf7d0 100%)',
      capsuleBg: 'linear-gradient(180deg, #16a34a 0%, #166534 100%)',
      capsuleBorder: '#ffffff',
      taskbarBg: '#14532d',
      headerBg: '#15803d',
      winBg: '#f4faf5',
      panelBg: '#ffffff',
      accentColor: '#d97706',
    },
  },
  {
    id: 'rose-cashmere',
    nameAr: 'كشمير البوتيك والأزياء',
    subtitleAr: 'عنابي ناعم ولمسات دافئة لمحلات الملابس والتجميل',
    preview: {
      desktopBg: 'linear-gradient(125deg, #fdf2f8 0%, #fce7f3 50%, #fbcfe8 100%)',
      capsuleBg: 'linear-gradient(180deg, #be185d 0%, #831843 100%)',
      capsuleBorder: '#fff1f2',
      taskbarBg: '#500724',
      headerBg: '#9d174d',
      winBg: '#fdf8fa',
      panelBg: '#ffffff',
      accentColor: '#b45309',
    },
  },
  {
    id: 'obsidian-violet',
    nameAr: 'الأوبسيديان التقني',
    subtitleAr: 'رمادي داكن مع نيلي تقني لمحلات الموبايلات والإلكترونيات',
    preview: {
      desktopBg: 'linear-gradient(125deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%)',
      capsuleBg: 'linear-gradient(180deg, #4f46e5 0%, #312e81 100%)',
      capsuleBorder: '#e0e7ff',
      taskbarBg: '#1e1b4b',
      headerBg: '#4338ca',
      winBg: '#0f172a',
      panelBg: '#1e293b',
      accentColor: '#38bdf8',
    },
  },
  {
    id: 'emerald-trade',
    nameAr: 'الزمردي التجاري',
    subtitleAr: 'أخضر زمردي هادئ ومريح للعمل الطويل',
    preview: {
      desktopBg: 'linear-gradient(125deg, #e2efe8 0%, #bdd9ca 50%, #9ec4b2 100%)',
      capsuleBg: 'linear-gradient(180deg, #0f766e 0%, #064e3b 100%)',
      capsuleBorder: '#f0fdf4',
      taskbarBg: '#0b3529',
      headerBg: '#0f5132',
      winBg: '#edf3ee',
      panelBg: '#f6faf7',
      accentColor: '#b45309',
    },
  },
  {
    id: 'royal-burgundy',
    nameAr: 'العنابي والذهبي',
    subtitleAr: 'درجات العنابي الداكن واللمسات الذهبية',
    preview: {
      desktopBg: 'linear-gradient(125deg, #f3e8e6 0%, #dec5c1 50%, #c9a7a2 100%)',
      capsuleBg: 'linear-gradient(180deg, #991b1b 0%, #5c0d14 100%)',
      capsuleBorder: '#fef2f2',
      taskbarBg: '#450a0a',
      headerBg: '#7f1d1d',
      winBg: '#f3ede7',
      panelBg: '#faf6f2',
      accentColor: '#92400e',
    },
  },
  {
    id: 'steel-graphite',
    nameAr: 'الجرافيتي المعدني',
    subtitleAr: 'رمادي معدني حديث بتباين احترافي',
    preview: {
      desktopBg: 'linear-gradient(125deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)',
      capsuleBg: 'linear-gradient(180deg, #334155 0%, #0f172a 100%)',
      capsuleBorder: '#f8fafc',
      taskbarBg: '#0f172a',
      headerBg: '#1e293b',
      winBg: '#eef2f6',
      panelBg: '#f8fafc',
      accentColor: '#0369a1',
    },
  },
  {
    id: 'amber-bronze',
    nameAr: 'البرونزي والذهبي',
    subtitleAr: 'برونزي دافئ مع تباين مريح للمطاعم والمجوهرات',
    preview: {
      desktopBg: 'linear-gradient(125deg, #f5ede0 0%, #e4d1b4 50%, #cfa97c 100%)',
      capsuleBg: 'linear-gradient(180deg, #a16207 0%, #5c2d0c 100%)',
      capsuleBorder: '#fffbeb',
      taskbarBg: '#3b1c0a',
      headerBg: '#78350f',
      winBg: '#f4eee4',
      panelBg: '#fbf8f3',
      accentColor: '#991b1b',
    },
  },
  {
    id: 'sky-azure',
    nameAr: 'السماوي الفاتح',
    subtitleAr: 'أزرق سماوي مشرق وخفيف على العين',
    preview: {
      desktopBg: 'linear-gradient(125deg, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%)',
      capsuleBg: 'linear-gradient(180deg, #0284c7 0%, #075985 100%)',
      capsuleBorder: '#f0f9ff',
      taskbarBg: '#0c4a6e',
      headerBg: '#0369a1',
      winBg: '#edf5fb',
      panelBg: '#f5faff',
      accentColor: '#be123c',
    },
  },
];

export const MINA_INDUSTRIES: MinaIndustryDefinition[] = [
  {
    id: 'fashion-apparel',
    category: 'fashion-beauty',
    nameAr: 'محل ملابس وبوتيك أزياء',
    shortBadgeAr: 'بوتيك الملابس والأزياء',
    taglineAr: 'تصميم أنيق هادئ بواجهة زجاجية مريحة لبيع الملابس والأحذية ومتابعة المقاسات والألوان والمواسم',
    heroTitleAr: 'نظام إدارة محلات الملابس والأزياء',
    defaultLayout: 'win11-fluent',
    defaultTheme: 'rose-cashmere',
    highlights: ['فواتير البيع بالمقاس واللون', 'توريد الموديلات والموسم', 'تبديل ومرتجع العملاء'],
    moduleLabels: {
      sales: { label: 'كاشير الملابس والموديلات', sublabel: 'بيع فوري وتطبيق الخصم والباركود' },
      purchases: { label: 'فواتير توريد المصانع والمستوردين', sublabel: 'إضافة الموديلات والمواسم الجديدة' },
      products: { label: 'دليل الموديلات والمقاسات والأسعار', sublabel: 'تكويد الألوان والمقاسات وطباعة الليبل' },
      inventory: { label: 'جرد الاستوك والفروع والمخازن', sublabel: 'متابعة أرصدة الموديلات والنواقص' },
      returnsSales: { label: 'استبدال ومرتجع الملابس', sublabel: 'مرتجع فاتورة واستبدال مقاس' },
      accounts: { label: 'حسابات العملاء والمصانع', sublabel: 'الآجل والسداد وكشوف الحساب' },
    },
  },
  {
    id: 'pharmacy-medical',
    category: 'retail',
    nameAr: 'صيدلية ومستلزمات طبية',
    shortBadgeAr: 'واجهة الصيدلية الطبية',
    taglineAr: 'واجهة طبية منظمة بقائمة جانبية سريعة ودرجات تيل مريحة لصرف الأدوية ومتابعة النواقص والشركات',
    heroTitleAr: 'نظام إدارة الصيدلية وصرف الأدوية',
    defaultLayout: 'modern-sidebar',
    defaultTheme: 'clinical-teal',
    highlights: ['صرف سريع بالباركود', 'متابعة نواقص الأدوية فوراً', 'طلبيات مخازن وشركات الأدوية'],
    moduleLabels: {
      sales: { label: 'شباك الصرف وفاتورة الدواء', sublabel: 'صرف سريع بالباركود وحساب الباقي' },
      purchases: { label: 'فواتير مخازن وشركات الأدوية', sublabel: 'توريد الأدوية والمستلزمات الطبية' },
      products: { label: 'الأصناف والأدوية والباركود', sublabel: 'أسعار البيع والجمهور وتكويد المستحضرات' },
      inventory: { label: 'جرد الرفوف ونواقص الصيدلية', sublabel: 'تنبيهات حد الطلب والأرصدة الحرجة' },
      returnsSales: { label: 'مرتجع أدوية ومستلزمات', sublabel: 'استرجاع وتعديل رصيد الدرج والمخزن' },
      accounts: { label: 'حسابات المرضى والتعاقدات والمخازن', sublabel: 'دفعات الشركات والعملاء' },
    },
  },
  {
    id: 'supermarket-grocery',
    category: 'retail',
    nameAr: 'سوبر ماركت وهايبر ماركت',
    shortBadgeAr: 'كاشير السوبر ماركت السريع',
    taglineAr: 'واجهة كاشير بأشرطة وأزرار لمس كبيرة للعمل السريع مع قارئ الباركود وفواتير الموردين',
    heroTitleAr: 'نقطة بيع السوبر ماركت والهايبر',
    defaultLayout: 'pos-ribbon',
    defaultTheme: 'fresh-citrus',
    highlights: ['أزرار كاشير كبيرة وسريعة', 'متابعة الثلاجات والمخزن', 'تحديث أسعار وباركود الرفوف'],
    moduleLabels: {
      sales: { label: 'كاشير البيع السريع (POS)', sublabel: 'مسح باركود فوري وإيصال 80mm' },
      purchases: { label: 'توريد الشركات والموردين', sublabel: 'استلام البضائع الغذائية والمنظفات' },
      products: { label: 'السلع والأقسام والباركود', sublabel: 'أسعار القطعة والكرتونة وتعديل الرفوف' },
      inventory: { label: 'أرصدة الرفوف والثلاجات والمخزن', sublabel: 'جرد السلع السريعة وكشف النواقص' },
      returnsSales: { label: 'مرتجع كاشير وعملاء', sublabel: 'تسوية الفواتير الفورية والمرتجعات' },
      accounts: { label: 'حسابات شركات التوريد والمناديب', sublabel: 'سداد الموردين ومراجعة الخزائن' },
    },
  },
  {
    id: 'mobile-electronics',
    category: 'tech-service',
    nameAr: 'محل موبايلات وإكسسوارات وإلكترونيات',
    shortBadgeAr: 'متجر الموبايلات والإلكترونيات',
    taglineAr: 'واجهة ليلية حديثة عالية التباين (Dark Executive) مثالية لمعارض الهواتف والكمبيوتر والإكسسوارات',
    heroTitleAr: 'نظام إدارة معارض الموبايلات والإلكترونيات',
    defaultLayout: 'dark-executive',
    defaultTheme: 'obsidian-violet',
    highlights: ['واجهة داكنة عصرية للمعارض', 'إدارة الأجهزة والإكسسوارات', 'شيكات وأقساط وكشوف حساب'],
    moduleLabels: {
      sales: { label: 'فاتورة بيع أجهزة وإكسسوارات', sublabel: 'بيع فوري أو آجل مع خصم وطباعة' },
      purchases: { label: 'توريد الهواتف والوكلاء', sublabel: 'إدخال شحنات الموبايلات وقطع الصيانة' },
      products: { label: 'الأجهزة والموديلات والباركود', sublabel: 'تكويد السيريال والأسعار والإكسسوارات' },
      inventory: { label: 'جرد المعرض والمخزن الرئيسي', sublabel: 'أرصدة الأجهزة ومتابعة حد الأمان' },
      returnsSales: { label: 'مرتجع وضمان عملاء', sublabel: 'استرجاع أو تسوية فواتير الأجهزة' },
      accounts: { label: 'حسابات العملاء والأقساط والوكلاء', sublabel: 'سندات قبض وصرف ومواعيد سداد' },
    },
  },
  {
    id: 'perfumes-cosmetics',
    category: 'fashion-beauty',
    nameAr: 'محل عطور ومستحضرات تجميل',
    shortBadgeAr: 'بوتيك العطور والتجميل',
    taglineAr: 'تصميم زجاجي فاخر بدرجات الكشمير والعنابي مناسب لمراكز التجميل والعطور والهدايا',
    heroTitleAr: 'نظام إدارة معارض العطور ومستحضرات التجميل',
    defaultLayout: 'win11-fluent',
    defaultTheme: 'royal-burgundy',
    highlights: ['عرض أنيق للعطور ومستحضرات التجميل', 'طباعة باركود العبوات', 'متابعة العروض والهدايا'],
    moduleLabels: {
      sales: { label: 'فاتورة بيع العطور والتجميل', sublabel: 'بيع فوري وتنسيق عروض الهدايا' },
      purchases: { label: 'فواتير الشركات والمستوردين', sublabel: 'توريد البراندات والعبوات والخامات' },
      products: { label: 'دليل البراندات والتركيبات', sublabel: 'تسعير الماركات وطباعة استيكر الأسعار' },
      inventory: { label: 'مخزن العبوات والتركيبات', sublabel: 'جرد الرفوف وتنبيهات الأصناف الناقصة' },
      returnsSales: { label: 'مرتجع عملاء واستبدال', sublabel: 'تسوية الفواتير وإرجاع الرصيد للمخزن' },
      accounts: { label: 'حسابات العملاء والموردين', sublabel: 'متابعة السداد وكشوف الحساب' },
    },
  },
  {
    id: 'restaurant-cafe',
    category: 'retail',
    nameAr: 'مطعم وكافيه وتيك أواي',
    shortBadgeAr: 'كاشير المطاعم والكافيهات',
    taglineAr: 'أزرار لمس عريضة وسريعة باللون البرونزي الدافئ مناسبة لكاشير التيك أواي وإدارة مصروفات المطبخ',
    heroTitleAr: 'نقطة بيع المطاعم والكافيهات',
    defaultLayout: 'pos-ribbon',
    defaultTheme: 'amber-bronze',
    highlights: ['أزرار طلبات كاشير كبيرة', 'متابعة مصروفات المطبخ اليومية', 'توريد الخامات والمشروبات'],
    moduleLabels: {
      sales: { label: 'كاشير الطلبات والفواتير', sublabel: 'إصدار بون سريع للمطبخ والعميل' },
      purchases: { label: 'مشتريات الخامات والموردين', sublabel: 'استلام مستلزمات المطبخ والمشروبات' },
      products: { label: 'قائمة الأصناف والمشروبات', sublabel: 'تكويد الوجبات والمشروبات وتعديل الأسعار' },
      inventory: { label: 'مخزن الخامات والمشروبات', sublabel: 'جرد الثلاجات والمخزن الرئيسي' },
      returnsSales: { label: 'إلغاء وتعديل طلبات', sublabel: 'تسوية البونات والمرتجعات اليومية' },
      accounts: { label: 'مصروفات التشغيل والموردين', sublabel: 'متابعة الخزينة والورديات والمصروفات' },
    },
  },
  {
    id: 'autoparts-hardware',
    category: 'tech-service',
    nameAr: 'قطع غيار سيارات وأدوات صحية ومعدات',
    shortBadgeAr: 'مركز قطع الغيار والمعدات',
    taglineAr: 'تصميم صناعي جرافيتي منظم بقائمة جانبية لسهولة البحث بكود القطعة وإدارة حسابات الورش والتجار',
    heroTitleAr: 'نظام إدارة قطع الغيار والعدد والمعدات',
    defaultLayout: 'modern-sidebar',
    defaultTheme: 'steel-graphite',
    highlights: ['بحث سريع بكود القطعة والباركود', 'كشوف حسابات الورش والفنيين', 'تحويلات بين المخازن'],
    moduleLabels: {
      sales: { label: 'فاتورة بيع قطع الغيار والمعدات', sublabel: 'صرف للورش والأفراد نقدي وآجل' },
      purchases: { label: 'فواتير الوكلاء والمستوردين', sublabel: 'توريد قطع الغيار وتحديث متوسط التكلفة' },
      products: { label: 'فهرس الأكواد والقطع والأسعار', sublabel: 'تصنيف الموديلات والشركات المصنعة' },
      inventory: { label: 'أرصدة المخازن والرفوف', sublabel: 'استعلام فوري برقم القطعة وتحويل البضاعة' },
      returnsSales: { label: 'مرتجع الورش والعملاء', sublabel: 'استرجاع القطع وتحديث رصيد المخزن' },
      accounts: { label: 'حسابات الورش والمقاولين والوكلاء', sublabel: 'دفعات الآجل والشيكات وكشوف الحساب' },
    },
  },
  {
    id: 'jewelry-watches',
    category: 'fashion-beauty',
    nameAr: 'محل مجوهرات وساعات وإكسسوارات راقية',
    shortBadgeAr: 'معرض المجوهرات والساعات',
    taglineAr: 'مظهر تنفيذي فاخر داكن بلمسات ذهبية وبرونزية يبرز أرصدة الخزينة والمبيعات والفواتير',
    heroTitleAr: 'نظام إدارة معارض المجوهرات والساعات',
    defaultLayout: 'dark-executive',
    defaultTheme: 'amber-bronze',
    highlights: ['واجهة داكنة فاخرة بلمسات ذهبية', 'متابعة دقيقة للخزائن والنقدية', 'كشوف جرد وأرباح يومية'],
    moduleLabels: {
      sales: { label: 'فاتورة بيع الساعات والمشغولات', sublabel: 'فواتير معتمدة ومطبوعة بمقاس A4' },
      purchases: { label: 'توريد المعارض والورش', sublabel: 'إضافة التوريدات الجديدة وتقييم المخزون' },
      products: { label: 'دليل القطع والساعات والباركود', sublabel: 'ترقيم القطع وطباعة بطاقات التسعير' },
      inventory: { label: 'جرد الخزينة والمعرض', sublabel: 'تتبع دقيق لكل قطعة ورصيدها' },
      returnsSales: { label: 'مرتجع واستبدال القطع', sublabel: 'تسوية القيم المالية واسترجاع المخزون' },
      accounts: { label: 'النقدية وحسابات العملاء', sublabel: 'تحصيل الدفعات ومطابقة الخزينة والبنك' },
    },
  },
  {
    id: 'stationery-library',
    category: 'retail',
    nameAr: 'مكتبة وأدوات مدرسية وهدايا',
    shortBadgeAr: 'المكتبة والأدوات المدرسية',
    taglineAr: 'واجهة سماوية مشرقة وخفيفة على العين مناسبة للمكتبات والقرطاسية وتغليف الهدايا ومواسم الدراسة',
    heroTitleAr: 'نظام إدارة المكتبات والأدوات المدرسية',
    defaultLayout: 'win11-fluent',
    defaultTheme: 'sky-azure',
    highlights: ['مواسم الدراسة وتوريد الكميات', 'طباعة استيكرات الأسعار والباركود', 'كاشير سهل وسريع للجمهور'],
    moduleLabels: {
      sales: { label: 'كاشير المكتبة والجمهور', sublabel: 'بيع الكتب والأدوات المدرسية والهدايا' },
      purchases: { label: 'توريد المطابع ودور النشر', sublabel: 'إدخال فواتير الكتب والقرطاسية' },
      products: { label: 'فهرس الكتب والأدوات المدرسية', sublabel: 'تحديث أسعار الجملة والتجزئة والباركود' },
      inventory: { label: 'أرصدة المكتبة والمخزن', sublabel: 'جرد الكتب والأدوات ومتابعة النواقص' },
      returnsSales: { label: 'مرتجع واستبدال الكتب والأدوات', sublabel: 'تسوية الفواتير بضغطة واحدة' },
      accounts: { label: 'حسابات المدارس والموردين', sublabel: 'تحصيل التعاقدات وسداد دور النشر' },
    },
  },
  {
    id: 'optics-eyewear',
    category: 'retail',
    nameAr: 'مركز بصريات ونظارات طبية وشمسية',
    shortBadgeAr: 'مركز البصريات والنظارات',
    taglineAr: 'تصميم طبي أبيض وتيل مريح لإدارة النظارات والعدسات والعملاء والدفعات الآجلة',
    heroTitleAr: 'نظام إدارة مراكز البصريات والنظارات',
    defaultLayout: 'modern-sidebar',
    defaultTheme: 'emerald-trade',
    highlights: ['ملفات وكشوف حسابات العملاء', 'متابعة فواتير التجهيز والعربون', 'تكويد الشنابر والعدسات'],
    moduleLabels: {
      sales: { label: 'فاتورة حجز وتسليم النظارات', sublabel: 'تسجيل العربون والباقي وطباعة الإيصال' },
      purchases: { label: 'توريد الشنابر والعدسات والوكلاء', sublabel: 'استلام فواتير شركات البصريات' },
      products: { label: 'دليل الشنابر والعدسات والباركود', sublabel: 'تصنيف الموديلات والماركات وطباعة الليبل' },
      inventory: { label: 'مخزن البصريات والمعرض', sublabel: 'متابعة أرصدة الموديلات والعدسات' },
      returnsSales: { label: 'تعديل ومرتجع الطلبات', sublabel: 'تسوية الفواتير والمرتجعات بمرونة' },
      accounts: { label: 'تحصيل العملاء والشركات', sublabel: 'سندات القبض ومتابعة الأقساط والباقي' },
    },
  },
  {
    id: 'wholesale-distribution',
    category: 'wholesale',
    nameAr: 'تجارة جملة ومخازن توزيع ومناديب',
    shortBadgeAr: 'شركة الجملة والتوزيع',
    taglineAr: 'قائمة جانبية إدارية متكاملة لإدارة كبار التجار والمخازن المتعددة والتحويلات وكشوف الحسابات',
    heroTitleAr: 'نظام إدارة شركات الجملة والمخازن والتوزيع',
    defaultLayout: 'modern-sidebar',
    defaultTheme: 'mina-classic',
    highlights: ['كشوف حسابات العملاء والتجار', 'التحويل بين المخازن والمناديب', 'استيراد فواتير Excel سريع F4'],
    moduleLabels: {
      sales: { label: 'فواتير الجملة والتوزيع', sublabel: 'بيع بالكميات وأسعار الجملة ونصف الجملة' },
      purchases: { label: 'فواتير الشراء من المصانع', sublabel: 'توريد الكميات الكبيرة والمرتجع للمصنع' },
      products: { label: 'كتالوج الجملة والوحدات', sublabel: 'إدارة الكرتونة والقطعة وأسعار المستويات' },
      inventory: { label: 'أرصدة الفروع والمخازن والمناديب', sublabel: 'تحويلات البضاعة والجرد الدوري' },
      returnsSales: { label: 'مرتجع التجار والمناديب', sublabel: 'خصم المرتجع من كشف حساب التاجر' },
      accounts: { label: 'التحصيل وكشوف حسابات التجار', sublabel: 'أعمار الديون وسندات القبض والشيكات' },
    },
  },
  {
    id: 'general-classic',
    category: 'retail',
    nameAr: 'النشاط التجاري العام — Mina Net',
    shortBadgeAr: 'الواجهة القياسية لنظام Mina Net',
    taglineAr: 'الواجهة القياسية لنظام Mina Net لجميع الأنشطة التجارية والمخازن',
    heroTitleAr: 'نظام إدارة المشتريات والمبيعات والمخازن',
    defaultLayout: 'mina-classic',
    defaultTheme: 'mina-classic',
    highlights: ['مناسبة لأي نشاط تجاري عام', 'تصميم عملي واضح', 'اختصارات F1-F6 المعتادة'],
    moduleLabels: {
      sales: { label: 'فاتورة بيع (POS)', sublabel: 'بيع فوري وتحصيل سريع' },
      purchases: { label: 'فاتورة شراء', sublabel: 'توريد بضائع وموردين' },
      products: { label: 'الأصناف والأسعار', sublabel: 'إدارة الكتالوج والباركود' },
      inventory: { label: 'استعلام المخازن والجرد', sublabel: 'أرصدة وتحويلات ونواقص' },
      returnsSales: { label: 'مرتجعات مبيعات', sublabel: 'استرجاع أصناف من عميل' },
      accounts: { label: 'العملاء والمدفوعات', sublabel: 'كشوف حساب وسندات' },
    },
  },
];

export const VALID_MINA_LAYOUT_IDS: MinaLayoutId[] = MINA_LAYOUTS.map((l) => l.id);
export const VALID_MINA_THEME_IDS: MinaThemeId[] = MINA_THEMES.map((t) => t.id);
export const VALID_MINA_INDUSTRY_IDS: MinaIndustryId[] = MINA_INDUSTRIES.map((i) => i.id);

export function sanitizeMinaLayoutId(raw?: string | null): MinaLayoutId {
  const val = String(raw || '').trim() as MinaLayoutId;
  return VALID_MINA_LAYOUT_IDS.includes(val) ? val : 'mina-classic';
}

export function getMinaLayoutById(id?: string | null): MinaLayoutDefinition {
  const clean = sanitizeMinaLayoutId(id);
  return MINA_LAYOUTS.find((l) => l.id === clean) || MINA_LAYOUTS[MINA_LAYOUTS.length - 1];
}

export function sanitizeMinaThemeId(raw?: string | null): MinaThemeId {
  const val = String(raw || '').trim() as MinaThemeId;
  return VALID_MINA_THEME_IDS.includes(val) ? val : 'mina-classic';
}

export function getMinaThemeById(id?: string | null): MinaThemeDefinition {
  const clean = sanitizeMinaThemeId(id);
  return MINA_THEMES.find((t) => t.id === clean) || MINA_THEMES[0];
}

export function sanitizeMinaIndustryId(raw?: string | null): MinaIndustryId {
  const val = String(raw || '').trim() as MinaIndustryId;
  return VALID_MINA_INDUSTRY_IDS.includes(val) ? val : 'general-classic';
}

export function getMinaIndustryById(id?: string | null): MinaIndustryDefinition {
  const clean = sanitizeMinaIndustryId(id);
  return MINA_INDUSTRIES.find((i) => i.id === clean) || MINA_INDUSTRIES[MINA_INDUSTRIES.length - 1];
}
