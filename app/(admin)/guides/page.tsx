import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import Link from 'next/link';
import { Plus } from 'lucide-react';

const categoryLabels: Record<string, string> = {
  guide: 'Гайд',
  method: 'Методичка',
  faq: 'FAQ',
};

export default async function GuidesPage() {
  const supabase = await createAdminClient();
  const { data: docs } = await supabase.from('knowledge_documents').select('*').order('sort_order');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Методички</h1>
        <Link href="/guides/new">
          <Button><Plus className="mr-2 h-4 w-4" />Додати</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Заголовок</TableHead>
                <TableHead>Категорія</TableHead>
                <TableHead>Опубліковано</TableHead>
                <TableHead>Дата</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs?.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <Link href={`/guides/${doc.id}`} className="font-medium hover:underline">{doc.title}</Link>
                  </TableCell>
                  <TableCell><Badge variant="outline">{categoryLabels[doc.category] ?? doc.category}</Badge></TableCell>
                  <TableCell>
                    <Badge className={doc.published ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-100'} variant="secondary">
                      {doc.published ? 'Так' : 'Ні'}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(new Date(doc.updated_at), 'dd.MM.yyyy', { locale: uk })}</TableCell>
                </TableRow>
              ))}
              {(!docs || docs.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">Методичок поки немає</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
