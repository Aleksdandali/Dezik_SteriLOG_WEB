import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';

export async function POST(request: NextRequest) {
  try {
    await requireStaff(request);
    const { text } = await request.json();
    if (!text || text.length < 5) {
      return NextResponse.json({ error: 'Замало тексту' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Розбери текст замовлення на поля. Поверни ТІЛЬКИ JSON без пояснень.

Текст: "${text}"

Формат відповіді:
{"last_name":"Прізвище","first_name":"Ім'я","phone":"9 цифр без +380 і без 0 на початку","city":"Місто українською","warehouse":"номер відділення або повна назва якщо є","comment":"все інше що не підходить до полів вище або пусто"}

Правила:
- Телефон: прибери +38, 38, 0 на початку, залиш тільки 9 цифр. Приклад: 0637443889 → 637443889
- Місто: переклади на українську якщо написано російською (Одесса → Одеса, Киев → Київ)
- Відділення: якщо є число після міста — це номер відділення НП
- Якщо поле не знайдено — постав пустий рядок ""
- comment — тільки якщо є додаткова інформація (тип оплати, побажання тощо)`
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text ?? '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI не повернув JSON');

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ data: parsed });
  } catch (err) {
    console.error('[Parse Order]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка' }, { status: 500 });
  }
}
