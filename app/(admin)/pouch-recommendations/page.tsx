import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { PouchMapManager } from '@/components/pouch-map-manager';

export default async function PouchRecommendationsPage() {
  const supabase = await createAdminClient();
  const { data } = await supabase.from('instrument_pouch_map').select('*').order('sort_order');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Рекомендації пакетів</h1>
      <Card>
        <CardContent className="pt-6">
          <PouchMapManager items={data ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
