/**
 * Default consumption rates for first-time buyers.
 * Maps product SKU prefix to estimated daily usage per unit purchased.
 *
 * Example: BAG-100x200-WH ordered qty 100 => daily usage = 100 * 0.03 = 3 bags/day
 * => runs out in ~33 days.
 *
 * For liquids: quantity is in ml (1000, 500, 250).
 * daily_usage_per_unit means "per bottle" daily consumption rate.
 */

export interface ConsumptionDefault {
  /** Units consumed per day for 1 unit of product */
  dailyUsagePerUnit: number;
  /** Human-readable category name in Ukrainian */
  nameUk: string;
}

// SKU-based defaults. Key must match ops_products.sku exactly.
export const CONSUMPTION_DEFAULTS: Record<string, ConsumptionDefault> = {
  // Bags — assume ~3 bags per working day (22 days/month), so for 100-pack: 100 / 22 ≈ 4.5 days per bag
  // daily usage = quantity / estimated_days => for 100 bags, ~33 days => 0.03 per bag per day
  'BAG-150x230-TR': { dailyUsagePerUnit: 0.03, nameUk: 'Пакети 150x230 прозорі' },
  'BAG-100x200-TR': { dailyUsagePerUnit: 0.03, nameUk: 'Пакети 100x200 прозорі' },
  'BAG-100x200-WH': { dailyUsagePerUnit: 0.03, nameUk: 'Пакети 100x200 білі' },
  'BAG-100x200-BR': { dailyUsagePerUnit: 0.03, nameUk: 'Пакети 100x200 коричневі' },
  'BAG-75x150-TR':  { dailyUsagePerUnit: 0.03, nameUk: 'Пакети 75x150 прозорі' },
  'BAG-75x150-WH':  { dailyUsagePerUnit: 0.03, nameUk: 'Пакети 75x150 білі' },
  'BAG-60x100-TR':  { dailyUsagePerUnit: 0.03, nameUk: 'Пакети 60x100 прозорі' },

  // Liquids — daily usage as fraction of one bottle
  'DEL-1000': { dailyUsagePerUnit: 0.0167, nameUk: 'Дельтасепт 1л' },          // 1 bottle per 60 days
  'DEL-500':  { dailyUsagePerUnit: 0.0333, nameUk: 'Дельтасепт 500мл' },       // 1 bottle per 30 days
  'DEL-250':  { dailyUsagePerUnit: 0.0667, nameUk: 'Дельтасепт 250мл' },       // 1 bottle per 15 days
  'DEL-20':   { dailyUsagePerUnit: 0.1, nameUk: 'Дельтасепт 20мл' },           // sample, 10 days
  'BIO-1000': { dailyUsagePerUnit: 0.0167, nameUk: 'Біодез 1л' },
  'BIO-250':  { dailyUsagePerUnit: 0.0667, nameUk: 'Біодез 250мл' },
  'INS-1000': { dailyUsagePerUnit: 0.0167, nameUk: 'Інструсепт 1л' },
  'INS-500':  { dailyUsagePerUnit: 0.0333, nameUk: 'Інструсепт 500мл' },
  'INS-250':  { dailyUsagePerUnit: 0.0667, nameUk: 'Інструсепт 250мл' },
  'SEP-500':  { dailyUsagePerUnit: 0.0333, nameUk: 'Септодез 500мл' },

  // Journal — one per month
  'JRN-30':   { dailyUsagePerUnit: 0.0333, nameUk: 'Журнал обліку стерилізації' },

  // Oil — one per 2 months
  'OIL-30':   { dailyUsagePerUnit: 0.0167, nameUk: 'Масло для автоклава' },

  // Trays — very long-lived
  'TRAY-1L':  { dailyUsagePerUnit: 0.00274, nameUk: 'Лоток 1л' },   // ~1 per year
  'TRAY-3L':  { dailyUsagePerUnit: 0.00274, nameUk: 'Лоток 3л' },
};

/** Maximum messages per customer per week */
export const MAX_MESSAGES_PER_WEEK = 2;

/** Days ahead to check for reorder reminder */
export const REORDER_LOOKAHEAD_DAYS = 14;

/** Minimum days between messages to same customer */
export const MIN_DAYS_BETWEEN_MESSAGES = 3;

/** KeyCRM status IDs */
export const KEYCRM_STATUS_DELIVERED = 8;   // "Відправлено" / delivered
export const KEYCRM_STATUS_COMPLETED = 10;  // "Виконано" / completed

/** Kyiv timezone */
export const KYIV_TZ = 'Europe/Kyiv';

/** Allowed sending window (Kyiv time) */
export const SEND_WINDOW = { startHour: 10, endHour: 12 };
