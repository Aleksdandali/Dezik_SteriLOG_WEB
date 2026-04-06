import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SYSTEM_PROMPT = `Ти — AI-консультант Dezik, українського виробника засобів для стерилізації та дезінфекції.

ПРОДУКЦІЯ:
- Пакети для стерилізації (60×100, 75×150, 100×200, 150×230 мм) — прозорі та білі, 100шт в упаковці
- Деланол — засіб для дезінфекції, ПСО та стерилізації інструментів (20мл, 250мл, 0.5л, 1л)
- Біонол — засіб для дезінфекції інструментів та ПСО (250мл, 1л)
- Інструм (Instrum) — засіб для очищення інструментів від нагару та іржі (250мл, 1л)
- Антисептик Септональ — для обробки рук (0.5л)
- Контейнери для дезінфекції (1л, 3л)
- Готовий Box для стерилізації — набір всього необхідного

ЯК ПРИГОТУВАТИ РОЗЧИНИ:
Деланол: 20мл на 1л води, занурити інструменти на 60 хв, промити водою
Біонол: 20мл на 1л води, занурити на 15 хв, очистити щіткою, промити 30 сек
Інструм: нанести на забруднену поверхню, залишити 5-10 хв, протерти, промити

ДОСТАВКА: Нова Пошта по всій Україні
ОПЛАТА: Накладний платіж або на розрахунковий рахунок
САЙТ: dezik.com.ua
TELEGRAM: @dezik_ua_bot

ПРАВИЛА:
- Відповідай ТІЛЬКИ українською
- Будь коротким і корисним (2-3 речення)
- Якщо не знаєш відповідь або питання про конкретне замовлення — відповідай: {"redirect": true, "message": "Передаю менеджеру..."}
- Якщо питання про ціни — направляй в магазин у боті
- Не вигадуй інформацію якої не маєш`;

export async function POST(request: NextRequest) {
  try {
    const { message, order_id } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    // Call Claude Haiku
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
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!res.ok) {
      console.error('[AI Chat] Anthropic API error:', res.status, await res.text());
      return NextResponse.json({ error: 'AI service error' }, { status: 502 });
    }

    const data = await res.json();
    const aiText = data.content?.[0]?.text ?? '';

    // Check if AI wants to redirect to manager
    let redirected = false;
    try {
      if (aiText.includes('"redirect"') && aiText.includes('true')) {
        const jsonMatch = aiText.match(/\{[^}]*"redirect"\s*:\s*true[^}]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.redirect === true) {
            redirected = true;

            // If we have an order_id, save message and notify admins
            if (order_id) {
              const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
              );

              await supabase.from('ops_order_messages').insert({
                order_id,
                sender_type: 'customer',
                text: message,
              });

              // Notify ops admins
              const BOT_API = 'https://api.telegram.org/bot';
              const OPS_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
              const { data: admins } = await supabase
                .from('ops_staff')
                .select('telegram_id')
                .eq('role', 'admin')
                .eq('active', true);

              for (const admin of admins ?? []) {
                try {
                  await fetch(`${BOT_API}${OPS_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chat_id: admin.telegram_id,
                      text: `🤖 AI перенаправив клієнта (замовлення #${order_id}):\n\n${message}`,
                      parse_mode: 'HTML',
                    }),
                  });
                } catch {}
              }
            }

            return NextResponse.json({
              reply: parsed.message || 'Передаю менеджеру...',
              redirected: true,
            });
          }
        }
      }
    } catch {}

    return NextResponse.json({ reply: aiText, redirected: false });
  } catch (err) {
    console.error('[AI Chat]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
