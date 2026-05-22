// Shared, locale-aware formatters used across screens. Keeping one source of
// truth avoids drift like "100 ₴" vs "100 грн" vs "100.00 UAH".

/** Format a UAH number with non-breaking space + ₴ symbol. */
export function fmtUAH(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '— ₴';
  return `${Math.round(n).toLocaleString('uk-UA')}\u00A0₴`;
}

/** Format integer count with Ukrainian thousands separator. */
export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('uk-UA');
}

/** Ukrainian plural helper: 1 замовлення / 2-4 замовлення / 5+ замовлень. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
