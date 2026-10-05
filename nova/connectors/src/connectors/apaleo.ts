import {
  ReadOnlyHttpClient,
  type HttpTransport,
} from '../http/read-only-client.js';
import { classifyCustomer } from '../classify.js';
import type { Connector, SyncRecord } from '../types.js';
import {
  companyExternalId,
  guestExternalId,
  nightsBetween,
  phoneValue,
  splitName,
} from '../utils.js';

export type ApaleoProperty = { id: string; name: string; description?: string };
export type ApaleoReservation = {
  id: string;
  bookingId?: string;
  status: string;
  arrival: string;
  departure: string;
  adults?: number;
  channelCode?: string;
  property?: { id: string };
  unit?: { name?: string };
  ratePlan?: { name?: string };
  primaryGuest?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
  };
  booker?: ApaleoBooking['booker'];
  totalGrossAmount?: { amount: number; currency: string };
  balance?: { amount: number; currency: string };
};
export type ApaleoBooking = {
  id: string;
  modified?: string;
  channelCode?: string;
  booker?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    company?: { name?: string };
  };
  reservations?: ApaleoReservation[];
};
export type ApaleoFolio = {
  id: string;
  reservationId?: string;
  reservation?: { id: string };
  payments?: Array<{
    id: string;
    amount: { amount: number; currency: string };
    method?: string;
    paymentDate?: string;
    status?: string;
  }>;
};

const money = (value?: {
  amount: number;
  currency: string;
}): { amountMicros: number; currencyCode: string } => ({
  amountMicros: Math.round((value?.amount ?? 0) * 1_000_000),
  currencyCode: value?.currency ?? 'EUR',
});

export const mapApaleoProperty = (property: ApaleoProperty): SyncRecord => ({
  object: 'properties',
  externalSource: 'apaleo',
  externalId: property.id,
  fields: {
    name: property.name,
    code: property.id,
    type: property.id === 'NBW' ? 'apartments' : 'hotel',
  },
});

export const mapApaleoBooking = (booking: ApaleoBooking): SyncRecord[] => {
  const records: SyncRecord[] = [];
  for (const reservation of booking.reservations ?? []) {
    const rawGuest = reservation.primaryGuest ?? booking.booker ?? {};
    const name = [rawGuest.firstName, rawGuest.lastName]
      .filter(Boolean)
      .join(' ');
    const personId = guestExternalId({
      email: rawGuest.email,
      phone: rawGuest.phone,
      name,
      birthDate: 'dateOfBirth' in rawGuest ? rawGuest.dateOfBirth : undefined,
      fallback: reservation.id,
    });
    const personName = splitName(name);
    records.push({
      object: 'people',
      externalSource: 'guest',
      externalId: personId,
      fields: {
        name: personName,
        birthDate: 'dateOfBirth' in rawGuest ? rawGuest.dateOfBirth : undefined,
        emails: rawGuest.email
          ? {
              primaryEmail: rawGuest.email.toLowerCase(),
              additionalEmails: null,
            }
          : undefined,
        phones: rawGuest.phone ? phoneValue(rawGuest.phone) : undefined,
      },
    });
    if (booking.booker?.company?.name) {
      records.push({
        object: 'companies',
        externalSource: 'company',
        externalId: companyExternalId(booking.booker.company.name),
        fields: {
          name: booking.booker.company.name,
          customerType: classifyCustomer({
            companyName: booking.booker.company.name,
            email: booking.booker.email,
          }).type,
        },
      });
    }
    records.push({
      object: 'stays',
      externalSource: 'apaleo',
      externalId: reservation.id,
      fields: {
        name: reservation.id,
        arrival: reservation.arrival,
        departure: reservation.departure,
        nights: nightsBetween(reservation.arrival, reservation.departure),
        adults: reservation.adults ?? 1,
        status: reservation.status,
        channel: reservation.channelCode ?? booking.channelCode ?? 'Apaleo',
        totalGross: money(reservation.totalGrossAmount),
        balance: money(reservation.balance),
        ratePlan: reservation.ratePlan?.name,
        unit: reservation.unit?.name,
      },
      links: [
        {
          field: 'guestId',
          object: 'people',
          externalSource: 'guest',
          externalId: personId,
        },
        ...(reservation.property?.id
          ? [
              {
                field: 'propertyId',
                object: 'properties' as const,
                externalSource: 'apaleo',
                externalId: reservation.property.id,
              },
            ]
          : []),
        ...(booking.booker?.company?.name
          ? [
              {
                field: 'companyId',
                object: 'companies' as const,
                externalSource: 'company',
                externalId: companyExternalId(booking.booker.company.name),
              },
            ]
          : []),
      ],
    });
  }
  return records;
};

export const mapApaleoFolio = (folio: ApaleoFolio): SyncRecord[] =>
  (folio.payments ?? []).map((payment) => ({
    object: 'payments',
    externalSource: 'apaleo',
    externalId: `${folio.id}:${payment.id}`,
    fields: {
      name: payment.id,
      amount: money(payment.amount),
      method: payment.method ?? 'Apaleo Pay',
      provider: 'Apaleo',
      date: payment.paymentDate,
      status: payment.status ?? 'recorded',
    },
    links:
      folio.reservation?.id || folio.reservationId
        ? [
            {
              field: 'stayId',
              object: 'stays',
              externalSource: 'apaleo',
              externalId:
                folio.reservation?.id ?? (folio.reservationId as string),
            },
          ]
        : [],
  }));

class ApaleoClient {
  private token?: { value: string; expiresAt: number };
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly transport: HttpTransport = fetch,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000)
      return this.token.value;
    const response = await this.transport(
      'https://identity.apaleo.com/connect/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      },
    );
    if (!response.ok)
      throw new Error(`Apaleo OAuth failed with ${response.status}`);
    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }

  async get<TData>(path: string): Promise<TData> {
    const client = new ReadOnlyHttpClient(
      'https://api.apaleo.com',
      { Authorization: `Bearer ${await this.accessToken()}` },
      this.transport,
    );
    return client.get<TData>(path);
  }
}

export const createApaleoConnector = (
  clientId: string,
  clientSecret: string,
  transport: HttpTransport = fetch,
): Connector => ({
  name: 'apaleo',
  async *read(context) {
    const client = new ApaleoClient(clientId, clientSecret, transport);
    const recordsForBooking = async (
      booking: ApaleoBooking,
    ): Promise<SyncRecord[]> => {
      const records = mapApaleoBooking(booking);
      const reservationIds = (booking.reservations ?? []).map(
        (reservation) => reservation.id,
      );
      if (reservationIds.length === 0) return records;
      const folios = await client.get<{ folios: ApaleoFolio[] }>(
        `/finance/v1/folios?reservationIds=${encodeURIComponent(reservationIds.join(','))}&type=Guest&expand=payments&pageSize=500`,
      );
      for (const folio of folios.folios ?? [])
        records.push(...mapApaleoFolio(folio));
      return records;
    };
    const properties = await client.get<{ properties: ApaleoProperty[] }>(
      '/inventory/v1/properties?pageSize=500',
    );
    for (const property of properties.properties)
      yield mapApaleoProperty(property);
    let pageNumber = 1;
    if (!context.full && context.cursor) {
      const modifiedFrom = context.cursor.replace(/\.\d{3}Z$/, 'Z');
      while (true) {
        const page = await client.get<{
          reservations: ApaleoReservation[];
          count: number;
        }>(
          `/booking/v1/reservations?pageSize=500&pageNumber=${pageNumber}&dateFilter=Modification&from=${encodeURIComponent(modifiedFrom)}&expand=booker,assignedUnits,company`,
        );
        for (const reservation of page.reservations) {
          const booking: ApaleoBooking = {
            id: reservation.bookingId ?? reservation.id,
            ...(reservation.booker ? { booker: reservation.booker } : {}),
            reservations: [reservation],
          };
          for (const record of await recordsForBooking(booking)) yield record;
        }
        if (pageNumber * 500 >= page.count || page.reservations.length === 0)
          break;
        pageNumber += 1;
      }
      return;
    }
    while (true) {
      const page = await client.get<{
        bookings: ApaleoBooking[];
        count: number;
      }>(
        `/booking/v1/bookings?pageSize=500&pageNumber=${pageNumber}&expand=reservations`,
      );
      for (const booking of page.bookings)
        for (const record of await recordsForBooking(booking)) yield record;
      if (pageNumber * 500 >= page.count || page.bookings.length === 0) break;
      pageNumber += 1;
    }
  },
});
