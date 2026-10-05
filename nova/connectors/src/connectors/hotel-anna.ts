import type { Connector, SyncRecord } from '../types.js';
import {
  guestExternalId,
  nightsBetween,
  phoneValue,
  richText,
  splitName,
} from '../utils.js';
import { openReadOnlyDatabase, queryRows } from './sqlite.js';

export type HotelReservation = {
  id: string;
  propertyId: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  totalPrice: number;
  status: string;
  apaleoId?: string;
  createdAt?: string;
};
export type PageView = {
  id: string;
  propertyId: string;
  referrer?: string;
  visitorId?: string;
  createdAt: string;
};

export const mapHotelReservation = (
  reservation: HotelReservation,
): SyncRecord[] => {
  const personId = guestExternalId({
    email: reservation.guestEmail,
    phone: reservation.guestPhone,
    name: reservation.guestName,
    fallback: reservation.id,
  });
  return [
    {
      object: 'people',
      externalSource: 'guest',
      externalId: personId,
      fields: {
        name: splitName(reservation.guestName),
        emails: {
          primaryEmail: reservation.guestEmail.toLowerCase(),
          additionalEmails: null,
        },
        phones: reservation.guestPhone
          ? phoneValue(reservation.guestPhone)
          : undefined,
      },
    },
    {
      object: 'stays',
      externalSource: reservation.apaleoId ? 'apaleo' : 'hotel-anna',
      externalId: reservation.apaleoId ?? reservation.id,
      fields: {
        name: reservation.apaleoId ?? reservation.id,
        arrival: reservation.checkIn.slice(0, 10),
        departure: reservation.checkOut.slice(0, 10),
        nights: nightsBetween(reservation.checkIn, reservation.checkOut),
        adults: reservation.adults,
        status: reservation.status,
        channel: 'direct-web',
        totalGross: {
          amountMicros: Math.round(reservation.totalPrice * 1_000_000),
          currencyCode: 'EUR',
        },
      },
      links: [
        {
          field: 'guestId',
          object: 'people',
          externalSource: 'guest',
          externalId: personId,
        },
        {
          field: 'propertyId',
          object: 'properties',
          externalSource: 'apaleo',
          externalId: reservation.propertyId,
        },
      ],
    },
  ];
};

export const aggregatePageViews = (
  rows: PageView[],
  reservations: HotelReservation[] = [],
): SyncRecord[] => {
  const groups = new Map<
    string,
    {
      propertyId: string;
      date: string;
      views: number;
      visitors: Set<string>;
      referrers: Map<string, number>;
      bookings: number;
    }
  >();
  for (const row of rows) {
    const date = row.createdAt.slice(0, 10);
    const key = `${row.propertyId}:${date}`;
    const group = groups.get(key) ?? {
      propertyId: row.propertyId,
      date,
      views: 0,
      visitors: new Set(),
      referrers: new Map(),
      bookings: 0,
    };
    group.views += 1;
    if (row.visitorId) group.visitors.add(row.visitorId);
    if (row.referrer)
      group.referrers.set(
        row.referrer,
        (group.referrers.get(row.referrer) ?? 0) + 1,
      );
    groups.set(key, group);
  }
  for (const reservation of reservations) {
    if (!reservation.createdAt) continue;
    const date = reservation.createdAt.slice(0, 10);
    const key = `${reservation.propertyId}:${date}`;
    const group = groups.get(key) ?? {
      propertyId: reservation.propertyId,
      date,
      views: 0,
      visitors: new Set(),
      referrers: new Map(),
      bookings: 0,
    };
    group.bookings += 1;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    object: 'webStats',
    externalSource: 'hotel-anna',
    externalId: `${group.propertyId}:${group.date}`,
    fields: {
      name: `${group.propertyId} ${group.date}`,
      date: group.date,
      pageViews: group.views,
      visitors: group.visitors.size,
      topReferrers: richText(
        JSON.stringify(
          [...group.referrers.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 10),
        ),
      ),
      bookingsFromWeb: group.bookings,
    },
    links: [
      {
        field: 'propertyId',
        object: 'properties',
        externalSource: 'apaleo',
        externalId: group.propertyId,
      },
    ],
  }));
};

export const createHotelAnnaConnector = (path: string): Connector => ({
  name: 'hotel-anna',
  async *read(context) {
    const database = openReadOnlyDatabase(path);
    try {
      const clause =
        !context.full && context.cursor ? ' WHERE updatedAt > ?' : '';
      const reservations = queryRows<HotelReservation>(
        database,
        `SELECT id, propertyId, guestName, guestEmail, guestPhone, checkIn, checkOut, adults, totalPrice, status, apaleoId, createdAt FROM Reservation${clause}`,
        ...(context.cursor ? [context.cursor] : []),
      );
      for (const reservation of reservations)
        for (const record of mapHotelReservation(reservation)) yield record;
      const views = queryRows<PageView>(
        database,
        'SELECT id, propertyId, referrer, visitorId, createdAt FROM PageView',
      );
      for (const record of aggregatePageViews(views, reservations))
        yield record;
    } finally {
      database.close();
    }
  },
});
