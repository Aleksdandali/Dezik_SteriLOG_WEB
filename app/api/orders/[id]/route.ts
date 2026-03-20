import { OrderService } from '@/lib/services';
import { json, errorResponse, authenticateAdmin } from '@/lib/api-utils';

/**
 * GET /api/orders/:id
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authenticateAdmin();
    const { id } = await params;
    const service = new OrderService();
    const order = await service.getById(id);
    return json(order);
  } catch (err) {
    return errorResponse(err);
  }
}
