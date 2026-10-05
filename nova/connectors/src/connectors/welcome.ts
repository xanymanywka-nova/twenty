import {
  ReadOnlyHttpClient,
  type HttpTransport,
} from '../http/read-only-client.js';
import type { Connector, SyncRecord } from '../types.js';
import {
  guestExternalId,
  phoneValue,
  platformKey,
  primaryLink,
  ratingOutOfTen,
  richText,
  splitName,
} from '../utils.js';

type WelcomeRow = Record<string, unknown> & { id: string };

export const WELCOME_TABLE_CONFIGS = [
  { table: 'channex_reviews', schema: 'insights', cursor: 'updated_at' },
  { table: 'channex_threads', schema: 'insights', cursor: 'updated_at' },
  { table: 'trengo_threads', schema: 'insights', cursor: 'updated_at' },
  { table: 'call_log', schema: 'insights', cursor: 'updated_at' },
  {
    table: 'apaleo_pay_transactions',
    schema: 'controlling',
    cursor: 'ingested_at',
  },
  { table: 'sumup_transactions', schema: 'controlling', cursor: 'ingested_at' },
  { table: 'bank_transactions', schema: 'controlling', cursor: 'synced_at' },
  { table: 'ota_payouts', schema: 'controlling', cursor: 'updated_at' },
] as const;

export const WELCOME_TABLES = [
  ...WELCOME_TABLE_CONFIGS.map(({ table }) => table),
  'channex_property_map',
];
type WelcomeTable = (typeof WELCOME_TABLE_CONFIGS)[number]['table'];

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
const number = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;
const boolean = (value: unknown): boolean => value === true;
const externalKey = (row: WelcomeRow): string =>
  text(row.id) ??
  text(row.transaction_id) ??
  text(row.transaction_code) ??
  text(row.payout_id) ??
  String(row.id);

export const mapWelcomeRow = (
  table: WelcomeTable,
  row: WelcomeRow,
): SyncRecord[] => {
  if (table === 'channex_reviews') {
    const guestName = text(row.reviewer_name);
    const personId = guestExternalId({ name: guestName, fallback: row.id });
    const platform = text(row.ota) ?? 'Unknown';
    const propertyId = text(row.apaleo_property_id);
    const stayId = text(row.apaleo_reservation_id);
    return [
      {
        object: 'people',
        externalSource: 'guest',
        externalId: personId,
        fields: { name: splitName(guestName) },
      },
      {
        object: 'reviews',
        externalSource: `review:${platformKey(platform)}`,
        externalId: text(row.ota_review_id) ?? row.id,
        fields: {
          name: `${platform} review`,
          platform,
          rating: ratingOutOfTen(number(row.overall_score) ?? 0),
          text: richText(text(row.content)),
          publishedAt: text(row.received_at),
          replied: boolean(row.is_replied),
        },
        links: [
          {
            field: 'guestId',
            object: 'people',
            externalSource: 'guest',
            externalId: personId,
          },
          ...(propertyId
            ? [
                {
                  field: 'propertyId',
                  object: 'properties' as const,
                  externalSource: 'apaleo',
                  externalId: propertyId,
                },
              ]
            : []),
          ...(stayId
            ? [
                {
                  field: 'stayId',
                  object: 'stays' as const,
                  externalSource: 'apaleo',
                  externalId: stayId,
                },
              ]
            : []),
        ],
      },
    ];
  }
  if (table === 'channex_threads' || table === 'trengo_threads') {
    const guestName = text(row.guest_name);
    const phone = text(row.contact_phone);
    const personId = guestExternalId({
      phone,
      name: guestName,
      fallback: row.id,
    });
    return [
      {
        object: 'people',
        externalSource: 'guest',
        externalId: personId,
        fields: {
          name: splitName(guestName),
          phones: phone ? phoneValue(phone) : undefined,
        },
      },
      {
        object: 'conversations',
        externalSource: `welcome-${table}`,
        externalId:
          table === 'trengo_threads'
            ? String(row.trengo_ticket_id ?? row.id)
            : row.id,
        fields: {
          name: text(row.last_message) ?? guestName ?? row.id,
          channel: table === 'trengo_threads' ? 'WhatsApp' : 'OTA message',
          lastMessageAt: text(row.last_message_at),
          direction: text(row.last_message_sender),
          sourceLink: primaryLink(text(row.source_link)),
        },
        links: [
          {
            field: 'guestId',
            object: 'people',
            externalSource: 'guest',
            externalId: personId,
          },
        ],
      },
    ];
  }
  if (table === 'call_log') {
    const phone =
      text(row.contact_phone_key) ??
      text(row.from_number) ??
      text(row.to_number);
    const personId = guestExternalId({
      phone,
      name: text(row.guest_name),
      fallback: row.id,
    });
    return [
      {
        object: 'people',
        externalSource: 'guest',
        externalId: personId,
        fields: { name: splitName(text(row.guest_name)) },
      },
      {
        object: 'conversations',
        externalSource: 'welcome-yeastar',
        externalId: text(row.call_id) ?? row.id,
        fields: {
          name: `Phone ${text(row.direction) ?? ''}`.trim(),
          channel: 'phone',
          lastMessageAt: text(row.ended_at) ?? text(row.started_at),
          direction: text(row.direction),
          duration: number(row.duration_seconds),
        },
        links: [
          {
            field: 'guestId',
            object: 'people',
            externalSource: 'guest',
            externalId: personId,
          },
        ],
      },
    ];
  }
  const provider: Record<string, string> = {
    apaleo_pay_transactions: 'Apaleo Pay',
    sumup_transactions: 'SumUp',
    bank_transactions: 'bank',
    ota_payouts: 'OTA payout',
  };
  const reservationId = text(row.reservation_id);
  const key =
    table === 'apaleo_pay_transactions' && text(row.folio_id)
      ? `${text(row.folio_id)}:${externalKey(row)}`
      : externalKey(row);
  const amountMicros =
    table === 'ota_payouts'
      ? (number(row.net_total_cents) ?? 0) * 10_000
      : Math.round((number(row.amount) ?? 0) * 1_000_000);
  return [
    {
      object: 'payments',
      externalSource:
        table === 'apaleo_pay_transactions' ? 'apaleo' : `welcome-${table}`,
      externalId: key,
      fields: {
        name: key,
        amount: { amountMicros, currencyCode: text(row.currency) ?? 'EUR' },
        method: text(row.method) ?? provider[table],
        provider: provider[table],
        date:
          text(row.payment_date) ??
          text(row.payout_date) ??
          text(row.booking_date) ??
          text(row.timestamp),
        status: text(row.status) ?? text(row.bank_match_status) ?? 'recorded',
      },
      links: reservationId
        ? [
            {
              field: 'stayId',
              object: 'stays',
              externalSource: 'apaleo',
              externalId: reservationId,
            },
          ]
        : [],
    },
  ];
};

export const createWelcomeConnector = (
  url: string,
  key: string,
  transport: HttpTransport = fetch,
): Connector => ({
  name: 'welcome',
  async *read(context) {
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    };
    const insightsClient = new ReadOnlyHttpClient(
      `${url.replace(/\/$/, '')}/rest/v1/`,
      { ...headers, 'Accept-Profile': 'insights' },
      transport,
    );
    const propertyRows = await insightsClient.get<
      Array<{ channex_property_id: string; apaleo_property_id: string }>
    >('channex_property_map?select=channex_property_id,apaleo_property_id');
    const propertyMap = new Map(
      propertyRows.map((row) => [
        row.channex_property_id,
        row.apaleo_property_id,
      ]),
    );
    for (const {
      table,
      schema,
      cursor: cursorColumn,
    } of WELCOME_TABLE_CONFIGS) {
      const client = new ReadOnlyHttpClient(
        `${url.replace(/\/$/, '')}/rest/v1/`,
        { ...headers, 'Accept-Profile': schema },
        transport,
      );
      const cursor =
        !context.full && context.cursor
          ? `&${cursorColumn}=gt.${encodeURIComponent(context.cursor)}`
          : '';
      let offset = 0;
      while (true) {
        const rows = await client.get<WelcomeRow[]>(
          `${table}?select=*&limit=1000&offset=${offset}${cursor}`,
        );
        for (const row of rows) {
          const channexPropertyId =
            text(row.property_id) ?? text(row.channex_property_id);
          const enrichedRow =
            channexPropertyId && propertyMap.has(channexPropertyId)
              ? {
                  ...row,
                  apaleo_property_id: propertyMap.get(channexPropertyId),
                }
              : row;
          for (const record of mapWelcomeRow(table, enrichedRow)) yield record;
        }
        if (rows.length < 1000) break;
        offset += rows.length;
      }
    }
  },
});
