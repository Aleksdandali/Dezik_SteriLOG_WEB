import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';
import { createClient } from '@supabase/supabase-js';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `Ти — AI-помічник менеджера Dezik.com.ua (бренд стерилізаційних пакетів та хімії для салонів краси).
Менеджер запитує тебе про конкретного клієнта. Відповідай як досвідчений колега — коротко, конкретно, з цифрами.

КОНТЕКСТ БІЗНЕСУ:
- Dezik виробляє крафт-пакети для стерилізації та продає хімію (Деланол, Біонол, Інструм) для салонів краси та nail-майстрів.
- Головна мета: кожного клієнта перевести NEW → RETURNING → REGULAR → VIP.
- Ключова cross-sell можливість: клієнти з пакетами → додати Деланол.
- Upsell: маленькі обʼєми → більші (250мл → 1л = економія 30%).

ПРОДУКТИ:
- Крафт-пакети (витратник, кожні 2-4 тижні): 60x100, 75x150, 100x200, 150x230 мм
- Деланол (дезінфекція): 20мл, 250мл, 500мл, 1л. ~500мл/міс для соло-майстра
- Біонол (дезінфекція поверхонь): 250мл, 1л
- Інструм (очистка): 250мл, 500мл, 1л

ПРАВИЛА:
1. Завжди посилайся на конкретні дані клієнта
2. Давай КОНКРЕТНУ пораду з цінами та продуктами
3. Якщо клієнт затримує — порахуй просрочку відносно циклу
4. Мова: українська, неформальний діловий стиль
5. Максимум 150 слів`;

/** POST /api/telegram/clients/[id]/chat — AI chat about a specific client */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff(request);
    const { id } = await params;
    const buyerId = parseInt(id);

    const { message, history } = await request.json() as {
      message: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    // Load client context (only on first message)
    let contextBlock = '';
    if (!history || history.length === 0) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

      // Buyer info
      const buyer = await keycrmFetch<{
        id: number; full_name: string | null; phone: string[] | string | null;
        orders_count: number; orders_sum: string | null;
      }>(`/buyer/${buyerId}`);

      // Recent orders
      const ordersData = await keycrmFetch<{ data: {
        id: number; ordered_at: string; grand_total: number;
        products: { name: string; quantity: number; price_sold: number }[];
      }[] }>(`/order?filter[buyer_id]=${buyerId}&include=products&sort=-ordered_at&limit=10`);

      // Intelligence from Supabase
      const { data: intel } = await supabase
        .from('customer_intelligence')
        .select('*')
        .eq('keycrm_buyer_id', buyerId)
        .maybeSingle();

      // Profile
      const rawPhone = Array.isArray(buyer.phone) ? buyer.phone[0] : buyer.phone;
      const normPhone = rawPhone?.replace(/\D/g, '').replace(/^38/, '') ?? '';
      const { data: profile } = normPhone ? await supabase
        .from('customer_profiles')
        .select('*')
        .eq('phone', normPhone)
        .maybeSingle() : { data: null };

      const orders = ordersData.data ?? [];
      const totalSpend = parseFloat(buyer.orders_sum ?? '0');
      const avgCheck = buyer.orders_count > 0 ? Math.round(totalSpend / buyer.orders_count) : 0;
      const daysSinceLast = orders[0]
        ? Math.round((Date.now() - new Date(orders[0].ordered_at).getTime()) / 86400000)
        : null;

      contextBlock = `
КЛІЄНТ: ${buyer.full_name ?? 'Невідомий'}
Телефон: ${rawPhone ?? '—'}
Замовлень: ${buyer.orders_count}
Сума: ${Math.round(totalSpend)} грн (сер. чек ${avgCheck} грн)
Днів з останнього: ${daysSinceLast ?? '—'}
${profile ? `Сегмент: ${profile.segment} | Лояльність: ${profile.loyalty_tier}` : ''}
${intel ? `AI Summary: ${intel.ai_summary}` : ''}
${intel?.products_running_low ? `Закінчується: ${JSON.stringify(intel.products_running_low)}` : ''}
${intel?.never_bought_categories?.length ? `Ніколи не купував: ${intel.never_bought_categories.join(', ')}` : ''}

ОСТАННІ ЗАМОВЛЕННЯ:
${orders.slice(0, 7).map((o, i) => {
  const prods = o.products.map(p => `${p.name} x${p.quantity}`).join(', ');
  return `${i + 1}. ${o.ordered_at.split('T')[0]} | ${o.grand_total} грн | ${prods}`;
}).join('\n')}`;
    }

    // Build messages
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];
    if (history?.length) {
      messages.push(...history);
    }
    messages.push({
      role: 'user',
      content: contextBlock ? `${contextBlock}\n\nПИТАННЯ: ${message}` : message,
    });

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      console.error('[AI Chat] Error:', res.status);
      return NextResponse.json({ error: 'AI error' }, { status: 500 });
    }

    const data = await res.json();
    const reply = data?.content?.[0]?.text?.trim() ?? 'Помилка генерації відповіді';

    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
