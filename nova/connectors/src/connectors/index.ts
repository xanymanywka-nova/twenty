import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireEnvironment } from '../config.js';
import type { Connector, SourceName, SyncRecord } from '../types.js';
import { createApaleoConnector } from './apaleo.js';
import { createHotelAnnaConnector } from './hotel-anna.js';
import { createLegacyConnector } from './legacy.js';
import { createNovaBedsConnector } from './nova-beds.js';
import { createReviewMonitorConnector } from './review-monitor.js';
import { createStripeConnector } from './stripe.js';
import { createWelcomeConnector } from './welcome.js';

const fixtureConnector = (source: SourceName, path: string): Connector => ({
  name: source,
  async *read() {
    const records = JSON.parse(await readFile(path, 'utf8')) as SyncRecord[];
    for (const record of records) yield record;
  },
});

export const createConnector = (source: SourceName): Connector => {
  const fixturePath = process.env.CONNECTOR_FIXTURE_DIR
    ? join(process.env.CONNECTOR_FIXTURE_DIR, `${source}.json`)
    : undefined;
  if (fixturePath && existsSync(fixturePath))
    return fixtureConnector(source, fixturePath);
  switch (source) {
    case 'apaleo':
      return createApaleoConnector(
        requireEnvironment('APALEO_CLIENT_ID'),
        requireEnvironment('APALEO_CLIENT_SECRET'),
      );
    case 'legacy':
      return createLegacyConnector(
        requireEnvironment('LEGACY_CRM_DATABASE_URL'),
      );
    case 'welcome':
      return createWelcomeConnector(
        requireEnvironment('WELCOME_SUPABASE_URL'),
        requireEnvironment('WELCOME_SUPABASE_KEY'),
      );
    case 'hotel-anna':
      return createHotelAnnaConnector(
        requireEnvironment('HOTEL_ANNA_DATABASE_PATH'),
      );
    case 'review-monitor':
      return createReviewMonitorConnector(
        requireEnvironment('REVIEW_MONITOR_DATABASE_PATH'),
      );
    case 'stripe':
      return createStripeConnector(requireEnvironment('STRIPE_READ_KEY'));
    case 'nova-beds':
      return createNovaBedsConnector(
        requireEnvironment('NOVA_BEDS_DATABASE_PATH'),
      );
  }
};

export const SOURCE_NAMES: SourceName[] = [
  'apaleo',
  'legacy',
  'welcome',
  'hotel-anna',
  'review-monitor',
  'stripe',
  'nova-beds',
];
