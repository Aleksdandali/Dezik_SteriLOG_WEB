import { GuideForm } from '@/components/guide-form';

export default function NewGuidePage() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Нова методичка</h1>
      <GuideForm />
    </div>
  );
}
