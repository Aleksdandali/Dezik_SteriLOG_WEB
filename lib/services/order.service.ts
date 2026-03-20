import { OrderRepository, type OrderFilters } from '@/lib/repositories/order.repository';
import type { PaginationParams } from '@/lib/repositories/base';
import { createAdminClient } from '@/lib/supabase/server';

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

  async getFullOrder(id: string) {
    const supabase = await createAdminClient();
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .single();
    if (error || !order) throw new AppError('Замовлення не знайдено', 404);

    const [payments, audit, expenses] = await Promise.all([
      supabase.from('payments').select('*').eq('order_id', id).order('created_at', { ascending: false }),
      supabase.from('order_audit_log').select('*').eq('order_id', id).order('created_at', { ascending: false }).limit(50),
      supabase.from('order_expenses').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    ]);

    return {
      ...order,
      payments: payments.data ?? [],
      audit_log: audit.data ?? [],
      expenses: expenses.data ?? [],
    };
  }

  async getStatusCounts() {
    return this.orders.countByStatus();
  }

  async changeStatus(orderId: string, newStatus: string, userId?: string, userName?: string) {
    const order = await this.getById(orderId);
    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new AppError(`Неможливо змінити статус з "${order.status}" на "${newStatus}"`, 400);
    }

    const timestamps: Record<string, unknown> = {};
    if (newStatus === 'confirmed') timestamps.confirmed_at = new Date().toISOString();
    if (newStatus === 'shipped') timestamps.shipped_at = new Date().toISOString();
    if (newStatus === 'delivered') timestamps.delivered_at = new Date().toISOString();
    if (newStatus === 'canceled') timestamps.canceled_at = new Date().toISOString();

    const updated = await this.orders.updateStatus(orderId, newStatus, timestamps);

    // Audit log
    await this.logAudit(orderId, 'status_change', 'status', order.status, newStatus, userId, userName);

    return updated;
  }

  async addPayment(orderId: string, input: {
    amount: number; method: string; status: string; comment?: string;
  }, userId?: string, userName?: string) {
    const supabase = await createAdminClient();
    const { error } = await supabase.from('payments').insert({
      order_id: orderId,
      amount: input.amount,
      method: input.method,
      status: input.status,
      comment: input.comment,
      paid_at: input.status === 'paid' ? new Date().toISOString() : null,
      created_by: userId,
    });
    if (error) throw new AppError(error.message, 500);

    // Recalculate payment_status
    await this.recalcPaymentStatus(orderId);

    await this.logAudit(orderId, 'payment_added', 'payment', null,
      `${input.amount} ₴ (${input.method})`, userId, userName);
  }

  async addExpense(orderId: string, input: {
    name: string; amount: number; comment?: string;
  }, userId?: string, userName?: string) {
    const supabase = await createAdminClient();
    const { error } = await supabase.from('order_expenses').insert({
      order_id: orderId, ...input, created_by: userId,
    });
    if (error) throw new AppError(error.message, 500);

    await this.logAudit(orderId, 'expense_added', 'expense', null,
      `${input.name}: ${input.amount} ₴`, userId, userName);
  }

  async addComment(orderId: string, comment: string, userId?: string, userName?: string) {
    const supabase = await createAdminClient();
    await supabase.from('orders').update({ manager_comment: comment }).eq('id', orderId);
    await this.logAudit(orderId, 'comment', 'manager_comment', null, comment, userId, userName);
  }

  async updateDelivery(orderId: string, fields: Record<string, unknown>, userId?: string, userName?: string) {
    const supabase = await createAdminClient();
    const { error } = await supabase.from('orders').update(fields).eq('id', orderId);
    if (error) throw new AppError(error.message, 500);

    for (const [key, val] of Object.entries(fields)) {
      await this.logAudit(orderId, 'delivery_update', key, null, String(val ?? ''), userId, userName);
    }
  }

  private async recalcPaymentStatus(orderId: string) {
    const supabase = await createAdminClient();
    const { data: order } = await supabase.from('orders').select('total_amount').eq('id', orderId).single();
    const { data: payments } = await supabase.from('payments').select('amount, status').eq('order_id', orderId);

    const totalPaid = (payments ?? [])
      .filter(p => p.status === 'paid')
      .reduce((s, p) => s + Number(p.amount), 0);

    const total = Number(order?.total_amount ?? 0);
    let paymentStatus = 'unpaid';
    if (totalPaid >= total && total > 0) paymentStatus = 'paid';
    else if (totalPaid > 0) paymentStatus = 'partial';

    await supabase.from('orders').update({
      payment_status: paymentStatus,
      paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', orderId);
  }

  private async logAudit(
    orderId: string, action: string, field: string | null,
    oldVal: string | null, newVal: string | null,
    userId?: string, userName?: string,
  ) {
    const supabase = await createAdminClient();
    await supabase.from('order_audit_log').insert({
      order_id: orderId,
      action,
      field_name: field,
      old_value: oldVal,
      new_value: newVal,
      created_by: userId,
      created_by_name: userName ?? 'Admin',
    });
  }
}

export class AppError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
  }
}
