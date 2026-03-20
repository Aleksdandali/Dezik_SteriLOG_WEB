import { InventoryService } from '@/lib/services';
import { json, errorResponse, authenticateAdmin } from '@/lib/api-utils';

/**
 * POST /api/inventory/bulk-update
 * Body: {
 *   items: [{ sku: "DEL-1L", warehouse_id: "uuid", quantity: 100 }, ...]
 * }
 *
 * Sets absolute quantities (like KeyCRM pattern).
 * Returns { updated: number, errors: [{ sku, error }] }
 */
export async function POST(request: Request) {
  try {
    const admin = await authenticateAdmin();
    const body = await request.json();

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return json({ error: 'Missing "items" array in request body' }, 400);
    }

    // Validate each item
    for (const item of body.items) {
      if (!item.sku || !item.warehouse_id || typeof item.quantity !== 'number') {
        return json({ error: `Invalid item: each must have sku, warehouse_id, quantity` }, 400);
      }
      if (item.quantity < 0) {
        return json({ error: `Quantity cannot be negative (sku: ${item.sku})` }, 400);
      }
    }

    const service = new InventoryService();
    const result = await service.bulkUpdate(body.items, admin.id);
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
