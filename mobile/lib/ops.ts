import { api } from './api';
import { API_BASE_URL } from './config';
import { getToken } from './auth';

// Domain types — kept in sync with web /lib/telegram/types.ts.
export type OpsLocation = 'malynovskogo' | 'afina_sklad' | 'afina_ofis' | 'dalnytska';

export type ExpenseCategory =
  | 'paper' | 'glue' | 'film' | 'packaging'
  | 'raw_materials' | 'rent' | 'utilities' | 'other';

export type AuditItemType = 'raw' | 'finished';

export const LOCATION_LABELS: Record<OpsLocation, string> = {
  malynovskogo: 'Маліновського',
  afina_sklad: 'Афіна склад',
  afina_ofis: 'Афіна офіс',
  dalnytska: 'Дальницька',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  paper: 'Папір',
  glue: 'Клей',
  film: 'Плівка',
  packaging: 'Тара',
  raw_materials: 'Сировина',
  rent: 'Оренда',
  utilities: 'Комунальні',
  other: 'Інше',
};

export const AUDIT_UNITS = ['шт', 'кг', 'м', 'рул', 'л', 'уп', 'кор'] as const;

export type AuditItem = {
  item_type: AuditItemType;
  name: string;
  quantity: number;
  unit: string;
  notes?: string | null;
};

// Multipart upload mirrors /api/telegram/upload — field "photo", optional "folder".
// On RN we send a local file URI; fetch turns the object into a real multipart part.
export async function uploadPhoto(uri: string, folder?: string): Promise<string> {
  const token = await getToken();
  const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
  const mime =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    ext === 'heic' ? 'image/heic' :
    ext === 'pdf' ? 'application/pdf' :
    'image/jpeg';

  const form = new FormData();
  // RN-specific FormData file shape (typed loosely on purpose).
  form.append('photo', { uri, name: `upload.${ext}`, type: mime } as unknown as Blob);
  if (folder) form.append('folder', folder);

  const res = await fetch(`${API_BASE_URL}/api/telegram/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'x-telegram-init-data': token } : {},
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

// ── Expenses ───────────────────────────────────────────
export type ExpenseInput = {
  amount: number;
  category: ExpenseCategory;
  location: OpsLocation;
  description?: string | null;
  photo_url: string;
};

export async function createExpense(input: ExpenseInput): Promise<void> {
  await api('/api/telegram/expenses', { method: 'POST', body: input });
}

// ── Inventory audit ────────────────────────────────────
export type AuditInput = {
  location: OpsLocation;
  audit_date?: string; // YYYY-MM-DD, defaults to today server-side
  items: AuditItem[];
};

export async function createAudit(input: AuditInput): Promise<void> {
  await api('/api/telegram/inventory-audit', { method: 'POST', body: input });
}
