import * as SecureStore from 'expo-secure-store';
import { STORAGE } from './config';

export type Staff = {
  id: string;
  telegram_id: number;
  name: string;
  role: 'admin' | 'manager' | 'operator' | string;
  location?: string | null;
  visible_sections?: string[];
};

/**
 * Auth token storage. Staff log in by sending a code to the Telegram bot,
 * receive a JWT-like token, then we keep it in SecureStore (Keychain on iOS,
 * Keystore on Android).
 *
 * ⚠️ Backend gap: there is no token-issuing endpoint yet. Staff API endpoints
 * (`/api/telegram/*`) currently authenticate via `x-telegram-init-data` which
 * only exists inside Telegram WebApp. See mobile/README.md → "Backend gaps".
 */

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE.AUTH_TOKEN);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE.AUTH_TOKEN, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE.AUTH_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE.STAFF);
}

export async function getStaff(): Promise<Staff | null> {
  const raw = await SecureStore.getItemAsync(STORAGE.STAFF);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Staff;
  } catch {
    return null;
  }
}

export async function setStaff(staff: Staff): Promise<void> {
  await SecureStore.setItemAsync(STORAGE.STAFF, JSON.stringify(staff));
}
