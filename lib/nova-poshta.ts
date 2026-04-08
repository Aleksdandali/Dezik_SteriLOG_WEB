const NP_API = 'https://api.novaposhta.ua/v2.0/json/';

// Sender constants (ВІЧЕВ ЮРІЙ ІВАНОВИЧ ФОП)
const SENDER_REF = 'ab411dfd-d22c-11ee-a60f-48df37b921db';
const SENDER_CONTACT_REF = '1ce54e78-f264-11ee-a9e3-48df37b921da';
const SENDER_ADDRESS_REF = '731ecf8a-e389-11e4-8a92-005056887b8d'; // Відділення №95, Грецька площа 3/4
const SENDER_PHONE = '380735331010';

function getKey(): string {
  const key = process.env.NOVA_POSHTA_API_KEY;
  if (!key) throw new Error('NOVA_POSHTA_API_KEY not set');
  return key;
}

async function npCall<T>(modelName: string, calledMethod: string, props: Record<string, unknown>): Promise<T> {
  const res = await fetch(NP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: getKey(),
      modelName,
      calledMethod,
      methodProperties: props,
    }),
  });
  const data = await res.json();
  if (!data.success) {
    const errors = data.errors?.join(', ') ?? 'Unknown NP error';
    throw new Error(`НП: ${errors}`);
  }
  return data.data;
}

export interface TrackingResult {
  Number: string;
  Status: string;
  StatusCode: string;
  WarehouseSender: string;
  WarehouseRecipient: string;
  CityRecipient: string;
  ScheduledDeliveryDate: string;
  ActualDeliveryDate: string;
  RecipientDateTime: string;
}

export async function trackShipment(ttn: string): Promise<TrackingResult> {
  const results = await npCall<TrackingResult[]>('TrackingDocument', 'getStatusDocuments', {
    Documents: [{ DocumentNumber: ttn, Phone: '' }],
  });
  if (!results?.[0]) throw new Error('ТТН не знайдено');
  return results[0];
}

export interface CreateTTNParams {
  recipientName: string;
  recipientPhone: string;
  cityRef: string;
  warehouseRef: string;
  weight?: number;
  description?: string;
  cost?: number;
  paymentMethod?: 'Cash' | 'NonCash';
  payerType?: 'Sender' | 'Recipient';
  afterpayment?: boolean;
  afterpaymentAmount?: number;
}

export interface TTNResult {
  ttn: string;
  ref: string;
  costOnSite: number;
  estimatedDeliveryDate: string;
}

export async function createTTN(params: CreateTTNParams): Promise<TTNResult> {
  // Find or create recipient counterparty
  const recipients = await npCall<{ Ref: string; ContactPerson: { data: { Ref: string }[] } }[]>(
    'Counterparty', 'save', {
      FirstName: params.recipientName.split(' ')[1] || params.recipientName,
      LastName: params.recipientName.split(' ')[0] || '',
      MiddleName: params.recipientName.split(' ').slice(2).join(' ') || '',
      Phone: params.recipientPhone.replace(/\+/g, ''),
      CounterpartyType: 'PrivatePerson',
      CounterpartyProperty: 'Recipient',
    }
  );

  const recipientRef = recipients[0]?.Ref;
  const recipientContactRef = recipients[0]?.ContactPerson?.data?.[0]?.Ref;

  if (!recipientRef || !recipientContactRef) {
    throw new Error('Не вдалось створити отримувача в НП');
  }

  // Build document properties
  const docProps: Record<string, unknown> = {
    PayerType: params.payerType ?? 'Recipient',
    PaymentMethod: params.paymentMethod ?? 'Cash',
    CargoType: 'Parcel',
    Weight: String(params.weight ?? 1),
    ServiceType: 'WarehouseWarehouse',
    SeatsAmount: '1',
    Description: params.description ?? 'Товари Dezik',
    Cost: String(params.cost ?? 300),
    OptionsSeat: [{ volumetricWidth: 30, volumetricLength: 30, volumetricHeight: 20, weight: String(params.weight ?? 1) }],
    CitySender: 'db5c88d0-391c-11dd-90d9-001a92567626', // Одеса
    Sender: SENDER_REF,
    SenderAddress: SENDER_ADDRESS_REF,
    ContactSender: SENDER_CONTACT_REF,
    SendersPhone: SENDER_PHONE,
    CityRecipient: params.cityRef,
    Recipient: recipientRef,
    RecipientAddress: params.warehouseRef,
    ContactRecipient: recipientContactRef,
    RecipientsPhone: params.recipientPhone.replace(/\+/g, ''),
  };

  // Add COD (контроль оплати / наложений платіж) for unpaid orders
  // Uses AfterpaymentOnGoodsCost — the correct NP API parameter for payment control.
  // BackwardDeliveryData with CargoType:'Money' is a different service (зворотна доставка)
  // and requires separate activation; AfterpaymentOnGoodsCost is the standard COD mechanism.
  // IMPORTANT: Requires active NovaPay agreement on your NP account + fresh API key.
  const sameWarehouse = params.warehouseRef === SENDER_ADDRESS_REF;
  if (params.afterpayment && params.afterpaymentAmount && params.afterpaymentAmount > 0 && !sameWarehouse) {
    docProps.AfterpaymentOnGoodsCost = String(params.afterpaymentAmount);
  }

  // Create internet document (TTN)
  const docs = await npCall<{
    IntDocNumber: string;
    Ref: string;
    CostOnSite: string;
    EstimatedDeliveryDate: string;
  }[]>('InternetDocument', 'save', docProps);

  const doc = docs[0];
  if (!doc?.IntDocNumber) {
    throw new Error('НП не повернула номер ТТН');
  }

  return {
    ttn: doc.IntDocNumber,
    ref: doc.Ref,
    costOnSite: parseFloat(doc.CostOnSite) || 0,
    estimatedDeliveryDate: doc.EstimatedDeliveryDate,
  };
}
