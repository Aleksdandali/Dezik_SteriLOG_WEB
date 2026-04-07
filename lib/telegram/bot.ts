const BOT_API = 'https://api.telegram.org/bot';

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return token;
}

async function callApi(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${BOT_API}${getToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    reply_markup?: unknown;
    parse_mode?: 'HTML' | 'Markdown';
  }
) {
  return callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: options?.parse_mode ?? 'HTML',
    ...options,
  });
}


export async function deleteMessage(chatId: number, messageId: number) {
  try {
    await callApi('deleteMessage', { chat_id: chatId, message_id: messageId });
  } catch {}
}

export async function setWebhook(url: string) {
  return callApi('setWebhook', {
    url,
    allowed_updates: ['message'],
  });
}

/** Send /start response with Mini App button */
export async function sendStartMessage(chatId: number, webAppUrl: string) {
  return sendMessage(chatId, '👋 Вітаю! Натисни кнопку нижче, щоб відкрити панель.', {
    reply_markup: {
      inline_keyboard: [[
        {
          text: '📊 Відкрити Dezik Ops',
          web_app: { url: webAppUrl },
        },
      ]],
    },
  });
}
