import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const formData = await request.formData();
    const file = (formData.get('photo') ?? formData.get('file')) as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ALLOWED_TYPES: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'application/pdf': 'pdf',
    };
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP, HEIC, PDF allowed' }, { status: 400 });
    }

    const MAX_SIZE = ext === 'pdf' ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `File too large (max ${ext === 'pdf' ? '20' : '10'}MB)` }, { status: 400 });
    }

    const folder = formData.get('folder') as string | null;
    const fileName = folder
      ? `${folder}/${Date.now()}.${ext}`
      : `${staff.id}/${Date.now()}.${ext}`;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { error } = await supabase.storage
      .from('ops-photos')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('[Upload Error]', error);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from('ops-photos')
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('[Upload Error]', err);
    const message = err instanceof Error ? err.message : String(err);
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message || 'Upload error' }, { status });
  }
}
