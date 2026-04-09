/**
 * Consumption defaults for Dezik products.
 * Based on real data from owner (2026-04-08).
 * dailyUsagePerUnit = 1 / days_until_empty
 */

export interface ConsumptionDefault {
  dailyUsagePerUnit: number;
  daysPerUnit: number;
  nameUk: string;
  isConsumable: boolean;
}

export const CONSUMPTION_DEFAULTS: Record<string, ConsumptionDefault> = {
  // Пакети — всі розміри: 1 упаковка на 21 день
  'BAG-150x230-TR': { dailyUsagePerUnit: 1/21, daysPerUnit: 21, nameUk: 'Пакети 150×230 прозорі', isConsumable: true },
  'BAG-100x200-TR': { dailyUsagePerUnit: 1/21, daysPerUnit: 21, nameUk: 'Пакети 100×200 прозорі', isConsumable: true },
  'BAG-100x200-WH': { dailyUsagePerUnit: 1/21, daysPerUnit: 21, nameUk: 'Пакети 100×200 білі', isConsumable: true },
  'BAG-100x200-BR': { dailyUsagePerUnit: 1/21, daysPerUnit: 21, nameUk: 'Пакети 100×200 коричневі', isConsumable: true },
  'BAG-75x150-TR':  { dailyUsagePerUnit: 1/21, daysPerUnit: 21, nameUk: 'Пакети 75×150 прозорі', isConsumable: true },
  'BAG-75x150-WH':  { dailyUsagePerUnit: 1/21, daysPerUnit: 21, nameUk: 'Пакети 75×150 білі', isConsumable: true },
  'BAG-60x100-TR':  { dailyUsagePerUnit: 1/21, daysPerUnit: 21, nameUk: 'Пакети 60×100 прозорі', isConsumable: true },

  // Деланол — дезінфекція + ПСО інструментів
  'DEL-20':   { dailyUsagePerUnit: 1/21,  daysPerUnit: 21,  nameUk: 'Деланол 20мл', isConsumable: true },
  'DEL-250':  { dailyUsagePerUnit: 1/45,  daysPerUnit: 45,  nameUk: 'Деланол 250мл', isConsumable: true },
  'DEL-500':  { dailyUsagePerUnit: 1/75,  daysPerUnit: 75,  nameUk: 'Деланол 0.5л', isConsumable: true },
  'DEL-1000': { dailyUsagePerUnit: 1/105, daysPerUnit: 105, nameUk: 'Деланол 1л', isConsumable: true },

  // Біонол — дезінфекція інструментів (аналогічно Деланолу)
  'BIO-250':  { dailyUsagePerUnit: 1/45,  daysPerUnit: 45,  nameUk: 'Біонол 250мл', isConsumable: true },
  'BIO-500':  { dailyUsagePerUnit: 1/75,  daysPerUnit: 75,  nameUk: 'Біонол 500мл', isConsumable: true },
  'BIO-1000': { dailyUsagePerUnit: 1/105, daysPerUnit: 105, nameUk: 'Біонол 1л', isConsumable: true },

  // Інструм — очищення від нальоту після стерилізації
  'INS-250':  { dailyUsagePerUnit: 1/60,  daysPerUnit: 60,  nameUk: 'Інструм 250мл', isConsumable: true },
  'INS-500':  { dailyUsagePerUnit: 1/120, daysPerUnit: 120, nameUk: 'Інструм 500мл', isConsumable: true },
  'INS-1000': { dailyUsagePerUnit: 1/240, daysPerUnit: 240, nameUk: 'Інструм 1л', isConsumable: true },

  // Септональ — антисептик для рук, використовується перед/після кожного клієнта
  'SEP-500':  { dailyUsagePerUnit: 1/45, daysPerUnit: 45, nameUk: 'Септональ 500мл', isConsumable: true },

  // Журнал стерилізації — 30 сторінок, ~20 записів/день у зайнятому салоні
  'JRN-30':   { dailyUsagePerUnit: 1/45, daysPerUnit: 45, nameUk: 'Журнал стерилізації', isConsumable: true },

  // Oil Pro — мастило для інструментів, мікродози, дуже повільне споживання
  'OIL-30':   { dailyUsagePerUnit: 1/180, daysPerUnit: 180, nameUk: 'Oil Pro 30мл', isConsumable: true },

  // Контейнери — НЕ витратник, заміна тільки при пошкодженні
  'CONT-1L':  { dailyUsagePerUnit: 0, daysPerUnit: 0, nameUk: 'Контейнер 1л', isConsumable: false },
  'CONT-3L':  { dailyUsagePerUnit: 0, daysPerUnit: 0, nameUk: 'Контейнер 3л', isConsumable: false },

  // Лотки — НЕ витратник
  'TRAY-1L':  { dailyUsagePerUnit: 0, daysPerUnit: 0, nameUk: 'Лоток 1л', isConsumable: false },
  'TRAY-3L':  { dailyUsagePerUnit: 0, daysPerUnit: 0, nameUk: 'Лоток 3л', isConsumable: false },
};

/** Maximum messages per customer per week */
export const MAX_MESSAGES_PER_WEEK = 2;

/** Days ahead to check for reorder reminder */
export const REORDER_LOOKAHEAD_DAYS = 14;

/** Minimum days between messages to same customer */
export const MIN_DAYS_BETWEEN_MESSAGES = 3;

/** KeyCRM status IDs */
export const KEYCRM_STATUS_DELIVERED = 8;
export const KEYCRM_STATUS_COMPLETED = 10;

/** Kyiv timezone */
export const KYIV_TZ = 'Europe/Kyiv';

/** Allowed sending window (Kyiv time) */
export const SEND_WINDOW = { startHour: 10, endHour: 12 };
