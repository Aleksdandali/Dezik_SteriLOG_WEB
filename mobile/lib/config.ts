/**
 * Runtime config.
 *
 * For local dev, override via .env.local + expo-constants, or just edit this file.
 * Backend lives in the sibling `dezik-admin` Next.js project.
 */
export const API_BASE_URL = 'https://dezik-admin.vercel.app';

/** Storage keys for SecureStore */
export const STORAGE = {
  AUTH_TOKEN: 'dezik.auth.token',
  STAFF: 'dezik.auth.staff',
  PUSH_TOKEN: 'dezik.push.token',
  DASHBOARD_SNAPSHOT: 'dezik.dashboard.snapshot',
} as const;
