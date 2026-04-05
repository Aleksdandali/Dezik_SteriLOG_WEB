import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireOpsAdmin } from '@/lib/telegram/auth';

export async function GET(request: NextRequest) {
  try {
    const staff = await requireOpsAdmin(request);
    void staff;
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);

    const period = searchParams.get('period') ?? 'month'; // day | week | month
    const now = new Date();
    let since: string;

    switch (period) {
      case 'day':
        since = now.toISOString().slice(0, 10);
        break;
      case 'week': {
        const weekAgo = new Date(now.getTime() - 7 * 86400000);
        since = weekAgo.toISOString().slice(0, 10);
        break;
      }
      default: {
        since = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        break;
      }
    }

    // Fetch all data in parallel
    const [expensesRes, cashRes, supplierRes, salariesRes, fixedCostsRes, movementsRes] = await Promise.all([
      supabase
        .from('ops_expenses')
        .select('amount, category, location, created_at')
        .gte('created_at', since),
      supabase
        .from('ops_cash_reports')
        .select('amount, channel, payment_type, report_date')
        .gte('report_date', since),
      supabase
        .from('ops_supplier_payments')
        .select('amount, supplier, created_at')
        .gte('created_at', since),
      supabase
        .from('ops_salaries')
        .select('amount, type, period')
        .gte('created_at', since),
      supabase
        .from('ops_fixed_cost_payments')
        .select('amount, period, ops_fixed_costs(name, location)')
        .gte('paid_at', since),
      supabase
        .from('ops_movements')
        .select('from_location, to_location, description, quantity, created_at, ops_staff!ops_movements_staff_id_fkey(name)')
        .gte('created_at', since)
        .order('created_at', { ascending: false }),
    ]);

    // Aggregate income
    const income = (cashRes.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);

    // Aggregate expenses by category
    const expensesByCategory: Record<string, number> = {};
    const expensesByLocation: Record<string, number> = {};
    let totalExpenses = 0;
    for (const e of expensesRes.data ?? []) {
      const amt = Number(e.amount);
      totalExpenses += amt;
      expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + amt;
      expensesByLocation[e.location] = (expensesByLocation[e.location] ?? 0) + amt;
    }

    const totalSupplier = (supplierRes.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
    const totalSalaries = (salariesRes.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
    const totalFixed = (fixedCostsRes.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);

    const totalCosts = totalExpenses + totalSupplier + totalSalaries + totalFixed;

    return NextResponse.json({
      period: since,
      income,
      expenses: {
        total: totalExpenses,
        byCategory: expensesByCategory,
        byLocation: expensesByLocation,
      },
      supplierPayments: totalSupplier,
      salaries: totalSalaries,
      fixedCosts: totalFixed,
      totalCosts,
      profit: income - totalCosts,
      movements: movementsRes.data ?? [],
      cashByChannel: (cashRes.data ?? []).reduce((acc: Record<string, number>, r) => {
        acc[r.channel] = (acc[r.channel] ?? 0) + Number(r.amount);
        return acc;
      }, {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
