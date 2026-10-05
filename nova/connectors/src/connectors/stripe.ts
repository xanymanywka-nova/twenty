import {
  ReadOnlyHttpClient,
  type HttpTransport,
} from '../http/read-only-client.js';
import type { Connector, SyncRecord } from '../types.js';

type StripeCharge = {
  id: string;
  amount: number;
  currency: string;
  created: number;
  status: string;
  payment_method_details?: { type?: string };
  metadata?: { reservationId?: string };
};

export const mapStripeCharge = (charge: StripeCharge): SyncRecord => ({
  object: 'payments',
  externalSource: 'stripe',
  externalId: charge.id,
  fields: {
    name: charge.id,
    amount: {
      amountMicros: charge.amount * 10_000,
      currencyCode: charge.currency.toUpperCase(),
    },
    method: charge.payment_method_details?.type ?? 'card',
    provider: 'Stripe',
    date: new Date(charge.created * 1000).toISOString(),
    status: charge.status,
  },
  links: charge.metadata?.reservationId
    ? [
        {
          field: 'stayId',
          object: 'stays',
          externalSource: 'apaleo',
          externalId: charge.metadata.reservationId,
        },
      ]
    : [],
});

export const createStripeConnector = (
  key: string,
  transport: HttpTransport = fetch,
): Connector => ({
  name: 'stripe',
  async *read(context) {
    const client = new ReadOnlyHttpClient(
      'https://api.stripe.com',
      { Authorization: `Bearer ${key}` },
      transport,
    );
    const created =
      !context.full && context.cursor
        ? `&created[gt]=${Math.floor(Date.parse(context.cursor) / 1000)}`
        : '';
    let startingAfter = '';
    for (;;) {
      const page = await client.get<{
        data: StripeCharge[];
        has_more?: boolean;
      }>(`/v1/charges?limit=100${created}${startingAfter}`);
      for (const charge of page.data) yield mapStripeCharge(charge);
      const last = page.data.at(-1);
      if (!page.has_more || !last) break;
      startingAfter = `&starting_after=${encodeURIComponent(last.id)}`;
    }
  },
});
