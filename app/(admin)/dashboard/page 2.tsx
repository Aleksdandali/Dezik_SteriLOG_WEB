export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { ShoppingCart, DollarSign, Users, Microscope } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { DashboardCharts } from './charts';

export default async function DashboardPage() {
  const supabase = await createAdminClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { count: ordersToday },
    { count: ordersMonth },
    { data: revenueData },
    { count: usersMonth },
    { count: cyclesToday },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('orders').select('total_amount').neq('status', 'canceled').gte('created_at', monthStart),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('sterilization_sessions').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5),
  ]);

  const monthRevenue = revenueData?.reduce((sum, o) => sum + Number(o.total_amount), 0) ?? 0;

  // Data for charts (last 30 days)
  const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString();

  const [
    { data: ordersForChart },
    { data: registrationsForChart },
  ] = await Promise.all([
    supabase.from('orders').select('created_at, total_amount').gte('created_at', thirtyDaysAgo).neq('status', 'canceled'),
    supabase.from('profiles').select('created_at').gte('created_at', thirtyDaysAgo),
  ]);

  const revenueByDay: Record<string, number> = {};
  const regsByDay: Record<string, number> = {};

  ordersForChart?.forEach((o) => {
    const day = format(new Date(o.created_at), 'dd.MM');
    revenueByDay[day] = (revenueByDay[day] ?? 0) + Number(o.total_amount);
  });

  registrationsForChart?.forEach((p) => {
    const day = format(new Date(p.created_at), 'dd.MM');
    regsByDay[day] = (regsByDay[day] ?? 0) + 1;
  });

  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29 + i);
    return format(d, 'dd.MM');
  });

  const revenueChartData = last30Days.map((day) => ({
    date: day,
    value: revenueByDay[day] ?? 0,
  }));

  const regsChartData = last30Days.map((day) => ({
    date: day,
    value: regsByDay[day] ?? 0,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Дашборд</h1>
        <p className="text-muted-foreground">Огляд ключових показників</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Замовлень сьогодні"
          value={ordersToday ?? 0}
          description={`${ordersMonth ?? 0} цього місяця`}
          icon={ShoppingCart}
        />
        <StatCard
          title="Виручка за місяць"
          value={`${monthRevenue.toLocaleString('uk-UA')} грн`}
          icon={DollarSign}
        />
        <StatCard
          title="Нових користувачів"
          value={usersMonth ?? 0}
          description="Цього місяця"
          icon={Users}
        />
        <StatCard
          title="Циклів сьогодні"
          value={cyclesToday ?? 0}
          icon={Microscope}
        />
      </div>

      <DashboardCharts revenueData={revenueChartData} registrationsData={regsChartData} />

      <Card>
        <CardHeader>
          <CardTitle>Останні замовлення</CardTitle>
          <CardDescription>5 останніх замовлень</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Клієнт</TableHead>
                <TableHead>Сума</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders?.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    {format(new Date(order.created_at), 'dd.MM.yyyy HH:mm', { locale: uk })}
                  </TableCell>
                  <TableCell>
                    {order.first_name} {order.last_name}
                  </TableCell>
                  <TableCell>{Number(order.total_amount).toLocaleString('uk-UA')} грн</TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                </TableRow>
              ))}
              {(!recentOrders || recentOrders.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Замовлень поки немає
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
