const BASE_URL = 'https://openapi.keycrm.app/v1';

function getKey(): string {
  const key = process.env.KEYCRM_API_KEY;
  if (!key) throw new Error('KEYCRM_API_KEY not set');
  return key;
}

export async function keycrmFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        'Authorization': `Bearer ${getKey()}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KeyCRM ${res.status}: ${text.substring(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function keycrmPut<T = unknown>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getKey()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KeyCRM PUT ${res.status}: ${text.substring(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export interface KeyCRMProduct {
  id: number;
  name: string;
  quantity: number;
  in_reserve: number;
  min_price: number;
  max_price: number;
  is_archived: boolean;
  thumbnail_url: string | null;
  has_offers: boolean;
  currency_code: string;
}

// Simple in-memory cache (5 min TTL)
let cachedProducts: KeyCRMProduct[] | null = null;
let cacheExpiry = 0;

export async function fetchAllProducts(): Promise<KeyCRMProduct[]> {
  if (cachedProducts && Date.now() < cacheExpiry) return cachedProducts;

  const all: KeyCRMProduct[] = [];
  let page = 1;
  while (page <= 5) { // safety limit
    const data = await keycrmFetch<{ data: KeyCRMProduct[]; last_page: number }>(`/products?limit=50&page=${page}`);
    all.push(...data.data);
    if (page >= data.last_page) break;
    page++;
  }

  cachedProducts = all;
  cacheExpiry = Date.now() + 5 * 60 * 1000;
  return all;
}

/** Safe version — returns empty array on failure */
export async function fetchAllProductsSafe(): Promise<KeyCRMProduct[]> {
  try {
    return await fetchAllProducts();
  } catch (e) {
    console.error('[KeyCRM] Failed to fetch:', e);
    return [];
  }
}

/** Get offer stock from /offers/stocks */
export async function getOfferStock(offerId: number): Promise<number> {
  const data = await keycrmFetch<{ data: { id: number; quantity: number }[] }>(
    `/offers/stocks?filter[offers_id]=${offerId}`
  );
  return data.data?.[0]?.quantity ?? 0;
}

/** Update stock via PUT /offers/stocks (the ONLY way to change quantity in KeyCRM) */
export async function updateOfferStock(offerId: number, quantity: number): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BASE_URL}/offers/stocks`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getKey()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        warehouse_id: 1,
        stocks: [{ id: offerId, quantity }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KeyCRM PUT stocks ${res.status}: ${text.substring(0, 200)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** Add delta to offer stock (get current + add) */
export async function addToOfferStock(offerId: number, delta: number): Promise<{ before: number; after: number }> {
  const before = await getOfferStock(offerId);
  const after = before + delta;
  await updateOfferStock(offerId, after);
  cachedProducts = null;
  return { before, after };
}
