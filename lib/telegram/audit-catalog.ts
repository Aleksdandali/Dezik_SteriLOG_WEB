// Product catalog for inventory audits — single source of truth for web.
// MUST stay byte-for-byte in sync with mobile/lib/audit-catalog.ts (mirror
// copy for the standalone Expo project, which can't reach into this folder).
// Any change here MUST be mirrored over there, and vice-versa.

import type { OpsLocation } from './types';

export type AuditProduct = {
  id: string;
  name: string;
  group: string;
  unit: string;
  color?: string;
};

// Bags — exact SKUs from dezik.com.ua order form.
export const BAG_PRODUCTS: AuditProduct[] = [
  { id: 'bag_150x230_tr', name: '150×230 Прозорі',  group: 'Пакети 150×230', unit: 'уп', color: '#3B82F6' },
  { id: 'bag_100x200_tr', name: '100×200 Прозорі',  group: 'Пакети 100×200', unit: 'уп', color: '#3B82F6' },
  { id: 'bag_100x200_wh', name: '100×200 Білі',     group: 'Пакети 100×200', unit: 'уп', color: '#9CA3AF' },
  { id: 'bag_100x200_br', name: '100×200 Коричневі', group: 'Пакети 100×200', unit: 'уп', color: '#92400E' },
  { id: 'bag_75x150_tr',  name: '75×150 Прозорі',   group: 'Пакети 75×150',  unit: 'уп', color: '#3B82F6' },
  { id: 'bag_75x150_wh',  name: '75×150 Білі',      group: 'Пакети 75×150',  unit: 'уп', color: '#9CA3AF' },
  { id: 'bag_60x100_tr',  name: '60×100 Прозорі',   group: 'Пакети 60×100',  unit: 'уп', color: '#3B82F6' },
];

// Raw materials (Маліновського + Дальницька).
export const RAW_MATERIALS: AuditProduct[] = [
  { id: 'raw_paper_white', name: 'Папір білий крафт 70г/м²',     group: 'Папір',           unit: 'кг' },
  { id: 'raw_paper_brown', name: 'Папір коричневий крафт 70г/м²', group: 'Папір',           unit: 'кг' },
  { id: 'raw_film',        name: 'Плівка ПЕТ',                    group: 'Плівка та клей',  unit: 'кг' },
  { id: 'raw_glue',        name: 'Клей',                          group: 'Плівка та клей',  unit: 'кг' },
  { id: 'raw_paint',       name: 'Фарба для друку',               group: 'Витратники',      unit: 'л'  },
  { id: 'raw_tape',        name: 'Двосторонній скотч',            group: 'Витратники',      unit: 'м'  },
];

// Other products (Афіна warehouse).
export const OTHER_PRODUCTS: AuditProduct[] = [
  { id: 'delanol_1000',  name: 'Деланол 1л',                       group: 'Хімічна дезинфекція',     unit: 'шт' },
  { id: 'delanol_500',   name: 'Деланол 0.5л',                     group: 'Хімічна дезинфекція',     unit: 'шт' },
  { id: 'delanol_250',   name: 'Деланол 250мл',                    group: 'Хімічна дезинфекція',     unit: 'шт' },
  { id: 'delanol_20',    name: 'Деланол 20мл',                     group: 'Хімічна дезинфекція',     unit: 'шт' },
  { id: 'bionol_1000',   name: 'Біонол 1л',                        group: 'Хімічна дезинфекція',     unit: 'шт' },
  { id: 'bionol_250',    name: 'Біонол 250мл',                     group: 'Хімічна дезинфекція',     unit: 'шт' },
  { id: 'instrum_1000',  name: 'Інструм 1л',                       group: 'Очистка інструментів',    unit: 'шт' },
  { id: 'instrum_500',   name: 'Інструм 500мл',                    group: 'Очистка інструментів',    unit: 'шт' },
  { id: 'instrum_250',   name: 'Інструм 250мл',                    group: 'Очистка інструментів',    unit: 'шт' },
  { id: 'septonal_500',  name: 'Септональ 500мл',                  group: 'Контроль та антисептики', unit: 'шт' },
  { id: 'journal_steri', name: 'Журнал стерилізації (30 стор.)',   group: 'Контроль та антисептики', unit: 'шт' },
  { id: 'oil_pro_30',    name: 'Oil Pro 30мл',                     group: 'Контроль та антисептики', unit: 'шт' },
  { id: 'tray_1l',       name: 'Лоток 1л',                         group: 'Лотки',                   unit: 'шт' },
  { id: 'tray_3l',       name: 'Лоток 3л',                         group: 'Лотки',                   unit: 'шт' },
];

export type AuditItemType = 'raw' | 'finished';

// Match the bot: finished @ afina_sklad = bags + other; finished elsewhere =
// bags; raw anywhere = RAW_MATERIALS.
export function getAuditProducts(
  itemType: AuditItemType,
  location: OpsLocation,
): AuditProduct[] {
  if (itemType === 'raw') return RAW_MATERIALS;
  return location === 'afina_sklad'
    ? [...BAG_PRODUCTS, ...OTHER_PRODUCTS]
    : BAG_PRODUCTS;
}
