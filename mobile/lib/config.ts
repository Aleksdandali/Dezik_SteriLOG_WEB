/**
 * Runtime config.
 *
 * For local dev, override via .env.local + expo-constants, or just edit this file.
 * Backend lives in the sibling `dezik-admin` Next.js project.
 */
export const API_BASE_URL = 'https://dezik-admin.vercel.app';

// Supabase Realtime (anon key — safe for client bundles).
// Used only for broadcast subscriptions on the shared `ops` channel.
export const SUPABASE_URL = 'https://csshbetufyocutdislkn.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzc2hiZXR1ZnlvY3V0ZGlzbGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDQ4MjAsImV4cCI6MjA4ODg4MDgyMH0.QUm7jActUqQeYAMLo-pC30AX-PPgFpyy4fhaMGb7vMQ';

/** Storage keys for SecureStore */
export const STORAGE = {
  AUTH_TOKEN: 'dezik.auth.token',
  STAFF: 'dezik.auth.staff',
  PUSH_TOKEN: 'dezik.push.token',
  DASHBOARD_SNAPSHOT: 'dezik.dashboard.snapshot',
  FOP_DOCS: 'dezik.fop.docs',
  /** All in-flight audit drafts as a single JSON object keyed by `${location}::${itemType}`. */
  AUDIT_DRAFTS: 'dezik.audit.drafts',
} as const;
