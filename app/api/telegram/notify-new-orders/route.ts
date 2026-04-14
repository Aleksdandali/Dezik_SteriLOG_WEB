import { NextResponse } from 'next/server';

// DISABLED — broken dedup caused SMS spam (2026-04-13 incident)
// DO NOT re-enable without fixing ops_notifications table (add reference_id column)
export async function GET() {
  return NextResponse.json({ disabled: true, reason: 'SMS dedup broken' });
}
