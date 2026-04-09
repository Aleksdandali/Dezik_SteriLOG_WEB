import { OrderService } from '@/lib/services';
import { json, errorResponse, authenticateAdmin } from '@/lib/api-utils';

/**
 * PATCH /api/orders/:id/status
 * Body: { status: "confirmed" | "processing" | "shipped" | "delivered" | "canceled" }
 *
 * Side effects (via OrderService):
 *   confirmed  → reserves stock
 *   shipped    → deducts stock (fulfills reservations)
 *   canceled   → releases reservations
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await authenticateAdmin();
    const { id } = await params;
    const body = await request.json();

    if (!body.status || typeof body.status !== 'string') {
      return json({ error: 'Missing "status" in request body' }, 400);
    }

    const service = new OrderService();
    const order = await service.changeStatus(id, body.status, admin.id);
    return json(order);
  } catch (err) {
    return errorResponse(err);
  }
}
