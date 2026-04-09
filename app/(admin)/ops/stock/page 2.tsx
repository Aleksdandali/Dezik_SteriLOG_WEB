export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllProductsSafe, type KeyCRMProduct } from '@/lib/keycrm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

const LOC_LABELS: Record<string, string> = {
  malynovskogo: '🏭 Маліновського',
  afina_sklad: '📦 Афіна склад',
  dalnytska: '🧪 Дальницька',
};
const MAT: Record<string, string> = { transparent: 'Прозорі', white: 'Білі', brown: 'Коричневі' };
const LOCATIONS = ['malynovskogo', 'afina_sklad', 'dalnytska'];
const CAT_LABELS: Record<string, string> = {
  bags: 'Пакети', chemistry: 'Хімія', cleaning: 'Очистка',
  antiseptic: 'Антисептик', accessories: 'Аксесуари', raw: 'Сировина',
};

export default async function StockPage() {
  const supabase = await createAdminClient();

  // Fetch ops_products with KeyCRM mapping
  const { data: opsProducts } = await supabase
    .from('ops_products')
    .select('*')
    .eq('active', true)
    .order('sort_order');

  // Fetch KeyCRM quantities
  const keycrmProducts = await fetchAllProductsSafe();
  const keycrmMap = new Map<number, KeyCRMProduct>(keycrmProducts.map(p => [p.id, p]));

  // Build product list with KeyCRM quantities
  const productsWithQty = (opsProducts ?? [])
    .filter(p => p.category !== 'raw')
    .map(p => {
      const kp = p.keycrm_id ? keycrmMap.get(p.keycrm_id) : null;
      return { ...p, keycrm_qty: kp?.quantity ?? null, keycrm_name: kp?.name ?? null };
    });

  // Warehouse stock from audits + production
  const stockByLocation: Record<string, { items: { name: string; quantity: number; unit: string; type: string }[]; auditDate: string | null }> = {};

  for (const loc of LOCATIONS) {
    const { data: audits } = await supabase
      .from('ops_inventory_audits')
      .select('id, audit_date')
      .eq('location', loc)
      .order('created_at', { ascending: false })
      .limit(1);

    const audit = audits?.[0];
    const items: { name: string; quantity: number; unit: string; type: string }[] = [];

    if (audit) {
      const { data: auditItems } = await supabase
        .from('ops_inventory_audit_items')
        .select('name, quantity, unit, item_type')
        .eq('audit_id', audit.id);
      for (const i of auditItems ?? []) {
        items.push({ name: i.name, quantity: i.quantity, unit: i.unit, type: i.item_type ?? 'finished' });
      }
    }

    if (loc === 'malynovskogo' || loc === 'dalnytska') {
      const { data: produced } = await supabase.from('ops_production').select('bag_size, material, packages').eq('location', loc).eq('stage', 'pack').not('packages', 'is', null);
      const { data: movedOut } = await supabase.from('ops_movements').select('bag_size, material, packages').eq('from_location', loc).not('packages', 'is', null);
      const bal: Record<string, number> = {};
      for (const p of produced ?? []) { if (p.bag_size && p.packages) bal[`${p.bag_size}_${p.material}`] = (bal[`${p.bag_size}_${p.material}`] ?? 0) + p.packages; }
      for (const m of movedOut ?? []) { if (m.bag_size && m.packages) bal[`${m.bag_size}_${m.material}`] = (bal[`${m.bag_size}_${m.material}`] ?? 0) - m.packages; }
      for (const [k, q] of Object.entries(bal)) { if (q > 0) { const [s, m] = k.split('_'); items.push({ name: `${s} ${MAT[m] ?? m}`, quantity: q, unit: 'уп', type: 'finished' }); } }
    }

    stockByLocation[loc] = { items, auditDate: audit?.audit_date ?? null };
  }

  // Group products by category
  const categories = [...new Set(productsWithQty.map(p => p.category))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Склад</h1>
        <p className="text-muted-foreground">Залишки KeyCRM + внутрішній облік</p>
      </div>

      {/* KeyCRM Product Stock */}
      <Card>
        <CardHeader>
          <CardTitle>Залишки KeyCRM</CardTitle>
          <CardDescription>Синхронізовано з dezikmanager.keycrm.app</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead>Категорія</TableHead>
                <TableHead className="text-right">KeyCRM залишок</TableHead>
                <TableHead className="text-right">Ціна (грн)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map(cat => (
                productsWithQty.filter(p => p.category === cat).map(p => (
                  <TableRow key={p.sku}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.sku}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="secondary">{CAT_LABELS[p.category] ?? p.category}</Badge></TableCell>
                    <TableCell className="text-right">
                      {p.keycrm_qty !== null ? (
                        <span className={`font-bold ${p.keycrm_qty <= 0 ? 'text-red-500' : p.keycrm_qty < 50 ? 'text-orange-500' : 'text-green-600'}`}>
                          {p.keycrm_qty}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{p.sell_price ? `${p.sell_price} грн` : '—'}</TableCell>
                  </TableRow>
                ))
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Warehouse Stock */}
      <div className="grid gap-6 lg:grid-cols-3">
        {LOCATIONS.map(loc => {
          const { items, auditDate } = stockByLocation[loc];
          const rawItems = items.filter(i => i.type === 'raw');
          const finishedItems = items.filter(i => i.type === 'finished');

          return (
            <Card key={loc}>
              <CardHeader>
                <CardTitle>{LOC_LABELS[loc]}</CardTitle>
                <CardDescription>
                  {auditDate ? `Переоблік: ${format(new Date(auditDate), 'd MMMM', { locale: uk })}` : 'Переоблік не проводився'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Немає даних</p>
                ) : (
                  <div className="space-y-4">
                    {rawItems.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Сировина</p>
                        <Table><TableBody>
                          {rawItems.map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">{item.name}</TableCell>
                              <TableCell className="text-right font-semibold">{item.quantity} <span className="text-xs text-muted-foreground">{item.unit}</span></TableCell>
                            </TableRow>
                          ))}
                        </TableBody></Table>
                      </div>
                    )}
                    {finishedItems.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Готова продукція</p>
                        <Table><TableBody>
                          {finishedItems.map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">{item.name}</TableCell>
                              <TableCell className="text-right font-semibold">{item.quantity} <span className="text-xs text-muted-foreground">{item.unit}</span></TableCell>
                            </TableRow>
                          ))}
                        </TableBody></Table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
