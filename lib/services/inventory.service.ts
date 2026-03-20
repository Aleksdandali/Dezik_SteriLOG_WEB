import { StockRepository, type BulkStockUpdate } from '@/lib/repositories/stock.repository';

export interface BulkUpdateResult {
  updated: number;
  errors: Array<{ sku: string; error: string }>;
}

export class InventoryService {
  private stock = new StockRepository();

  /**
   * Bulk update stock quantities by SKU.
   * Sets absolute quantity (not delta) — same as KeyCRM API pattern.
   */
  async bulkUpdate(
    items: BulkStockUpdate[],
    userId?: string,
  ): Promise<BulkUpdateResult> {
    const result: BulkUpdateResult = { updated: 0, errors: [] };

    for (const item of items) {
      try {
        const variant = await this.stock.findVariantBySku(item.sku);
        if (!variant) {
          result.errors.push({ sku: item.sku, error: 'SKU not found' });
          continue;
        }

        // Get current stock to calculate delta
        const available = await this.stock.getAvailable(variant.id);
        const currentWarehouse = available.find(
          (a: { warehouse_id: string }) => a.warehouse_id === item.warehouse_id,
        );
        const currentQty = currentWarehouse?.on_hand ?? 0;
        const delta = item.quantity - currentQty;

        // Update stock
        await this.stock.upsertStock({
          variant_id: variant.id,
          warehouse_id: item.warehouse_id,
          quantity: item.quantity,
          reserved: currentWarehouse?.reserved ?? 0,
        });

        // Log movement
        if (delta !== 0) {
          await this.stock.logMovement({
            variant_id: variant.id,
            warehouse_id: item.warehouse_id,
            type: 'adjustment',
            quantity: delta,
            reason: `Bulk update: ${currentQty} → ${item.quantity}`,
            reference_type: 'import',
            created_by: userId,
          });
        }

        result.updated++;
      } catch (err) {
        result.errors.push({
          sku: item.sku,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /** Get available stock for all variants (for UI) */
  async getStockSummary(warehouseId?: string) {
    const supabase = await new StockRepository()['db']();

    let query = supabase.from('v_stock_available').select('*');
    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    }

    const { data, error } = await query.order('product_name');
    if (error) throw new Error(`InventoryService.getStockSummary: ${error.message}`);
    return data ?? [];
  }
}
