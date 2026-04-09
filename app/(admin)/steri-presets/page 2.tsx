import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SteriPresetsManager } from '@/components/steri-presets-manager';

export default async function SteriPresetsPage() {
  const supabase = await createAdminClient();
  const { data: presets } = await supabase.from('steri_presets').select('*').order('sort_order');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Режими стерилізації</h1>
      <Card>
        <CardContent className="pt-6">
          <SteriPresetsManager presets={presets ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
