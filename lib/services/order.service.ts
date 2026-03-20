import { OrderRepository, type OrderFilters } from '@/lib/repositories/order.repository';
import { StockRepository } from '@/lib/repositories/stock.repository';
import type { PaginationParams } from '@/lib/repositories/base';

/**
 * Order status machine:
 *   pending → confirmed → processing → shipped → delivered
 *   pending → canceled
 *   confirmed → canceled
 *
 * Stock effects:
 *   confirmed  → reserve stock
 *   shipped    → fulfill reservations (deduct from on-hand)
 *   canceled   → release reservations
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:    ['confirmed', 'canceled'],
  confirmed:  ['processing', 'canceled'],
  processing: ['shipped', 'canceled'],
  shipped:    ['delivered'],
  delivered:  [],
  canceled:   [],
};

export class OrderService {
  private orders = new OrderRepository();
  private stock = new StockRepository();

  async list(filters: OrderFilters, pagination: PaginationParams) {
    return this.orders.findMany(filters, pagination);
  }

  async getById(id: string) {
    const order = await this.orders.findById(id);
    if (!order) throw new AppError('Замовлення не знайдено', 404);
    return order;
  }

  async getStatusCounts() {
    return this.orders.countByStatus();
  }

  async changeStatus(orderId: string, newStatus: string, userId?: string) {
    const order = await this.getById(orderId);

    // Validate transition
    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new AppError(
        `Неможливо змінити статус з "${order.status}" на "${newStatus}"`,
        400,
      );
    }

    // Timestamp fields
    const timestamps: Record<string, unknown> = {};
    if (newStatus === 'confirmed') timestamps.confirmed_at = new Date().toISOString();
    if (newStatus === 'shipped') timestamps.shipped_at = new Date().toISOString();
    if (newStatus === 'delivered') timestamps.delivered_at = new Date().toISOString();
    if (newStatus === 'canceled') timestamps.canceled_at = new Date().toISOString();

    // Stock side-effects
    await this.handleStockEffect(order, newStatus, userId);

    // Persist
    const updated = await this.orders.updateStatus(orderId, newStatus, timestamps);
    return updated;
  }

  private async handleStockEffect(
    order: { id: string; order_items?: Array<{ variant_id?: string | null; quantity: number }> },
    newStatus: string,
    _userId?: string,
  ) {
    // Only process if order has items with variant_id
    const itemsWithVariants = order.order_items?.filter(i => i.variant_id) ?? [];
    if (itemsWithVariants.length === 0) return;

    switch (newStatus) {
      case 'confirmed': {
        // Reserve stock for each item
        // Get default warehouse
        for (const item of itemsWithVariants) {
          const warehouseId = await this.getDefaultWarehouseId();
          await this.stock.adjustReserved(item.variant_id!, warehouseId, item.quantity);
          await this.stock.createReservation({
            order_id: order.id,
            variant_id: item.variant_id!,
            warehouse_id: warehouseId,
            quantity: item.quantity,
          });
          await this.stock.logMovement({
            variant_id: item.variant_id!,
            warehouse_id: warehouseId,
            type: 'reserve',
            quantity: item.quantity,
            reason: 'Order confirmed',
            reference_type: 'order',
            reference_id: order.id,
          });
        }
        break;
      }
      case 'shipped': {
        await this.stock.fulfillReservations(order.id);
        break;
      }
      case 'canceled': {
        await this.stock.releaseReservations(order.id);
        break;
      }
    }
  }

  private async getDefaultWarehouseId(): Promise<string> {
    const supabase = await new StockRepository()['db']();
    const { data } = await supabase
      .from('warehouses')
      .select('id')
      .eq('is_default', true)
      .single();
    return data?.id ?? '';
  }
}

/** Application error with HTTP status code */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
