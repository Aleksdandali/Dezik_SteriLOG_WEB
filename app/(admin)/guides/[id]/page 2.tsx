import { createAdminClient } from '@/lib/supabase/server';
import { GuideForm } from '@/components/guide-form';
import { notFound } from 'next/navigation';

export default async function EditGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAdminClient();
  const { data: doc } = await supabase.from('knowledge_documents').select('*').eq('id', id).single();

  if (!doc) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Редагувати методичку</h1>
      <GuideForm document={doc} />
    </div>
  );
}
