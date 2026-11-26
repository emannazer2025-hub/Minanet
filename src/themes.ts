import {
  MINA_INDUSTRIES,
  MINA_LAYOUTS,
  MINA_THEMES,
  getMinaIndustryById,
  getMinaLayoutById,
  getMinaThemeById,
  sanitizeMinaIndustryId,
  sanitizeMinaLayoutId,
  sanitizeMinaThemeId,
  type MinaIndustryCategory,
  type MinaIndustryDefinition,
  type MinaIndustryId,
  type MinaLayoutDefinition,
  type MinaLayoutId,
  type MinaThemeDefinition,
  type MinaThemeId,
} from '../shared/themes.ts';

export {
  MINA_INDUSTRIES,
  MINA_LAYOUTS,
  MINA_THEMES,
  getMinaIndustryById,
  getMinaLayoutById,
  getMinaThemeById,
  sanitizeMinaIndustryId,
  sanitizeMinaLayoutId,
  sanitizeMinaThemeId,
};
export type {
  MinaIndustryCategory,
  MinaIndustryDefinition,
  MinaIndustryId,
  MinaLayoutDefinition,
  MinaLayoutId,
  MinaThemeDefinition,
  MinaThemeId,
};

const THEME_STORAGE_KEY = 'mina_net_theme';
const THEME_BAKED_KEY = 'mina_net_theme_baked';
const LAYOUT_STORAGE_KEY = 'mina_net_layout';
const LAYOUT_BAKED_KEY = 'mina_net_layout_baked';
const INDUSTRY_STORAGE_KEY = 'mina_net_industry';
const INDUSTRY_BAKED_KEY = 'mina_net_industry_baked';
const STYLE_CHANGE_EVENT = 'mina-style-changed';

export function isClientDesktopPackage(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  return (
    document.documentElement.hasAttribute('data-mina-client-pkg') ||
    import.meta.env.VITE_DIRECT_STANDALONE === 'true' ||
    window.location.protocol === 'file:'
  );
}

export function getInitialThemeId(): MinaThemeId {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.removeItem(THEME_BAKED_KEY);
  } catch {
    // ignore storage errors
  }
  return 'mina-classic';
}

export function getInitialLayoutId(): MinaLayoutId {
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    localStorage.removeItem(LAYOUT_BAKED_KEY);
  } catch {
    // ignore storage errors
  }
  return 'mina-classic';
}

export function getInitialIndustryId(): MinaIndustryId {
  try {
    localStorage.removeItem(INDUSTRY_STORAGE_KEY);
    localStorage.removeItem(INDUSTRY_BAKED_KEY);
  } catch {
    // ignore storage errors
  }
  return 'general-classic';
}

export function getCurrentThemeId(): MinaThemeId {
  return 'mina-classic';
}

export function getCurrentLayoutId(): MinaLayoutId {
  return 'mina-classic';
}

export function getCurrentIndustryId(): MinaIndustryId {
  return 'general-classic';
}

export function applyMinaTheme(_id: string | MinaThemeId, _persist = true): MinaThemeId {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-mina-theme', 'mina-classic');
  }
  return 'mina-classic';
}

export function applyMinaLayout(_id: string | MinaLayoutId, _persist = true): MinaLayoutId {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-mina-layout', 'mina-classic');
  }
  return 'mina-classic';
}

export function applyMinaIndustry(_id: string | MinaIndustryId, _persist = true): MinaIndustryId {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-mina-industry', 'general-classic');
  }
  return 'general-classic';
}

export function subscribeMinaStyleChange(
  _cb: (state: { layout: MinaLayoutId; theme: MinaThemeId; industry: MinaIndustryId }) => void
): () => void {
  void STYLE_CHANGE_EVENT;
  return () => {};
}
