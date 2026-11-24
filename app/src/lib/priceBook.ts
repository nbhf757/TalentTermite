// Price book with offline fallback, in order of preference:
// 1. live from Supabase (signed in + online), saved to the device cache
// 2. the device cache from the last successful load
// Prices are never bundled into the public app code: a device needs one online sign-in to get them.
import type { PriceItem } from './pricing';
import { supabase } from './supabase';

export type BookItem = PriceItem & {
  recurring_price: number | null;
  recurring_interval: 'month' | 'quarter' | 'year' | 'service' | null;
  description: string | null;
  rep_notes: string | null;
  sort_order: number;
};
export type BookSource = 'live' | 'cache' | 'none';
export type PriceBook = { items: BookItem[]; source: BookSource; loadedAt: string | null };

const CACHE_KEY = 'talent.priceBook.v1';

export const emptyBook = (): PriceBook => ({ items: [], source: 'none', loadedAt: null });

function readCache(): PriceBook | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { items: BookItem[]; loadedAt: string };
    return c.items?.length ? { items: c.items, source: 'cache', loadedAt: c.loadedAt } : null;
  } catch { return null; }
}

export async function loadPriceBook(): Promise<PriceBook> {
  if (supabase && navigator.onLine) {
    const { data, error } = await supabase.from('price_items')
      .select('id,section,name,unit,qty_source,waste_factor,unit_price,min_price,initial_price,recurring_price,recurring_interval,description,rep_notes,sort_order')
      .eq('active', true).order('sort_order');
    if (!error && data?.length) {
      const items = data.map(d => ({
        ...d, waste_factor: Number(d.waste_factor ?? 1), unit_price: Number(d.unit_price),
        min_price: d.min_price == null ? null : Number(d.min_price),
        initial_price: d.initial_price == null ? null : Number(d.initial_price),
        recurring_price: d.recurring_price == null ? null : Number(d.recurring_price),
      })) as BookItem[];
      const loadedAt = new Date().toISOString();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items, loadedAt })); } catch { /* storage full or blocked */ }
      return { items, source: 'live', loadedAt };
    }
  }
  return readCache() ?? emptyBook();
}
