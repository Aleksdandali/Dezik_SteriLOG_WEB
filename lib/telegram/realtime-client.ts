'use client';

// Client-side counterpart to lib/telegram/realtime.ts (the server broadcaster).
// Subscribes to the shared `ops` Supabase broadcast topic and fans events out
// to React subscribers. Mirrors the API of mobile/lib/realtime.ts so behaviour
// stays consistent between the iOS app and the Telegram MiniApp.
//
// Broadcast channels don't read Postgres rows — RLS is irrelevant here. The
// anon key only authenticates the websocket connection.

import { useEffect, useRef } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

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

let supabase: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;

const bus = new Map<OpsEvent, Set<Handler>>();
for (const ev of ALL_EVENTS) bus.set(ev, new Set());

function getClient(): SupabaseClient {
  if (!supabase) supabase = createClient();
  return supabase;
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
  ch.subscribe();
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
}

/**
 * Subscribe to a broadcast event on the shared `ops` channel.
 * Handler is wrapped in a ref so inline closures don't re-subscribe.
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
