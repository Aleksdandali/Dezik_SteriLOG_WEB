import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';

const NP_API = 'https://api.novaposhta.ua/v2.0/json/';

async function npSearchCity(query: string): Promise<{ ref: string; name: string } | null> {
  try {
    const res = await fetch(NP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: process.env.NOVA_POSHTA_API_KEY,
        modelName: 'Address',
        calledMethod: 'getCities',
        methodProperties: { FindByString: query.trim(), Limit: '3' },
      }),
    });
    const data = await res.json();
    const city = data.data?.[0];
    return city ? { ref: city.Ref, name: city.Description } : null;
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaff(request);
    const { text } = await request.json();
    if (!text || text.length < 3) {
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
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Витягни дані з тексту замовлення. Відповідь — ТІЛЬКИ JSON, без markdown, без пояснень.

"${text.replace(/"/g, "'")}"

{"last_name":"","first_name":"","phone":"","city":"","warehouse":"","comment":""}

Інструкція:
- last_name: прізвище клієнта
- first_name: ім'я клієнта
- phone: ТІЛЬКИ 9 цифр після коду країни. Прибери +38, 38, 0 спочатку. 0637443889→637443889, +380501234567→501234567, 380991111111→991111111
- city: місто УКРАЇНСЬКОЮ. Одесса→Одеса, Киев→Київ, Харьков→Харків, Запорожье→Запоріжжя, Днепр→Дніпро
- warehouse: номер відділення НП (тільки цифри). "нп 95"→"95", "відд 3"→"3", "отд.12"→"12"
- comment: додаткова інфо (оплата, побажання). Якщо немає — пустий рядок`
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text ?? '';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI не повернув JSON');

    const parsed = JSON.parse(jsonMatch[0]);

    // Auto-resolve city via NP API
    if (parsed.city) {
      const npCity = await npSearchCity(parsed.city);
      if (npCity) {
        parsed.city = npCity.name;
        parsed.city_ref = npCity.ref;
      }
    }

    // Clean phone — ensure exactly 9 digits
    if (parsed.phone) {
      let p = parsed.phone.replace(/\D/g, '');
      if (p.startsWith('380')) p = p.slice(3);
      else if (p.startsWith('38') && p.length > 10) p = p.slice(2);
      else if (p.startsWith('0') && p.length === 10) p = p.slice(1);
      parsed.phone = p.slice(0, 9);
    }

    return NextResponse.json({ data: parsed });
  } catch (err) {
    console.error('[Parse Order]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка' }, { status: 500 });
  }
}
