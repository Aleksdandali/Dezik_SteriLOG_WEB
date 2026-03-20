import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Base repository — provides admin Supabase client.
 * All DB access goes through repositories, never directly from components.
 */
export abstract class BaseRepository {
  protected client: SupabaseClient | null = null;

  protected async db(): Promise<SupabaseClient> {
    if (!this.client) {
      this.client = await createAdminClient();
    }
    return this.client;
  }
}

/** Pagination params used across all list endpoints */
export interface PaginationParams {
  page: number;
  perPage: number;
}

/** Standard paginated response */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
