export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

const CAT: Record<string, string> = {
  paper: 'Папір', glue: 'Клей', film: 'Плівка', packaging: 'Тара',
  raw_materials: 'Сировина', rent: 'Оренда', utilities: 'Комунальні', other: 'Інше',
};
const LOC: Record<string, string> = {
  malynovskogo: 'Маліновського', afina_sklad: 'Афіна склад',
  afina_ofis: 'Афіна офіс', dalnytska: 'Дальницька',
};

export default async function ExpensesPage() {
  const supabase = await createAdminClient();

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    { data: expenses },
    { data: supplierPayments },
    { data: salaries },
  ] = await Promise.all([
    supabase.from('ops_expenses').select('*, ops_staff(name)').order('created_at', { ascending: false }).limit(100),
    supabase.from('ops_supplier_payments').select('*, ops_staff(name)').order('created_at', { ascending: false }).limit(50),
    supabase.from('ops_salaries').select('*, ops_staff!ops_salaries_staff_id_fkey(name), recipient:ops_staff!ops_salaries_recipient_id_fkey(name)').order('created_at', { ascending: false }).limit(50),
  ]);

  const monthExpenses = (expenses ?? []).filter(e => e.created_at >= monthStart);
  const totalMonth = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalSupplier = (supplierPayments ?? []).filter(p => p.created_at >= monthStart).reduce((s, p) => s + Number(p.amount), 0);
  const totalSalaries = (salaries ?? []).filter(s => s.created_at >= monthStart).reduce((s, sal) => s + Number(sal.amount), 0);

  // By category
  const byCategory: Record<string, number> = {};
  monthExpenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount); });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Витрати</h1>
        <p className="text-muted-foreground">Операційні витрати, оплати, зарплати</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Витрати (місяць)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalMonth.toLocaleString('uk-UA')} <span className="text-sm font-normal text-muted-foreground">грн</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Постачальники</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalSupplier.toLocaleString('uk-UA')} <span className="text-sm font-normal text-muted-foreground">грн</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Зарплати</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalSalaries.toLocaleString('uk-UA')} <span className="text-sm font-normal text-muted-foreground">грн</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Разом</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-500">{(totalMonth + totalSupplier + totalSalaries).toLocaleString('uk-UA')} <span className="text-sm font-normal">грн</span></p></CardContent>
        </Card>
      </div>

      {/* By category */}
      {Object.keys(byCategory).length > 0 && (
        <Card>
          <CardHeader><CardTitle>По категоріях (місяць)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-4">
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                <div key={cat} className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="text-sm font-medium">{CAT[cat] ?? cat}</span>
                  <span className="font-semibold">{amt.toLocaleString('uk-UA')} грн</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Журнал витрат</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Працівник</TableHead>
                <TableHead>Категорія</TableHead>
                <TableHead>Локація</TableHead>
                <TableHead>Опис</TableHead>
                <TableHead className="text-right">Сума</TableHead>
                <TableHead>Фото</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(expenses ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{format(new Date(e.created_at), 'dd.MM HH:mm', { locale: uk })}</TableCell>
                  <TableCell>{e.ops_staff?.name ?? '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{CAT[e.category] ?? e.category}</Badge></TableCell>
                  <TableCell className="text-sm">{LOC[e.location] ?? e.location}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{e.description ?? '—'}</TableCell>
                  <TableCell className="text-right font-semibold">{Number(e.amount).toLocaleString('uk-UA')} грн</TableCell>
                  <TableCell>
                    {e.photo_url && <a href={e.photo_url} target="_blank" rel="noopener noreferrer">📷</a>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
