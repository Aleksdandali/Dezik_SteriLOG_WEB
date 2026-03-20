import { createAdminClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/components/settings-form';

export default async function SettingsPage() {
  const supabase = await createAdminClient();

  const [{ data: config }, { data: packetTypes }] = await Promise.all([
    supabase.from('app_config').select('*'),
    supabase.from('packet_types').select('*').order('sort_order'),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Конфігурація</h1>
      <SettingsForm config={config ?? []} packetTypes={packetTypes ?? []} />
    </div>
  );
}
