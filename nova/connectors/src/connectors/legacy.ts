import pg from 'pg';
import { classifyCustomer } from '../classify.js';
import type { Connector, SyncRecord } from '../types.js';
import {
  companyExternalId,
  guestExternalId,
  phoneValue,
  richText,
  splitName,
} from '../utils.js';

type LegacyCustomer = {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  birthDate?: string;
  emails: string[];
  phones: string[];
};
type LegacyReservation = {
  id: string;
  customerId?: string;
  propertyId?: string;
  arrival: string;
  departure: string;
  nights: number;
  status: string;
  grossCents: string;
  currency: string;
  channel?: string;
  unitName?: string;
  ratePlan?: string;
  adults: number;
};
type LegacyPayment = {
  id: string;
  txId: string;
  customerId?: string;
  grossCents: string;
  currency: string;
  channel: string;
  settledAt: string;
};
type LegacyNote = {
  id: string;
  customerId: string;
  body: string;
  createdAt: string;
};
type LegacyAudit = {
  id: string;
  entityId: string;
  summary: string;
  createdAt: string;
};

export const mapLegacyCustomer = (customer: LegacyCustomer): SyncRecord => {
  const externalId = guestExternalId({
    email: customer.emails[0],
    phone: customer.phones[0],
    name: customer.displayName,
    birthDate: customer.birthDate,
    fallback: customer.id,
  });
  return {
    object: 'people',
    externalSource: 'guest',
    externalId,
    fields: {
      name: customer.firstName
        ? { firstName: customer.firstName, lastName: customer.lastName ?? '' }
        : splitName(customer.displayName),
      birthDate: customer.birthDate?.slice(0, 10),
      emails: customer.emails[0]
        ? {
            primaryEmail: customer.emails[0],
            additionalEmails: customer.emails.slice(1),
          }
        : undefined,
      phones: customer.phones[0]
        ? phoneValue(customer.phones[0], customer.phones.slice(1))
        : undefined,
      legacyId: customer.id,
    },
  };
};

export const createLegacyConnector = (connectionString: string): Connector => ({
  name: 'legacy',
  async *read() {
    const pool = new pg.Pool({ connectionString, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const customers = await client.query<LegacyCustomer>(
        `SELECT c.id, c."displayName", c."firstName", c."lastName", c."companyName", c."birthDate", COALESCE(array_agg(DISTINCT e.email) FILTER (WHERE e.email IS NOT NULL), '{}') AS emails, COALESCE(array_agg(DISTINCT p.phone) FILTER (WHERE p.phone IS NOT NULL), '{}') AS phones FROM "Customer" c LEFT JOIN "CustomerEmail" e ON e."customerId"=c.id LEFT JOIN "CustomerPhone" p ON p."customerId"=c.id GROUP BY c.id`,
      );
      const guestIds = new Map(
        customers.rows.map((customer) => [
          customer.id,
          mapLegacyCustomer(customer).externalId,
        ]),
      );
      const companyIds = new Map<string, string>();
      for (const customer of customers.rows) {
        yield mapLegacyCustomer(customer);
        if (customer.companyName) {
          const externalId = companyExternalId(customer.companyName);
          companyIds.set(customer.id, externalId);
          yield {
            object: 'companies',
            externalSource: 'company',
            externalId,
            fields: {
              name: customer.companyName,
              customerType: classifyCustomer({
                companyName: customer.companyName,
                email: customer.emails[0],
              }).type,
            },
          };
        }
      }
      const reservations = await client.query<LegacyReservation>(
        'SELECT r.*, b."customerId" FROM "Reservation" r JOIN "Booking" b ON b.id=r."bookingId"',
      );
      for (const row of reservations.rows)
        yield {
          object: 'stays',
          externalSource: 'apaleo',
          externalId: row.id,
          fields: {
            name: row.id,
            arrival: row.arrival,
            departure: row.departure,
            nights: row.nights,
            adults: row.adults,
            status: row.status,
            channel: row.channel,
            totalGross: {
              amountMicros: Number(row.grossCents) * 10_000,
              currencyCode: row.currency,
            },
            unit: row.unitName,
            ratePlan: row.ratePlan,
          },
          links: [
            ...(row.customerId && guestIds.get(row.customerId)
              ? [
                  {
                    field: 'guestId',
                    object: 'people' as const,
                    externalSource: 'guest',
                    externalId: guestIds.get(row.customerId) as string,
                  },
                ]
              : []),
            ...(row.propertyId
              ? [
                  {
                    field: 'propertyId',
                    object: 'properties' as const,
                    externalSource: 'apaleo',
                    externalId: row.propertyId,
                  },
                ]
              : []),
            ...(row.customerId && companyIds.get(row.customerId)
              ? [
                  {
                    field: 'companyId',
                    object: 'companies' as const,
                    externalSource: 'company',
                    externalId: companyIds.get(row.customerId) as string,
                  },
                ]
              : []),
          ],
        };
      const payments = await client.query<LegacyPayment>(
        'SELECT id, "txId", "customerId", "grossCents", currency, channel, "settledAt" FROM "Payment"',
      );
      for (const row of payments.rows)
        yield {
          object: 'payments',
          externalSource: 'legacy',
          externalId: row.txId || row.id,
          fields: {
            name: row.txId,
            amount: {
              amountMicros: Number(row.grossCents) * 10_000,
              currencyCode: row.currency,
            },
            method: row.channel,
            provider: 'legacy',
            date: row.settledAt,
            status: 'recorded',
          },
        };
      const notes = await client.query<LegacyNote>(
        'SELECT id, "customerId", body, "createdAt" FROM "Note"',
      );
      for (const row of notes.rows) {
        yield {
          object: 'notes',
          externalSource: 'legacy-note',
          externalId: row.id,
          fields: {
            title: 'Legacy note',
            bodyV2: richText(row.body),
            position: 0,
          },
        };
        const guestId = guestIds.get(row.customerId);
        if (guestId)
          yield {
            object: 'noteTargets',
            externalSource: 'legacy-note-target',
            externalId: row.id,
            fields: {},
            links: [
              {
                field: 'noteId',
                object: 'notes',
                externalSource: 'legacy-note',
                externalId: row.id,
              },
              {
                field: 'targetPersonId',
                object: 'people',
                externalSource: 'guest',
                externalId: guestId,
              },
            ],
          };
      }
      const audits = await client.query<LegacyAudit>(
        `SELECT id, "entityId", summary, "createdAt" FROM "AuditLog" WHERE entity='customer'`,
      );
      for (const row of audits.rows) {
        yield {
          object: 'notes',
          externalSource: 'legacy-audit',
          externalId: row.id,
          fields: {
            title: 'Legacy audit log',
            bodyV2: richText(row.summary),
            position: 0,
          },
        };
        const guestId = guestIds.get(row.entityId);
        if (guestId)
          yield {
            object: 'noteTargets',
            externalSource: 'legacy-audit-target',
            externalId: row.id,
            fields: {},
            links: [
              {
                field: 'noteId',
                object: 'notes',
                externalSource: 'legacy-audit',
                externalId: row.id,
              },
              {
                field: 'targetPersonId',
                object: 'people',
                externalSource: 'guest',
                externalId: guestId,
              },
            ],
          };
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  },
});
