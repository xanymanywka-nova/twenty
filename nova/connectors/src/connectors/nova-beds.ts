import type { Connector, SyncRecord } from '../types.js';
import { richText } from '../utils.js';
import { openReadOnlyDatabase, queryRows } from './sqlite.js';

type ListingRow = {
  id: string;
  platform: string;
  url: string;
  scope: string;
  status: string;
  buildingName: string;
};

export const mapBedsListings = (rows: ListingRow[]): SyncRecord => ({
  object: 'properties',
  externalSource: 'apaleo',
  externalId: 'NBW',
  fields: {
    name: 'Nova Beds',
    code: 'NBW',
    type: 'apartments',
    listings: richText(
      JSON.stringify(
        rows
          .filter((row) => row.status !== 'dead')
          .map(({ platform, url, scope, status, buildingName }) => ({
            platform,
            url,
            scope,
            status,
            buildingName,
          })),
      ),
    ),
  },
});

export const createNovaBedsConnector = (path: string): Connector => ({
  name: 'nova-beds',
  async *read() {
    const database = openReadOnlyDatabase(path);
    try {
      const rows = queryRows<ListingRow>(
        database,
        'SELECT l.id, l.platform, l.url, l.scope, l.status, a.buildingName FROM Listing l JOIN Apartment a ON a.id = l.apartmentId WHERE a.active = 1',
      );
      yield mapBedsListings(rows);
    } finally {
      database.close();
    }
  },
});
