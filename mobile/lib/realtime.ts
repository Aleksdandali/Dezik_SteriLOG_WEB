// Mobile Realtime layer — shared `ops` broadcast channel.
//
// Server-side: API routes call `broadcastOps(event, payload)` after every
// relevant write (movement created/confirmed, audit created/reviewed). The
// Supabase HTTP broadcast endpoint forwards the message to all subscribers
// on the `ops` topic.
//
// Mobile-side: one lazy module-level Supabase channel; a tiny event bus on
// top so multiple screens can subscribe to the same event without each one
// opening its own channel. Use the `useOpsEvent` hook from components.
//
// We don't need RLS for this — broadcast is its own transport, independent
// of Postgres rows. The anon key only authenticates the WebSocket connection.

import 'react-native-url-polyfill/auto';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export type OpsEvent =
  | 'movement.pending'
  | 'movement.confirmed'
  | 'audit.created'
  | 'audit.reviewed';

export type OpsPayload = Record<string, unknown>;
type Handler = (payload: OpsPayload) => void;

const ALL_EVENTS: OpsEvent[] = [
  'movement.pending',
  'movement.confirmed',
  'audit.created',
  'audit.reviewed',
];

// ── Singletons (lazy-init on first subscribe) ───────────────────────────
let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let appStateSub: { remove: () => void } | null = null;

const bus = new Map<OpsEvent, Set<Handler>>();
for (const ev of ALL_EVENTS) bus.set(ev, new Set());

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}

function ensureChannel(): RealtimeChannel {
  if (channel) return channel;
  const ch = getClient().channel('ops', {
    config: { broadcast: { self: false, ack: false } },
  });
  for (const ev of ALL_EVENTS) {
    ch.on('broadcast', { event: ev }, msg => {
      const payload = (msg?.payload ?? {}) as OpsPayload;
      const handlers = bus.get(ev);
      if (!handlers) return;
      for (const h of handlers) {
        try { h(payload); } catch (e) { console.error('[realtime]', ev, e); }
      }
    });
  }
  ch.subscribe(status => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      console.warn('[realtime] ops channel', status);
    }
  });

  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && channel) {
        // Reconnect socket if it went stale while backgrounded.
        client?.realtime.connect();
      }
    });
  }

  channel = ch;
  return ch;
}

function teardownIfIdle() {
  const hasListeners = ALL_EVENTS.some(ev => (bus.get(ev)?.size ?? 0) > 0);
  if (hasListeners) return;
  if (channel) {
    getClient().removeChannel(channel);
    channel = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}

/**
 * Subscribe to a broadcast event on the shared `ops` channel.
 * The handler stays referentially stable via a ref so callers can pass
 * inline closures without re-subscribing on every render.
 */
export function useOpsEvent(event: OpsEvent, handler: Handler): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    ensureChannel();
    const wrapped: Handler = payload => ref.current(payload);
    bus.get(event)!.add(wrapped);
    return () => {
      bus.get(event)!.delete(wrapped);
      teardownIfIdle();
    };
  }, [event]);
}

/** Clear realtime state (e.g. on logout). */
export function disposeRealtime(): void {
  for (const set of bus.values()) set.clear();
  if (channel) {
    getClient().removeChannel(channel);
    channel = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  if (client) {
    client.realtime.disconnect();
    client = null;
  }
}
