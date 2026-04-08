import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';

export async function POST(request: NextRequest) {
  try {
    await requireStaff(request);
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: `Ти парсер даних клієнта. З тексту витягни:
- last_name (прізвище)
- first_name (ім'я)
- phone (телефон, формат 0XXXXXXXXX)
- city (місто)
- warehouse (номер відділення НП, тільки цифра або "")
- comment (все інше)

Відповідай ТІЛЬКИ валідним JSON. Без markdown, без пояснень.
Приклад: {"last_name":"Шевченко","first_name":"Олена","phone":"0991234567","city":"Київ","warehouse":"5","comment":""}

Якщо чогось немає — порожній рядок.`,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!res.ok) {
      console.error('[Parse] Anthropic error:', res.status, await res.text());
      return NextResponse.json({ error: 'AI service error' }, { status: 502 });
    }

    const aiData = await res.json();
    const aiText = aiData.content?.[0]?.text ?? '';

    // Extract JSON from response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Не вдалось розібрати дані' }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Try to resolve city_ref from Nova Poshta
    let city_ref: string | undefined;
    if (parsed.city) {
      try {
        const npRes = await fetch(`https://dezik-admin.vercel.app/api/customer/np-search?type=city&q=${encodeURIComponent(parsed.city)}`, {
          headers: { 'x-telegram-init-data': request.headers.get('x-telegram-init-data') ?? '' },
        });
        const npData = await npRes.json();
        if (npData.data?.[0]?.ref) {
          city_ref = npData.data[0].ref;
          parsed.city = npData.data[0].name;
        }
      } catch {}
    }

    return NextResponse.json({ data: { ...parsed, city_ref } });
  } catch (err) {
    console.error('[Parse]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
