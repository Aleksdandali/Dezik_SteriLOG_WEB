import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import Link from 'next/link';

export default async function UsersPage() {
  const supabase = await createAdminClient();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Користувачі</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ім'я</TableHead>
                <TableHead>Прізвище</TableHead>
                <TableHead>Салон</TableHead>
                <TableHead>Місто</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Реєстрація</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/users/${p.id}`} className="font-medium hover:underline">
                      {p.name ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell>{p.last_name ?? '—'}</TableCell>
                  <TableCell>{p.salon_name ?? '—'}</TableCell>
                  <TableCell>{p.city ?? '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{p.phone ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.role}</Badge>
                  </TableCell>
                  <TableCell>{format(new Date(p.created_at), 'dd.MM.yyyy', { locale: uk })}</TableCell>
                </TableRow>
              ))}
              {(!profiles || profiles.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Користувачів поки немає
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
