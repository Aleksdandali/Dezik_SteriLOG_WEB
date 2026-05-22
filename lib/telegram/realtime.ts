// Server-side broadcast helper for the shared `ops` Realtime channel.
// Uses Supabase's HTTP broadcast endpoint with the service-role key so we can
// fire events from API routes without subscribing first. Fire-and-forget —
// failures are logged but never block the actual mutation.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type OpsEvent =
  | 'movement.pending'      // new pending shipment created
  | 'movement.confirmed'    // pending shipment(s) confirmed
  | 'audit.created'         // new inventory audit submitted
  | 'audit.reviewed';       // audit approved/rejected by admin

export async function broadcastOps(
  event: OpsEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ topic: 'ops', event, payload, private: false }],
      }),
    });
  } catch (e) {
    console.error('[realtime] broadcast failed', event, e);
  }
}
