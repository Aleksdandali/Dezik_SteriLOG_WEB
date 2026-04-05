import { NextResponse } from 'next/server';
import { fetchAllProductsSafe, type KeyCRMProduct } from '@/lib/keycrm';

function categorize(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('пакет') || lower.includes('sterilization pouch')) return 'Пакети для стерилізації';
  if (lower.includes('деланол') || lower.includes('delanol') || lower.includes('біонол') || lower.includes('bionol')) return 'Дезінфекція та стерилізація';
  if (lower.includes('інструм') || lower.includes('instrum') || lower.includes('масло') || lower.includes('oil') || lower.includes('антисептик') || lower.includes('септональ') || lower.includes('clean bra')) return 'Догляд та очистка';
  if (lower.includes('контейнер') || lower.includes('лоток')) return 'Контейнери';
  if (lower.includes('журнал')) return 'Аксесуари';
  if (lower.includes('бокс') || lower.includes('box')) return 'Набори';
  return 'Інше';
}

export async function GET() {
  try {
    const all = await fetchAllProductsSafe();
    const skip = ['стерилизатор','стерилізатор','микростоп','мікростоп','мизма','мізма','автоклав','сухожар','ультразвук','vacuum','ceramic','другое','наклейки','фильтр','індикатор','индикатор'];

    const products = all
      .filter(p => {
        const name = p.name.toLowerCase();
        if (skip.some(s => name.includes(s))) return false;
        if (p.is_archived) return false;
        if (!p.min_price || p.min_price <= 0) return false;
        // Filter out EUR products (only UAH)
        if ((p as unknown as { currency_code?: string }).currency_code === 'EUR') return false;
        return true;
      })
      .map(p => ({
        id: p.id,
        name: p.name,
        price: p.min_price,
        quantity: p.quantity,
        thumbnail: p.thumbnail_url,
        in_stock: p.quantity > 0,
        category: categorize(p.name),
      }))
      .sort((a, b) => (b.in_stock ? 1 : 0) - (a.in_stock ? 1 : 0));

    // Get unique categories in order
    const categoryOrder = ['Пакети для стерилізації', 'Дезінфекція та стерилізація', 'Догляд та очистка', 'Контейнери', 'Набори', 'Аксесуари', 'Інше'];
    const categories = categoryOrder.filter(c => products.some(p => p.category === c));

    return NextResponse.json({ data: products, categories });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
