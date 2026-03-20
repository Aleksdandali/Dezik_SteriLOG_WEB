import { OrderRepository, type OrderFilters } from '@/lib/repositories/order.repository';
import type { PaginationParams } from '@/lib/repositories/base';

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

  async changeStatus(orderId: string, newStatus: string, _userId?: string) {
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

    // TODO: stock reservation/fulfillment when product_variants are set up
    // For now, just update the status

    const updated = await this.orders.updateStatus(orderId, newStatus, timestamps);
    return updated;
  }
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
