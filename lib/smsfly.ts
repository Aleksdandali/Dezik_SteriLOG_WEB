const API_URL = 'https://sms-fly.ua/api/v2/api.php';

function getKey(): string {
  const key = process.env.SMSFLY_API_KEY;
  if (!key) throw new Error('SMSFLY_API_KEY not set');
  return key;
}

export async function sendSMS(phone: string, text: string): Promise<{ success: boolean; messageId?: string; cost?: number }> {
  // Normalize phone: ensure 380XXXXXXXXX format
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0') && p.length === 10) p = `38${p}`;
  if (!p.startsWith('380')) p = `380${p}`;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth: { key: getKey() },
        action: 'SENDMESSAGE',
        data: {
          recipient: p,
          channels: ['sms'],
          sms: { source: 'DEZIK', text },
        },
      }),
    });

    const data = await res.json();
    if (data.success) {
      return {
        success: true,
        messageId: data.data?.messageID,
        cost: parseFloat(data.data?.sms?.cost) || 0,
      };
    }
    console.error('[SMS Fly] Error:', data.error);
    return { success: false };
  } catch (err) {
    console.error('[SMS Fly] Failed:', err);
    return { success: false };
  }
}

/** Safe version — never throws */
export async function sendSMSSafe(phone: string, text: string): Promise<void> {
  try { await sendSMS(phone, text); } catch {}
}
