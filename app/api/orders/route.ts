import { OrderService } from '@/lib/services';
import { json, errorResponse, authenticateAdmin, parseSearchParams } from '@/lib/api-utils';

/**
 * GET /api/orders?status=pending&search=Тест&page=1&perPage=20
 */
export async function GET(request: Request) {
  try {
    await authenticateAdmin();
    const { status, search, dateFrom, dateTo, page, perPage } = parseSearchParams(request.url);

    const service = new OrderService();
    const result = await service.list(
      { status, search, dateFrom, dateTo },
      { page, perPage },
    );

    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
