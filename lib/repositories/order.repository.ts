import { BaseRepository, type PaginatedResult, type PaginationParams } from './base';
import type { Order } from '@/lib/types';

export interface OrderFilters {
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class OrderRepository extends BaseRepository {
  async findMany(
    filters: OrderFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Order>> {
    const supabase = await this.db();
    const { page, perPage } = pagination;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let query = supabase
      .from('orders')
      .select('*, order_items(*)', { count: 'exact' });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.search) {
      const s = `%${filters.search}%`;
      query = query.or(
        `first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},np_ttn.ilike.${s},city_name.ilike.${s}`,
      );
    }

    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error(`OrderRepository.findMany: ${error.message}`);

    const total = count ?? 0;
    return {
      data: (data ?? []) as Order[],
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async findById(id: string): Promise<Order | null> {
    const supabase = await this.db();
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`OrderRepository.findById: ${error.message}`);
    }

    return data as Order | null;
  }

  async updateStatus(
    id: string,
    status: string,
    extra: Record<string, unknown> = {},
  ): Promise<Order> {
    const supabase = await this.db();
    const { data, error } = await supabase
      .from('orders')
      .update({ status, ...extra })
      .eq('id', id)
      .select('*, order_items(*)')
      .single();

    if (error) throw new Error(`OrderRepository.updateStatus: ${error.message}`);
    return data as Order;
  }

  async countByStatus(): Promise<Record<string, number>> {
    const supabase = await this.db();
    const { data, error } = await supabase
      .from('orders')
      .select('status');

    if (error) throw new Error(`OrderRepository.countByStatus: ${error.message}`);

    const counts: Record<string, number> = {};
    (data ?? []).forEach((row: { status: string }) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
    });
    return counts;
  }
}
