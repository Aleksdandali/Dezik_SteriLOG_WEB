import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { AppError } from '@/lib/services/order.service';

/** Standard JSON response helpers */
export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return json({ error: err.message }, err.statusCode);
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[API Error]', err);
  return json({ error: message }, 500);
}

/** Auth guard — returns admin user or throws 401 */
export async function authenticateAdmin() {
  try {
    return await requireAdmin();
  } catch {
    throw new AppError('Unauthorized', 401);
  }
}

/** Parse search params into typed filter object */
export function parseSearchParams(url: string) {
  const { searchParams } = new URL(url);
  return {
    status: searchParams.get('status') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo: searchParams.get('dateTo') ?? undefined,
    page: Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)),
    perPage: Math.min(100, Math.max(1, parseInt(searchParams.get('perPage') ?? '50', 10))),
  };
}
