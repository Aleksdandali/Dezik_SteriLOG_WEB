'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { KnowledgeDocument } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  document?: KnowledgeDocument;
}

export function GuideForm({ document }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<{
    title: string;
    subtitle: string;
    content: string;
    category: string;
    published: boolean;
  }>({
    title: document?.title ?? '',
    subtitle: document?.subtitle ?? '',
    content: document?.content ?? '',
    category: document?.category ?? 'guide',
    published: document?.published ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      title: form.title,
      subtitle: form.subtitle || null,
      content: form.content,
      category: form.category,
      published: form.published,
      updated_at: new Date().toISOString(),
    };

    if (document) {
      await supabase.from('knowledge_documents').update(payload).eq('id', document.id);
    } else {
      await supabase.from('knowledge_documents').insert(payload);
    }

    setLoading(false);
    router.push('/guides');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{document ? 'Редагувати методичку' : 'Нова методичка'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Заголовок *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Підзаголовок</Label>
              <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Категорія</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v ?? 'guide' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="guide">Гайд</SelectItem>
                  <SelectItem value="method">Методичка</SelectItem>
                  <SelectItem value="faq">FAQ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3 pb-1">
              <Switch checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
              <Label>Опубліковано</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Контент (Markdown)</Label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={15}
              className="font-mono text-sm"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? 'Збереження...' : 'Зберегти'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Скасувати
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
