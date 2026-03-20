import { BaseRepository } from './base';

export interface StockRecord {
  variant_id: string;
  warehouse_id: string;
  quantity: number;
  reserved: number;
}

export interface StockMovementInput {
  variant_id: string;
  warehouse_id: string;
  type: 'in' | 'out' | 'reserve' | 'unreserve' | 'write_off' | 'adjustment';
  quantity: number;
  reason?: string;
  reference_type?: 'order' | 'manual' | 'import';
  reference_id?: string;
  created_by?: string;
}

export interface BulkStockUpdate {
  sku: string;
  warehouse_id: string;
  quantity: number;
}

export class StockRepository extends BaseRepository {
  /** Get available stock view for a variant across all warehouses */
  async getAvailable(variantId: string) {
    const supabase = await this.db();
    const { data, error } = await supabase
      .from('v_stock_available')
      .select('*')
      .eq('variant_id', variantId);

    if (error) throw new Error(`StockRepository.getAvailable: ${error.message}`);
    return data ?? [];
  }

  /** Upsert stock record (set absolute quantity) */
  async upsertStock(record: StockRecord) {
    const supabase = await this.db();
    const { error } = await supabase
      .from('stocks')
      .upsert(
        {
          variant_id: record.variant_id,
          warehouse_id: record.warehouse_id,
          quantity: record.quantity,
          reserved: record.reserved,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'variant_id,warehouse_id' },
      );

    if (error) throw new Error(`StockRepository.upsertStock: ${error.message}`);
  }

  /** Adjust stock quantity by delta (+ or -) */
  async adjustQuantity(variantId: string, warehouseId: string, delta: number) {
    const supabase = await this.db();

    // Get current stock
    const { data: current } = await supabase
      .from('stocks')
      .select('quantity, reserved')
      .eq('variant_id', variantId)
      .eq('warehouse_id', warehouseId)
      .single();

    const currentQty = current?.quantity ?? 0;
    const currentRes = current?.reserved ?? 0;

    await this.upsertStock({
      variant_id: variantId,
      warehouse_id: warehouseId,
      quantity: currentQty + delta,
      reserved: currentRes,
    });
  }

  /** Adjust reserved count */
  async adjustReserved(variantId: string, warehouseId: string, delta: number) {
    const supabase = await this.db();

    const { data: current } = await supabase
      .from('stocks')
      .select('quantity, reserved')
      .eq('variant_id', variantId)
      .eq('warehouse_id', warehouseId)
      .single();

    const currentQty = current?.quantity ?? 0;
    const currentRes = current?.reserved ?? 0;

    await this.upsertStock({
      variant_id: variantId,
      warehouse_id: warehouseId,
      quantity: currentQty,
      reserved: currentRes + delta,
    });
  }

  /** Log a stock movement */
  async logMovement(input: StockMovementInput) {
    const supabase = await this.db();
    const { error } = await supabase.from('stock_movements').insert(input);
    if (error) throw new Error(`StockRepository.logMovement: ${error.message}`);
  }

  /** Find variant by SKU */
  async findVariantBySku(sku: string) {
    const supabase = await this.db();
    const { data, error } = await supabase
      .from('product_variants')
      .select('id, sku, name, product_id')
      .eq('sku', sku)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`StockRepository.findVariantBySku: ${error.message}`);
    }
    return data;
  }

  /** Create stock reservation for an order */
  async createReservation(input: {
    order_id: string;
    variant_id: string;
    warehouse_id: string;
    quantity: number;
  }) {
    const supabase = await this.db();
    const { error } = await supabase.from('stock_reservations').insert({
      ...input,
      status: 'active',
    });
    if (error) throw new Error(`StockRepository.createReservation: ${error.message}`);
  }

  /** Release all active reservations for an order */
  async releaseReservations(orderId: string) {
    const supabase = await this.db();

    // Get active reservations
    const { data: reservations } = await supabase
      .from('stock_reservations')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'active');

    if (!reservations?.length) return;

    // Release each reservation
    for (const res of reservations) {
      await this.adjustReserved(res.variant_id, res.warehouse_id, -res.quantity);
      await this.logMovement({
        variant_id: res.variant_id,
        warehouse_id: res.warehouse_id,
        type: 'unreserve',
        quantity: -res.quantity,
        reason: 'Order canceled',
        reference_type: 'order',
        reference_id: orderId,
      });
    }

    // Mark reservations as released
    await supabase
      .from('stock_reservations')
      .update({ status: 'released', released_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('status', 'active');
  }

  /** Fulfill reservations (convert reserve → actual deduction) */
  async fulfillReservations(orderId: string) {
    const supabase = await this.db();

    const { data: reservations } = await supabase
      .from('stock_reservations')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'active');

    if (!reservations?.length) return;

    for (const res of reservations) {
      // Decrease on-hand, decrease reserved
      await this.adjustQuantity(res.variant_id, res.warehouse_id, -res.quantity);
      await this.adjustReserved(res.variant_id, res.warehouse_id, -res.quantity);
      await this.logMovement({
        variant_id: res.variant_id,
        warehouse_id: res.warehouse_id,
        type: 'out',
        quantity: -res.quantity,
        reason: 'Order shipped',
        reference_type: 'order',
        reference_id: orderId,
      });
    }

    await supabase
      .from('stock_reservations')
      .update({ status: 'fulfilled' })
      .eq('order_id', orderId)
      .eq('status', 'active');
  }
}
