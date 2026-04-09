import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { keycrmFetch, fetchAllProductsSafe } from '@/lib/keycrm';
import { authenticateCustomer } from '@/lib/telegram/customer-auth';
import { trackShipment } from '@/lib/nova-poshta';

// ---------------------------------------------------------------------------
// System prompt — product knowledge + tool usage instructions
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Ти — AI-консультант Dezik, українського виробника засобів для стерилізації та дезінфекції.

ПРОДУКЦІЯ DEZIK:
- Пакети для стерилізації (60×100, 75×150, 100×200, 150×230 мм) — прозорі та білі, 100шт/уп
- Деланол — дезінфекція, ПСО та стерилізація інструментів (20мл, 250мл, 0.5л, 1л)
- Біонол — дезінфекція інструментів та ПСО (250мл, 1л)
- Інструм (Instrum) — очищення від нагару та іржі (250мл, 1л)
- Антисептик Септональ — обробка рук (0.5л)
- Контейнери для дезінфекції (1л, 3л)
- Готовий Box для стерилізації — повний набір

===ДЕЛАНОЛ — ПОВНА ІНСТРУКЦІЯ===

ЗАГАЛЬНЕ:
- Прозора рідина, добре розчиняється у воді.
- Призначення: дезінфекція, достерилізаційне очищення (ПСО) та стерилізація інструментів.
- Не пошкоджує метал, скло, гуму, полімери, дерево, кахлю, порцеляну, фаянс.
- Не фіксує білкові забруднення, добре змивається, не залишає нальоту.
- НЕ сумісний з аніонактивними ПАР та засобами на їх основі.
- Термін придатності концентрату: 5 років. Зберігання: від -5 до +30°C.

СПЕКТР ДІЇ:
- Бактерицидний (включно з туберкульозом, MRSA)
- Вірулицидний (гепатити A/B/C, ВІЛ, COVID-19, грип, герпес)
- Фунгіцидний (кандидози, дерматомікози)
- Споруцидний

ПРИГОТУВАННЯ РОЗЧИНІВ (засіб + вода до загального об'єму):
- 0.1% = 1 мл на 1л (або 10 мл на 10л)
- 0.2% = 2 мл на 1л (або 20 мл на 10л)
- 0.5% = 5 мл на 1л (або 50 мл на 10л)
- 1.0% = 10 мл на 1л (або 100 мл на 10л)
- 2.0% = 20 мл на 1л (або 200 мл на 10л)
- 3.0% = 30 мл на 1л (або 300 мл на 10л)
- Робочий розчин зберігати до 35 діб у закритій тарі.

ДЛЯ САЛОНІВ КРАСИ (манікюр/педикюр):
1. Дезінфекція інструментів: занурити у 0.2% на 15 хв АБО 0.1% на 30 хв.
2. Промити проточною водою 3 хв.
3. Суміщення дезінфекції з ПСО: 0.2-0.5% розчин, занурити на 15 хв при (20±5)°C.
4. Мити кожен виріб щіткою в розчині 0.5 хв.
5. Промити проточною водою 3 хв.
6. Сушити при 85°C (термостабільні) або при кімнатній температурі.

ХОЛОДНА СТЕРИЛІЗАЦІЯ ДЕЛАНОЛОМ:
- 2.0% розчин — експозиція 30 хв.
- 3.0% розчин — експозиція 15 хв.
- Розчин для стерилізації зберігати до 16 діб.
- Після стерилізації: промити стерильною водою, висушити.

ДЕЗІНФЕКЦІЯ ПОВЕРХОНЬ:
- Підлоги, стіни, меблі: 0.05-0.2%, протирання або зрошення.
- Санітарно-технічне обладнання: 0.1-0.2%, 250 мл/м².
- Після дезінфекції провітрити 15-30 хв.

БЕЗПЕКА:
- Працювати в рукавичках та халаті.
- Готувати розчини у провітрюваному приміщенні.
- При попаданні в очі: промити водою 10-15 хв.
- При попаданні на шкіру: промити водою з милом.

===БІОНОЛ ФОРТЕ — ПОВНА ІНСТРУКЦІЯ===

ЗАГАЛЬНЕ:
- Дезінфікуючий засіб з мийними властивостями.
- Прозора рідина, добре розчиняється у воді.
- Не пошкоджує метал, скло, гуму, полімери, дерево, кахлю, порцеляну, фаянс.
- Не фіксує білкові забруднення, має мийні властивості.
- Гомогенізує мокротиння та інші виділення.
- Має пролонговану антимікробну дію протягом 3 годин.
- НЕ сумісний з аніонними ПАР та милами.
- Термін придатності концентрату: 3 роки. Зберігання: від -5 до +35°C.

СПЕКТР ДІЇ:
- Бактерицидний (включно з туберкульозом, MRSA)
- Вірулицидний (гепатити A/B/C, ВІЛ, COVID-19, грип, герпес)
- Фунгіцидний (кандидози, дерматомікози, плісняві гриби)
- Ефективно видаляє залишки крові

ПРИГОТУВАННЯ РОЗЧИНІВ (засіб + вода до загального об'єму):
- 0.1% = 1 мл на 1л (або 10 мл на 10л)
- 0.2% = 2 мл на 1л (або 20 мл на 10л)
- 0.25% = 2.5 мл на 1л
- 0.5% = 5 мл на 1л (або 50 мл на 10л)
- 0.75% = 7.5 мл на 1л
- 1.0% = 10 мл на 1л (або 100 мл на 10л)
- 2.0% = 20 мл на 1л (або 200 мл на 10л)
- Робочий розчин зберігати до 35 діб у закритій тарі.
- Готувати в холодній воді, перемішувати 1-2 хв.

ДЛЯ САЛОНІВ КРАСИ (манікюр/педикюр):
1. Дезінфекція інструментів: занурити у 0.5% на 30 хв АБО 1.0% на 15 хв.
2. Суміщення дезінфекції з ПСО: 0.5% розчин при (20±5)°C на 30 хв або 1.0% на 15 хв.
3. Мити кожен виріб щіткою/тампоном 0.5 хв.
4. Промити проточною водою 3 хв.
5. Сушити при 85°C (термостабільні) або при кімнатній температурі.

ДЕЗІНФЕКЦІЯ ІНСТРУМЕНТІВ (за типом інфекції):
- Бактеріальна (крім тубер.): 0.25% на 60 хв, 0.5% на 30 хв, 1.0% на 15 хв, 2.0% на 5 хв.
- Вірусна (гепатити, ВІЛ): 0.75% на 60 хв, 1.0% на 30 хв, 2.0% на 15 хв, 5.0% на 5 хв.
- Туберкульоз: 0.5% на 120 хв, 1.0% на 60 хв, 2.0% на 30 хв, 5.0% на 15 хв, 10.0% на 5 хв.
- Грибкова: 0.1% на 60 хв, 0.25% на 30 хв, 0.5% на 15 хв, 2.0% на 5 хв.
- ДВР (високого рівня): 2.0% на 15 хв, 5.0% на 5 хв.

ДЕЗІНФЕКЦІЯ ПОВЕРХОНЬ:
- Підлоги, стіни, меблі: 0.25-1.0%, протирання або зрошення.
- Сантехніка: зрошення 250 мл/м².
- Після дезінфекції провітрити 30 хв.

БЕЗПЕКА:
- Працювати в рукавичках.
- Допускається дезінфекція 0.25-1.0% у присутності людей.
- При попаданні в очі: промити водою 10-15 хв, закапати альбуцид.
- При попаданні на шкіру: промити водою.

===ІНШІ ЗАСОБИ===
DEZIK INSTRUM — повна інструкція:
Призначення: очищення інструментів з нержавіючої сталі від темного/коричневого нальоту після стерилізації. Повертає блиск металу.
НЕ є дезінфектантом. Використовується ПІСЛЯ дезінфекції.
Дія: видаляє темний та коричневий наліт, повертає блиск, прибирає легку поверхневу корозію, продовжує термін служби інструменту.
Застосування: розвести 20мл на 1л гарячої води (80-90°C, не окріп). Занурити інструмент на 15-20 хв. Промити під проточною водою. Ретельно висушити.
Можна використовувати в ультразвуковій мийці.
Доступні об'єми: 250мл, 1л.
Сертифікат: висновок державної санітарно-епідеміологічної експертизи № 12.2-18-1/16448 від 25.07.2019. Сфера: медичні заклади, лікарні, клініки та салони краси.

СЕРТИФІКАТИ:
Вся продукція Dezik сертифікована в Україні. Пакети для стерилізації мають сертифікат відповідності та висновок СЕС. Деланол, Біонол та Інструм мають висновки державної санітарно-епідеміологічної експертизи. Копії сертифікатів можна запросити у менеджера.

ДОСТАВКА ТА КОНТАКТИ:
- Доставка: Нова Пошта по всій Україні
- Оплата: накладний платіж або на розрахунковий рахунок
- Сайт: dezik.com.ua
- Telegram: @dezik_ua_bot

РЕКВІЗИТИ ДЛЯ ОПЛАТИ:
ФОП Вічев Юрій Іванович
IBAN: UA813220010000026007340078498
Банк: Універсал Банк (monobank)
ЄДРПОУ: 3188517653
Призначення платежу: "Оплата за товар згідно рахунку"

ЯК КОРИСТУВАТИСЬ БОТОМ:
Щоб побачити замовлення — натисніть "Мій кабінет" і введіть номер телефону.
В кабінеті доступно: активні замовлення, історія, магазин, сертифікати, AI консультант.
Щоб підтвердити оплату — відкрийте замовлення і натисніть "Підтвердити оплату", завантажте фото чека.
Щоб написати менеджеру — відкрийте замовлення і натисніть "Написати менеджеру".
Щоб замовити — перейдіть в "Магазин", оберіть товари, оформіть з доставкою Новою Поштою.

ІНСТРУМЕНТИ:
У тебе є інструменти для перевірки замовлень клієнта, відстеження посилок Нової Пошти та перевірки цін і наявності товарів. Використовуй їх, коли клієнт питає про свої замовлення, статус доставки, ціни чи наявність товарів. Реквізити для оплати вже є вище — просто дай їх клієнту без інструменту.

ПРАВИЛА ВІДПОВІДЕЙ:
- Відповідай ТІЛЬКИ українською
- НІКОЛИ не використовуй markdown (**, ##, #, -, *). Тільки простий текст
- МАКСИМАЛЬНО коротко. 2-3 речення. Тільки суть і цифри. Без вступів, без "Звичайно!", без "Чудове питання!"
- Приклад хорошої відповіді: "Деланол для інструментів: 2 мл на 1 л води, замочити на 15 хв при 20°C, промити 3 хв."
- Якщо товар є в базі знань — давай конкретну інструкцію. Якщо немає — скажи чесно що немає детальної інструкції і запропонуй звернутись до менеджера
- Якщо не можеш допомогти або клієнт наполягає на живому менеджері — відповідай: {"redirect": true, "message": "Передаю менеджеру..."}
- Не вигадуй. Тільки факти з інструкцій вище та з результатів інструментів`;

// ---------------------------------------------------------------------------
// Tool definitions for Claude function calling
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: 'get_customer_orders',
    description:
      'Отримати список останніх замовлень клієнта. Використовуй, коли клієнт питає про свої замовлення, статус, що замовляв, коли буде доставка тощо.',
    input_schema: {
      type: 'object' as const,
      properties: {
        telegram_id: {
          type: 'string',
          description: 'Telegram ID клієнта',
        },
      },
      required: ['telegram_id'],
    },
  },
  {
    name: 'track_shipment',
    description:
      'Відстежити посилку Нової Пошти за номером ТТН. Використовуй, коли клієнт питає "де моя посилка", "коли приїде", або дає номер ТТН.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ttn: {
          type: 'string',
          description: 'Номер ТТН (експрес-накладної) Нової Пошти',
        },
      },
      required: ['ttn'],
    },
  },
  {
    name: 'get_product_info',
    description:
      'Перевірити ціну та наявність товару. Використовуй, коли клієнт питає про ціну, наявність, вартість конкретного товару.',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_name: {
          type: 'string',
          description: 'Назва або частина назви товару для пошуку (наприклад "деланол 1л", "пакети 100х200")',
        },
      },
      required: ['product_name'],
    },
  },
];

// ---------------------------------------------------------------------------
// Status name mapping (shared with orders route)
// ---------------------------------------------------------------------------
const STATUS_NAMES: Record<number, string> = {
  1: 'Новий',
  4: 'Очікуємо оплату',
  8: 'Збирається',
  10: 'Накладний платіж',
  12: 'Відправлено',
  19: 'Скасовано',
};

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

async function executeGetCustomerOrders(telegramId: string): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Look up phone from customer_telegram_links
  const { data: link, error: linkErr } = await supabase
    .from('customer_telegram_links')
    .select('phone')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (linkErr || !link?.phone) {
    return JSON.stringify({
      error: true,
      message: 'Клієнт ще не привʼязав номер телефону. Потрібно натиснути "Мій кабінет" і ввести номер.',
    });
  }

  const cleanPhone = link.phone;

  try {
    const data = await keycrmFetch<{
      data: {
        id: number;
        status_id: number;
        payment_status: string;
        grand_total: number;
        ordered_at: string;
        shipping: {
          tracking_code: string | null;
          shipping_status: string | null;
          shipping_address_city: string | null;
          shipping_receive_point: string | null;
        } | null;
        products: { name: string; quantity: number; price: number }[];
      }[];
      total: number;
    }>(`/order?filter[buyer_phone]=${cleanPhone}&sort=-id&limit=5&include=products,shipping`);

    if (!data.data?.length) {
      return JSON.stringify({ orders: [], message: 'Замовлень не знайдено.' });
    }

    const orders = data.data.map((o) => ({
      id: o.id,
      status: STATUS_NAMES[o.status_id] ?? `Статус ${o.status_id}`,
      payment: o.payment_status === 'paid' ? 'Оплачено' : 'Не оплачено',
      total: `${o.grand_total} грн`,
      date: o.ordered_at?.split('T')[0] ?? '',
      ttn: o.shipping?.tracking_code ?? null,
      city: o.shipping?.shipping_address_city ?? null,
      warehouse: o.shipping?.shipping_receive_point ?? null,
      products: o.products?.map((p) => `${p.name} x${p.quantity}`).join(', ') ?? '',
    }));

    return JSON.stringify({ orders });
  } catch (err) {
    console.error('[AI Tool: get_customer_orders]', err);
    return JSON.stringify({ error: true, message: 'Помилка отримання замовлень з CRM.' });
  }
}

async function executeTrackShipment(ttn: string): Promise<string> {
  try {
    const result = await trackShipment(ttn);

    return JSON.stringify({
      ttn: result.Number,
      status: result.Status,
      statusCode: result.StatusCode,
      city: result.CityRecipient,
      warehouseRecipient: result.WarehouseRecipient,
      scheduledDelivery: result.ScheduledDeliveryDate,
      actualDelivery: result.ActualDeliveryDate || null,
      received: result.RecipientDateTime || null,
    });
  } catch (err) {
    console.error('[AI Tool: track_shipment]', err);
    return JSON.stringify({ error: true, message: `Не вдалось відстежити ТТН ${ttn}. Перевірте номер.` });
  }
}

async function executeGetProductInfo(productName: string): Promise<string> {
  try {
    const products = await fetchAllProductsSafe();

    if (!products.length) {
      return JSON.stringify({ error: true, message: 'Каталог тимчасово недоступний.' });
    }

    const query = productName.toLowerCase();
    const queryWords = query.split(/\s+/).filter(Boolean);

    // Score-based fuzzy matching
    const scored = products
      .filter((p) => !p.is_archived)
      .map((p) => {
        const name = p.name.toLowerCase();
        let score = 0;

        // Exact substring match — highest priority
        if (name.includes(query)) score += 100;

        // Individual word matches
        for (const word of queryWords) {
          if (name.includes(word)) score += 10;
        }

        return { product: p, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!scored.length) {
      return JSON.stringify({
        found: false,
        message: `Товар "${productName}" не знайдено в каталозі.`,
      });
    }

    const results = scored.map((s) => ({
      name: s.product.name,
      price: `${s.product.min_price} грн`,
      in_stock: s.product.quantity > 0,
      quantity: s.product.quantity,
    }));

    return JSON.stringify({ found: true, products: results });
  } catch (err) {
    console.error('[AI Tool: get_product_info]', err);
    return JSON.stringify({ error: true, message: 'Помилка пошуку товару.' });
  }
}

async function executeTool(
  toolName: string,
  toolInput: Record<string, string>,
  telegramId?: string
): Promise<string> {
  switch (toolName) {
    case 'get_customer_orders':
      return executeGetCustomerOrders(toolInput.telegram_id || telegramId || '');
    case 'track_shipment':
      return executeTrackShipment(toolInput.ttn);
    case 'get_product_info':
      return executeGetProductInfo(toolInput.product_name);
    default:
      return JSON.stringify({ error: true, message: `Unknown tool: ${toolName}` });
  }
}

// ---------------------------------------------------------------------------
// Anthropic API caller with tool loop
// ---------------------------------------------------------------------------

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, string>;
  tool_use_id?: string;
  content?: string;
}

async function callClaude(
  apiKey: string,
  messages: AnthropicMessage[],
  telegramId?: string
): Promise<{ text: string; stopReason: string }> {
  const MAX_TOOL_ROUNDS = 3;

  let currentMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: currentMessages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[AI Chat] Anthropic API error:', res.status, errText);
      throw new Error(`Anthropic API ${res.status}`);
    }

    const data = await res.json();
    const stopReason: string = data.stop_reason;
    const content: AnthropicContentBlock[] = data.content ?? [];

    // If the model stopped without tool use, extract text and return
    if (stopReason !== 'tool_use') {
      const text = content
        .filter((b: AnthropicContentBlock) => b.type === 'text')
        .map((b: AnthropicContentBlock) => b.text ?? '')
        .join('');
      return { text, stopReason };
    }

    // Model wants to use tools — execute them and continue
    const toolUseBlocks = content.filter(
      (b: AnthropicContentBlock) => b.type === 'tool_use'
    );

    // Add assistant response (with tool_use blocks) to messages
    currentMessages.push({ role: 'assistant', content });

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block: AnthropicContentBlock) => {
        const result = await executeTool(
          block.name!,
          (block.input ?? {}) as Record<string, string>,
          telegramId
        );
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id!,
          content: result,
        };
      })
    );

    // Add tool results as a user message
    currentMessages.push({ role: 'user', content: toolResults });
  }

  // If we exhausted tool rounds, return a fallback
  return {
    text: 'Вибачте, не вдалось обробити запит. Спробуйте ще раз або зверніться до менеджера.',
    stopReason: 'max_tool_rounds',
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const customerId = await authenticateCustomer(request);
    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, order_id, history } = await request.json();
    const telegram_id = String(customerId);

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    // Build messages from history
    const messages: AnthropicMessage[] = [
      ...((history ?? []) as { role: string; text: string }[]).map(
        (m: { role: string; text: string }) => ({
          role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.text,
        })
      ),
      {
        role: 'user' as const,
        content: telegram_id
          ? `[telegram_id: ${telegram_id}] ${message}`
          : message,
      },
    ];

    // Call Claude with tool loop
    const { text: aiText } = await callClaude(apiKey, messages, telegram_id);

    // Check if AI wants to redirect to manager
    try {
      if (aiText.includes('"redirect"') && aiText.includes('true')) {
        const jsonMatch = aiText.match(/\{[^}]*"redirect"\s*:\s*true[^}]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.redirect === true) {
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
                } catch {
                  // ignore notification failures
                }
              }
            }

            return NextResponse.json({
              reply: parsed.message || 'Передаю менеджеру...',
              redirected: true,
            });
          }
        }
      }
    } catch {
      // JSON parse failure — not a redirect, continue
    }

    return NextResponse.json({ reply: aiText, redirected: false });
  } catch (err) {
    console.error('[AI Chat]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
