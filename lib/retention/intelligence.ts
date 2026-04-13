/**
 * Customer Intelligence Pipeline
 *
 * Computes per-customer analytics from KeyCRM order data.
 * Used by the sync-intelligence cron route.
 */

// ============================================================
// KeyCRM Product → Category Mapping
// Based on known product IDs from project_keycrm.md
// ============================================================

const PRODUCT_CATEGORY_MAP: Record<number, string> = {
  // Bags (пакети для стерилізації)
  100: 'bags', 99: 'bags', 90: 'bags', 72: 'bags',
  98: 'bags', 95: 'bags', 97: 'bags',
  // Delanol
  86: 'delanol', 105: 'delanol', 94: 'delanol', 91: 'delanol',
  // Bionol
  102: 'bionol', 101: 'bionol',
  // Instrum
  76: 'instrum', 75: 'instrum', 92: 'instrum',
  // Containers (лотки)
  88: 'containers', 89: 'containers',
  // Septonal
  87: 'septonal',
  // Journal
  74: 'journal',
  // Oil Pro
  84: 'oil_pro',
};

// All known product categories
const ALL_CATEGORIES = ['bags', 'delanol', 'bionol', 'instrum', 'containers', 'septonal', 'journal', 'oil_pro'];

// Consumption rates in days per unit (how long 1 unit lasts)
// For bags: 1 pack (100 pcs) lasts ~30-45 days for average salon
// For chemistry: 1L lasts ~30-60 days depending on usage
const CONSUMPTION_DAYS_PER_UNIT: Record<number, number> = {
  // Bags - 1 pack per 30-45 days (average salon)
  100: 35, 99: 35, 90: 35, 72: 35, 98: 40, 95: 40, 97: 45,
  // Delanol - 1L per 45 days, smaller bottles proportionally
  86: 45, 105: 25, 94: 15, 91: 3,
  // Bionol
  102: 45, 101: 15,
  // Instrum
  76: 60, 75: 35, 92: 20,
  // Containers - lasts very long (reusable)
  88: 365, 89: 365,
  // Septonal
  87: 30,
  // Journal - 30 pages ≈ 30 days
  74: 30,
  // Oil Pro
  84: 60,
};

// ============================================================
// Types
// ============================================================

export interface KeyCRMBuyer {
  id: number;
  full_name: string;
  phone: string[];
  email: string[];
  created_at: string;
  updated_at: string;
  orders_count?: number;
  orders_sum?: number;
  last_order_date?: string;
}

export interface KeyCRMOrderProduct {
  id: number;
  product_id: number;
  product_offer_id?: number;
  sku?: string;
  name: string;
  quantity: number;
  price: number;
  discount?: number;
}

export interface KeyCRMOrder {
  id: number;
  source_id?: number;
  buyer_id: number;
  buyer?: KeyCRMBuyer;
  products: KeyCRMOrderProduct[];
  status_id: number;
  ordered_at: string;
  shipped_at?: string;
  closed_at?: string;
  total_discount: number;
  total_price: number;
  delivery_address?: string;
  shipping_city?: string;
}

export interface CustomerIntelligenceRow {
  phone: string;
  keycrm_buyer_id: number;
  name: string;
  city: string | null;
  segment: string;
  first_order_date: string | null;
  last_order_date: string | null;
  total_orders: number;
  total_spend: number;
  avg_order_value: number;
  avg_order_interval_days: number | null;
  product_categories: string[];
  favorite_products: FavoriteProduct[];
  never_bought_categories: string[];
  products_running_low: ProductRunningLow[];
  next_expected_order_date: string | null;
  percentile_spend: number | null;
  percentile_frequency: number | null;
  is_below_avg_basket: boolean;
  ai_summary: string;
  last_ai_analysis: string;
}

interface FavoriteProduct {
  product_id: number;
  name: string;
  count: number; // how many times ordered
  last_qty: number; // last quantity ordered
}

interface ProductRunningLow {
  product_id: number;
  product_name: string;
  days_until_empty: number;
  last_qty: number;
  last_order_date: string;
}

// ============================================================
// Computation Functions
// ============================================================

/**
 * Determine customer segment based on order history
 */
function computeSegment(
  totalOrders: number,
  totalSpend: number,
  daysSinceLastOrder: number | null,
): string {
  if (daysSinceLastOrder === null) return 'new';

  // Time-based degradation takes priority
  if (daysSinceLastOrder > 180) return 'lost';
  if (daysSinceLastOrder > 90) return 'dormant';

  // At risk: was a good customer but slowing down
  if (daysSinceLastOrder > 45 && (totalOrders >= 3 || totalSpend > 5000)) {
    return 'at_risk';
  }

  // Positive segments
  if (totalOrders >= 6 || totalSpend > 15000) return 'vip';
  if (totalOrders >= 3) return 'regular';
  if (totalOrders >= 2) return 'returning';
  return 'new';
}

/**
 * Compute average interval between orders in days
 */
function computeAvgInterval(orderDates: Date[]): number | null {
  if (orderDates.length < 2) return null;

  const sorted = [...orderDates].sort((a, b) => a.getTime() - b.getTime());
  let totalDays = 0;

  for (let i = 1; i < sorted.length; i++) {
    totalDays += Math.round(
      (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return Math.round(totalDays / (sorted.length - 1));
}

/**
 * Determine which product categories were purchased
 */
function computeProductCategories(orders: KeyCRMOrder[]): string[] {
  const categories = new Set<string>();

  for (const order of orders) {
    for (const product of order.products || []) {
      const cat = PRODUCT_CATEGORY_MAP[product.product_id];
      if (cat) categories.add(cat);
    }
  }

  return Array.from(categories);
}

/**
 * Get top 3 most ordered products
 */
function computeFavoriteProducts(orders: KeyCRMOrder[]): FavoriteProduct[] {
  const productStats: Record<number, { name: string; count: number; last_qty: number }> = {};

  for (const order of orders) {
    for (const product of order.products || []) {
      if (!productStats[product.product_id]) {
        productStats[product.product_id] = { name: product.name, count: 0, last_qty: 0 };
      }
      productStats[product.product_id].count += 1;
      productStats[product.product_id].last_qty = product.quantity;
      productStats[product.product_id].name = product.name; // keep latest name
    }
  }

  return Object.entries(productStats)
    .map(([id, stats]) => ({
      product_id: Number(id),
      name: stats.name,
      count: stats.count,
      last_qty: stats.last_qty,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

/**
 * Compute which products are running low based on consumption rates
 */
function computeProductsRunningLow(orders: KeyCRMOrder[]): ProductRunningLow[] {
  const now = new Date();
  const results: ProductRunningLow[] = [];

  // Get the latest order for each product
  const latestProductOrder: Record<number, { qty: number; date: Date; name: string }> = {};

  // Sort orders oldest first so latest overwrites
  const sorted = [...orders].sort(
    (a, b) => new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime()
  );

  for (const order of sorted) {
    for (const product of order.products || []) {
      const rate = CONSUMPTION_DAYS_PER_UNIT[product.product_id];
      if (!rate) continue; // skip unknown products (sterilizers, etc.)

      latestProductOrder[product.product_id] = {
        qty: product.quantity,
        date: new Date(order.ordered_at),
        name: product.name,
      };
    }
  }

  for (const [productIdStr, info] of Object.entries(latestProductOrder)) {
    const productId = Number(productIdStr);
    const rate = CONSUMPTION_DAYS_PER_UNIT[productId];
    if (!rate) continue;

    const totalDaysSupply = info.qty * rate;
    const daysSincePurchase = Math.round(
      (now.getTime() - info.date.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysUntilEmpty = totalDaysSupply - daysSincePurchase;

    // Only flag if running low (< 14 days) or already empty
    if (daysUntilEmpty < 14) {
      results.push({
        product_id: productId,
        product_name: info.name,
        days_until_empty: Math.max(daysUntilEmpty, 0),
        last_qty: info.qty,
        last_order_date: info.date.toISOString().split('T')[0],
      });
    }
  }

  return results.sort((a, b) => a.days_until_empty - b.days_until_empty);
}

/**
 * Compute next expected order date based on average interval
 */
function computeNextExpectedOrderDate(
  lastOrderDate: Date | null,
  avgIntervalDays: number | null,
): string | null {
  if (!lastOrderDate || !avgIntervalDays) return null;

  const next = new Date(lastOrderDate);
  next.setDate(next.getDate() + avgIntervalDays);
  return next.toISOString().split('T')[0];
}

/**
 * Extract city from orders (most recent delivery address)
 */
function extractCity(orders: KeyCRMOrder[]): string | null {
  // Go through orders newest-first looking for a city
  const sorted = [...orders].sort(
    (a, b) => new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime()
  );

  for (const order of sorted) {
    if (order.shipping_city) return order.shipping_city;
    // Try to extract city from delivery_address (common format: "City, Street...")
    if (order.delivery_address) {
      const parts = order.delivery_address.split(',');
      if (parts.length > 0) return parts[0].trim();
    }
  }

  return null;
}

/**
 * Generate a 2-sentence AI summary in Ukrainian
 */
function generateAiSummary(
  name: string,
  segment: string,
  totalOrders: number,
  totalSpend: number,
  avgOrderValue: number,
  productCategories: string[],
  daysSinceLastOrder: number | null,
  productsRunningLow: ProductRunningLow[],
  neverBoughtCategories: string[],
): string {
  const segmentLabels: Record<string, string> = {
    new: 'новий клієнт',
    returning: 'повертається',
    regular: 'постійний клієнт',
    vip: 'VIP клієнт',
    at_risk: 'ризик втрати',
    dormant: 'сплячий',
    lost: 'втрачений',
  };

  const catLabels: Record<string, string> = {
    bags: 'пакети',
    delanol: 'Деланол',
    bionol: 'Біонол',
    instrum: 'Інструм',
    containers: 'лотки',
    septonal: 'Септональ',
    journal: 'журнал',
    oil_pro: 'Oil Pro',
  };

  const segLabel = segmentLabels[segment] || segment;
  const cats = productCategories.map(c => catLabels[c] || c).join(', ');
  const daysText = daysSinceLastOrder !== null ? `${daysSinceLastOrder} днів тому` : 'невідомо';

  let line1 = `${name} — ${segLabel}, ${totalOrders} замовлень на ${Math.round(totalSpend)} грн (сер. чек ${Math.round(avgOrderValue)} грн), останнє ${daysText}. Купує: ${cats || 'невідомо'}.`;

  let line2 = '';
  if (productsRunningLow.length > 0) {
    const lowProducts = productsRunningLow.slice(0, 2).map(p =>
      p.days_until_empty <= 0
        ? `${p.product_name} (закінчився)`
        : `${p.product_name} (≈${p.days_until_empty}д)`
    );
    line2 = `Закінчується: ${lowProducts.join(', ')}.`;
  }
  if (neverBoughtCategories.length > 0 && neverBoughtCategories.length <= 4) {
    const neverCats = neverBoughtCategories.map(c => catLabels[c] || c).join(', ');
    line2 += ` Ніколи не купував: ${neverCats}.`;
  }

  return `${line1}${line2 ? ' ' + line2 : ''}`;
}

// ============================================================
// Main: Process a single customer
// ============================================================

export function computeCustomerIntelligence(
  buyer: KeyCRMBuyer,
  orders: KeyCRMOrder[],
): Omit<CustomerIntelligenceRow, 'percentile_spend' | 'percentile_frequency' | 'is_below_avg_basket'> {
  // Normalize phone — take first phone, strip non-digits
  const phone = normalizePhone(buyer.phone?.[0] || '');

  // Filter only completed/shipped orders (skip cancelled)
  // KeyCRM statuses: typically 1=new, 2=processing, 3=shipped, 4=delivered, 5=cancelled
  const validOrders = orders.filter(o => o.status_id !== 5 && o.status_id !== 7);

  const orderDates = validOrders
    .map(o => new Date(o.ordered_at))
    .filter(d => !isNaN(d.getTime()));

  const totalOrders = validOrders.length;
  const totalSpend = validOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
  const avgOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0;

  const sortedDates = [...orderDates].sort((a, b) => a.getTime() - b.getTime());
  const firstOrderDate = sortedDates[0] || null;
  const lastOrderDate = sortedDates[sortedDates.length - 1] || null;

  const daysSinceLastOrder = lastOrderDate
    ? Math.round((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const avgIntervalDays = computeAvgInterval(orderDates);
  const segment = computeSegment(totalOrders, totalSpend, daysSinceLastOrder);
  const productCategories = computeProductCategories(validOrders);
  const favoriteProducts = computeFavoriteProducts(validOrders);
  const neverBoughtCategories = ALL_CATEGORIES.filter(c => !productCategories.includes(c));
  const productsRunningLow = computeProductsRunningLow(validOrders);
  const nextExpectedOrderDate = computeNextExpectedOrderDate(lastOrderDate, avgIntervalDays);
  const city = extractCity(validOrders);

  const aiSummary = generateAiSummary(
    buyer.full_name || 'Невідомий',
    segment,
    totalOrders,
    totalSpend,
    avgOrderValue,
    productCategories,
    daysSinceLastOrder,
    productsRunningLow,
    neverBoughtCategories,
  );

  return {
    phone,
    keycrm_buyer_id: buyer.id,
    name: buyer.full_name || 'Невідомий',
    city,
    segment,
    first_order_date: firstOrderDate?.toISOString().split('T')[0] || null,
    last_order_date: lastOrderDate?.toISOString().split('T')[0] || null,
    total_orders: totalOrders,
    total_spend: totalSpend,
    avg_order_value: Math.round(avgOrderValue * 100) / 100,
    avg_order_interval_days: avgIntervalDays,
    product_categories: productCategories,
    favorite_products: favoriteProducts,
    never_bought_categories: neverBoughtCategories,
    products_running_low: productsRunningLow,
    next_expected_order_date: nextExpectedOrderDate,
    ai_summary: aiSummary,
    last_ai_analysis: new Date().toISOString(),
  };
}

// ============================================================
// Compute global benchmarks from all customer data
// ============================================================

export function computeBenchmarks(
  allCustomers: CustomerIntelligenceRow[],
): Record<string, unknown> {
  const withOrders = allCustomers.filter(c => c.total_orders > 0);

  // Average order value
  const avgOrderValueAll = withOrders.length > 0
    ? withOrders.reduce((s, c) => s + c.avg_order_value, 0) / withOrders.length
    : 0;

  // Average interval
  const withInterval = withOrders.filter(c => c.avg_order_interval_days !== null);
  const avgIntervalAll = withInterval.length > 0
    ? withInterval.reduce((s, c) => s + (c.avg_order_interval_days || 0), 0) / withInterval.length
    : 0;

  // Product adoption rates
  const adoptionCounts: Record<string, number> = {};
  for (const cat of ALL_CATEGORIES) {
    adoptionCounts[cat] = withOrders.filter(c => c.product_categories.includes(cat)).length;
  }
  const productAdoptionRates: Record<string, number> = {};
  for (const cat of ALL_CATEGORIES) {
    productAdoptionRates[cat] = withOrders.length > 0
      ? Math.round((adoptionCounts[cat] / withOrders.length) * 100)
      : 0;
  }

  // Segment distribution
  const segmentDistribution: Record<string, number> = {};
  for (const c of allCustomers) {
    segmentDistribution[c.segment] = (segmentDistribution[c.segment] || 0) + 1;
  }

  // Average basket by segment
  const avgBasketBySegment: Record<string, number> = {};
  for (const seg of Object.keys(segmentDistribution)) {
    const segCustomers = withOrders.filter(c => c.segment === seg);
    avgBasketBySegment[seg] = segCustomers.length > 0
      ? Math.round(segCustomers.reduce((s, c) => s + c.avg_order_value, 0) / segCustomers.length)
      : 0;
  }

  // Cross-sell success rates: of people who buy category A, what % also buy B?
  const crossSellPairs = [
    ['bags', 'delanol'],
    ['bags', 'bionol'],
    ['bags', 'instrum'],
    ['delanol', 'instrum'],
    ['delanol', 'bionol'],
    ['bags', 'septonal'],
    ['bags', 'journal'],
  ];
  const crossSellRates: Record<string, number> = {};
  for (const [a, b] of crossSellPairs) {
    const buyersA = withOrders.filter(c => c.product_categories.includes(a));
    const alsoB = buyersA.filter(c => c.product_categories.includes(b));
    crossSellRates[`${a}_to_${b}`] = buyersA.length > 0
      ? Math.round((alsoB.length / buyersA.length) * 100)
      : 0;
  }

  // Percentile computation helpers
  const spendsSorted = [...withOrders].sort((a, b) => a.total_spend - b.total_spend);
  const intervalsSorted = [...withInterval].sort(
    (a, b) => (b.avg_order_interval_days || 0) - (a.avg_order_interval_days || 0)
  );

  // Assign percentiles
  const spendPercentiles: Record<string, number> = {};
  spendsSorted.forEach((c, i) => {
    spendPercentiles[c.phone] = Math.round((i / spendsSorted.length) * 100 * 100) / 100;
  });

  const freqPercentiles: Record<string, number> = {};
  intervalsSorted.forEach((c, i) => {
    // Lower interval = more frequent = higher percentile
    freqPercentiles[c.phone] = Math.round((i / intervalsSorted.length) * 100 * 100) / 100;
  });

  return {
    avg_order_value_all: Math.round(avgOrderValueAll),
    avg_interval_all: Math.round(avgIntervalAll),
    product_adoption_rates: productAdoptionRates,
    segment_distribution: segmentDistribution,
    avg_basket_by_segment: avgBasketBySegment,
    cross_sell_success_rates: crossSellRates,
    total_customers: allCustomers.length,
    total_revenue: Math.round(withOrders.reduce((s, c) => s + c.total_spend, 0)),
    // These are passed internally, not stored in benchmarks table
    _spendPercentiles: spendPercentiles,
    _freqPercentiles: freqPercentiles,
    _avgOrderValueAll: avgOrderValueAll,
  };
}

// ============================================================
// Phone normalization
// ============================================================

export function normalizePhone(raw: string): string {
  if (!raw) return '';
  // Strip everything except digits and leading +
  let digits = raw.replace(/[^\d+]/g, '');
  // Normalize Ukrainian phones
  if (digits.startsWith('+380')) return digits;
  if (digits.startsWith('380') && digits.length === 12) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10) return '+38' + digits;
  if (digits.startsWith('80') && digits.length === 11) return '+3' + digits;
  return digits; // return as-is for non-UA numbers
}
