import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { ConcentrationsManager } from '@/components/concentrations-manager';

export default async function ConcentrationsPage() {
  const supabase = await createAdminClient();
  const { data } = await supabase.from('concentrate_products').select('*').order('sort_order');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Концентрації розчинів</h1>
      <Card>
        <CardContent className="pt-6">
          <ConcentrationsManager items={data ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
