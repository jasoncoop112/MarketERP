import { pinyin } from 'pinyin-pro';

// Memory cache to avoid repeated pinyin generation during search filtering
const pinyinCache = new Map<string, { initials: string; full: string }>();

/**
 * Generates pinyin initials for a given string.
 */
export function getPinyinInitials(text: any): string {
  if (typeof text !== 'string' || !text.trim()) return '';
  const trimmed = text.trim();
  
  if (pinyinCache.has(trimmed)) {
    const cached = pinyinCache.get(trimmed)!;
    if (cached.initials) return cached.initials;
  }

  try {
    const initials = pinyin(trimmed, {
      pattern: 'initial',
      toneType: 'none',
      nonZh: 'consecutive'
    }).replace(/\s/g, '').toLowerCase();
    
    const existing = pinyinCache.get(trimmed) || { initials: '', full: '' };
    pinyinCache.set(trimmed, { ...existing, initials });
    
    return initials;
  } catch (e) {
    console.error('Pinyin generation error:', e);
    return '';
  }
}

/**
 * Generates full pinyin (without tones) for a given string.
 */
export function getFullPinyin(text: any): string {
  if (typeof text !== 'string' || !text.trim()) return '';
  const trimmed = text.trim();

  if (pinyinCache.has(trimmed)) {
    const cached = pinyinCache.get(trimmed)!;
    if (cached.full) return cached.full;
  }

  try {
    const full = pinyin(trimmed, {
      toneType: 'none',
      nonZh: 'consecutive'
    }).replace(/\s/g, '').toLowerCase();
    
    const existing = pinyinCache.get(trimmed) || { initials: '', full: '' };
    pinyinCache.set(trimmed, { ...existing, full });
    
    return full;
  } catch (e) {
    return '';
  }
}

/**
 * Checks if a search term matches a product.
 * Robustly handles missing fields and whitespace.
 */
export function matchProduct(product: { name?: string; code?: string; pinyin?: string }, term: string): boolean {
  if (!term || !term.trim()) return true;
  const lowercaseTerm = term.toLowerCase().trim();
  
  const name = product.name || '';
  const code = product.code || '';
  
  // 1. Name match
  if (name.toLowerCase().includes(lowercaseTerm)) return true;
  
  // 2. Code match
  if (code && code.toLowerCase().includes(lowercaseTerm)) return true;
  
  // 3. Pinyin Initials match
  const initials = product.pinyin || getPinyinInitials(name);
  if (initials && initials.includes(lowercaseTerm)) return true;

  // 4. Full Pinyin match
  const full = getFullPinyin(name);
  if (full && full.includes(lowercaseTerm)) return true;
  
  return false;
}
