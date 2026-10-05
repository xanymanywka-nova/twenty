import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  mapApaleoBooking,
  mapApaleoFolio,
  mapApaleoProperty,
} from '../src/connectors/apaleo.js';
import {
  mapHotelReservation,
  aggregatePageViews,
} from '../src/connectors/hotel-anna.js';
import { mapLegacyCustomer } from '../src/connectors/legacy.js';
import { mapBedsListings } from '../src/connectors/nova-beds.js';
import { mapMonitorReview } from '../src/connectors/review-monitor.js';
import { mapStripeCharge } from '../src/connectors/stripe.js';
import { mapWelcomeRow, WELCOME_TABLES } from '../src/connectors/welcome.js';
import { openReadOnlyDatabase } from '../src/connectors/sqlite.js';

test('maps Apaleo property, reservation and folio', () => {
  assert.equal(
    mapApaleoProperty({ id: 'HHA', name: 'Hotel Anna' }).externalId,
    'HHA',
  );
  const booking = mapApaleoBooking({
    id: 'B1',
    booker: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
    },
    reservations: [
      {
        id: 'R1',
        status: 'Confirmed',
        arrival: '2026-01-01',
        departure: '2026-01-03',
        property: { id: 'HHA' },
        totalGrossAmount: { amount: 200, currency: 'EUR' },
      },
    ],
  });
  assert.deepEqual(
    booking.map((record) => record.object),
    ['people', 'stays'],
  );
  assert.equal(booking[1]?.fields.nights, 2);
  assert.equal(
    mapApaleoFolio({
      id: 'F1',
      reservationId: 'R1',
      payments: [{ id: 'PAY1', amount: { amount: 200, currency: 'EUR' } }],
    })[0]?.object,
    'payments',
  );
});

test('maps legacy CRM customer', () => {
  const record = mapLegacyCustomer({
    id: 'old-1',
    displayName: 'Grace Hopper',
    emails: ['GRACE@example.test'],
    phones: [],
  });
  assert.equal(record.object, 'people');
  assert.equal(record.externalId, 'email:grace@example.test');
});

test('maps all Nova Welcome families', () => {
  assert.equal(
    mapWelcomeRow('channex_reviews', {
      id: 'r1',
      reviewer_name: 'Synthetic Guest',
      overall_score: 8,
    })[0]?.object,
    'reviews',
  );
  assert.equal(
    mapWelcomeRow('channex_threads', {
      id: 't1',
      guest_name: 'Synthetic Guest',
    })[0]?.object,
    'conversations',
  );
  assert.equal(
    mapWelcomeRow('trengo_threads', { id: 't2', trengo_ticket_id: 42 })[0]
      ?.fields.channel,
    'WhatsApp',
  );
  assert.equal(
    mapWelcomeRow('call_log', {
      id: 'c1',
      call_id: 'call-1',
      duration_seconds: 20,
    })[0]?.fields.duration,
    20,
  );
  assert.equal(
    mapWelcomeRow('sumup_transactions', { id: 'p1', amount: 12 })[0]?.object,
    'payments',
  );
});

test('maps Hotel Anna stays and privacy-safe daily aggregates', () => {
  const records = mapHotelReservation({
    id: 'web-1',
    propertyId: 'HHA',
    guestName: 'Test Guest',
    guestEmail: 'guest@example.test',
    checkIn: '2026-02-01',
    checkOut: '2026-02-04',
    adults: 2,
    totalPrice: 300,
    status: 'confirmed',
  });
  assert.equal(records[1]?.fields.channel, 'direct-web');
  const stats = aggregatePageViews([
    {
      id: 'v1',
      propertyId: 'HHA',
      visitorId: 'rotating-hash',
      referrer: 'search.test',
      createdAt: '2026-02-01T10:00:00Z',
    },
    {
      id: 'v2',
      propertyId: 'HHA',
      visitorId: 'rotating-hash',
      createdAt: '2026-02-01T11:00:00Z',
    },
  ]);
  assert.equal(stats[0]?.fields.pageViews, 2);
  assert.equal(stats[0]?.fields.visitors, 1);
  assert.equal(JSON.stringify(stats).includes('rotating-hash'), false);
});

test('maps Hotel Anna rows whose dates are Prisma epoch milliseconds', () => {
  const [, stay] = mapHotelReservation({
    id: 'web-2',
    propertyId: 'HHA',
    guestName: 'Test Guest',
    guestEmail: 'guest@example.test',
    checkIn: Date.parse('2026-07-04T22:00:00Z'),
    checkOut: Date.parse('2026-07-06T22:00:00Z'),
    adults: 1,
    totalPrice: 180,
    status: 'confirmed',
  });
  assert.equal(stay?.fields.arrival, '2026-07-04');
  assert.equal(stay?.fields.nights, 2);
  const [stats] = aggregatePageViews([
    {
      id: 'v3',
      propertyId: 'HHA',
      createdAt: Date.parse('2026-07-01T09:00:00Z'),
    },
  ]);
  assert.equal(stats?.fields.date, '2026-07-01');
});

test('maps review-monitor, Stripe and Nova Beds', () => {
  const monitorReview = mapMonitorReview({
    id: 'g1',
    sourceName: 'Google',
    placeName: 'Hotel ANNA Hilden',
    rating: 4,
    repliedAt: 1783202400000,
  });
  assert.equal(monitorReview.fields.name, 'Hotel ANNA Hilden · Google review');
  assert.equal(monitorReview.fields.replied, true);
  const welcomeReview = mapWelcomeRow('channex_reviews', {
    id: 'internal-1',
    ota: 'Google',
    ota_review_id: 'g1',
    overall_score: 8,
  })[0];
  assert.equal(monitorReview.fields.rating, 8);
  assert.equal(monitorReview.externalSource, welcomeReview?.externalSource);
  assert.equal(monitorReview.externalId, welcomeReview?.externalId);
  assert.equal(
    mapStripeCharge({
      id: 'ch_test',
      amount: 1234,
      currency: 'eur',
      created: 1,
      status: 'succeeded',
    }).fields.provider,
    'Stripe',
  );
  assert.equal(
    mapBedsListings([
      {
        id: 'l1',
        platform: 'example',
        url: 'https://example.test',
        scope: 'unit',
        status: 'ok',
        buildingName: 'Test House',
      },
    ]).externalId,
    'NBW',
  );
});

test('Welcome allowlist cannot access the Balter schema', () => {
  assert.equal(
    WELCOME_TABLES.some((table) => table.includes('balter')),
    false,
  );
});

test('SQLite opens in immutable read-only mode', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nova-connectors-'));
  const path = join(directory, 'fixture.db');
  const writable = new DatabaseSync(path);
  writable.exec(
    "CREATE TABLE sample (id TEXT); INSERT INTO sample VALUES ('one')",
  );
  writable.close();
  const readonly = openReadOnlyDatabase(path);
  assert.throws(
    () => readonly.exec("INSERT INTO sample VALUES ('two')"),
    /readonly|read-only/i,
  );
  readonly.close();
  rmSync(directory, { recursive: true });
});
