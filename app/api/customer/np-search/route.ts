import { NextRequest, NextResponse } from 'next/server';

const NP_API = 'https://api.novaposhta.ua/v2.0/json/';

async function npCall(model: string, method: string, props: Record<string, unknown>) {
  const res = await fetch(NP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.NOVA_POSHTA_API_KEY,
      modelName: model,
      calledMethod: method,
      methodProperties: props,
    }),
  });
  const data = await res.json();
  return data.data ?? [];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'city' or 'warehouse'
  const query = searchParams.get('q') ?? '';
  const cityRef = searchParams.get('city_ref') ?? '';

  try {
    if (type === 'city' && query.length >= 2) {
      const cities = await npCall('Address', 'getCities', { FindByString: query, Limit: '10' });
      return NextResponse.json({
        data: cities.map((c: { Ref: string; Description: string; AreaDescription: string }) => ({
          ref: c.Ref,
          name: c.Description,
          area: c.AreaDescription,
        })),
      });
    }

    if (type === 'warehouse' && cityRef) {
      const warehouses = await npCall('Address', 'getWarehouses', {
        CityRef: cityRef,
        FindByString: query,
        Limit: '20',
      });
      return NextResponse.json({
        data: warehouses.map((w: { Ref: string; Description: string; Number: string }) => ({
          ref: w.Ref,
          name: w.Description,
          number: w.Number,
        })),
      });
    }

    return NextResponse.json({ data: [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
