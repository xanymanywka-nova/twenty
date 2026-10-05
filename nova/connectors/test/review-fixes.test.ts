import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createStripeConnector } from '../src/connectors/stripe.js';
import { openReadOnlyDatabase } from '../src/connectors/sqlite.js';
import {
  createWelcomeConnector,
  mapWelcomeRow,
} from '../src/connectors/welcome.js';
import { NovaCrmClient } from '../src/crm/client.js';
import { runConnector } from '../src/sync.js';
import type {
  Connector,
  RecordWriter,
  SourceName,
  SyncCounts,
  SyncRecord,
} from '../src/types.js';

const requestUrl = (input: Parameters<typeof fetch>[0]): URL =>
  new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const collect = async (connector: Connector): Promise<SyncRecord[]> => {
  const records: SyncRecord[] = [];
  for await (const record of connector.read({ full: true }))
    records.push(record);
  return records;
};

test('Welcome rows without a guest identity create no Person', () => {
  const review = mapWelcomeRow('channex_reviews', {
    id: 'r1',
    reviewer_name: 'Synthetic Guest',
  });
  assert.deepEqual(
    review.map(({ object }) => object),
    ['reviews'],
  );
  assert.equal(review[0]?.fields.reviewerName, 'Synthetic Guest');
  assert.ok(!review[0]?.links?.some(({ field }) => field === 'guestId'));

  const thread = mapWelcomeRow('channex_threads', {
    id: 't1',
    guest_name: 'Synthetic Guest',
  });
  assert.deepEqual(
    thread.map(({ object }) => object),
    ['conversations'],
  );
  assert.equal(thread[0]?.fields.contactName, 'Synthetic Guest');
  assert.deepEqual(thread[0]?.links, []);
});

test('Welcome calls with a phone link to a Person keyed by phone', () => {
  const records = mapWelcomeRow('call_log', {
    id: 'c1',
    call_id: 'call-1',
    from_number: '0049 202 555 0100',
    guest_name: 'Synthetic Guest',
  });
  const person = records.find(({ object }) => object === 'people');
  const call = records.find(({ object }) => object === 'conversations');
  assert.equal(person?.externalId, 'phone:+492025550100');
  assert.equal(
    call?.links?.find(({ field }) => field === 'guestId')?.externalId,
    'phone:+492025550100',
  );
});

test('Welcome pagination is ordered by cursor column then id', async () => {
  const paths: string[] = [];
  const transport: typeof fetch = async (input) => {
    const url = requestUrl(input);
    paths.push(`${url.pathname}${url.search}`);
    return json([]);
  };
  await collect(
    createWelcomeConnector('https://welcome.test', 'key', transport),
  );
  const tablePaths = paths.filter(
    (path) => !path.includes('channex_property_map'),
  );
  assert.ok(tablePaths.length > 0);
  for (const path of tablePaths)
    assert.match(path, /[?&]order=[a-z_]+\.asc,id\.asc&/);
});

test('Stripe connector follows has_more with starting_after', async () => {
  const requested: string[] = [];
  const charge = (id: string) => ({
    id,
    amount: 100,
    currency: 'eur',
    created: 1,
    status: 'succeeded',
  });
  const transport: typeof fetch = async (input) => {
    const url = requestUrl(input);
    requested.push(url.search);
    return url.searchParams.get('starting_after') === 'ch_2'
      ? json({ data: [charge('ch_3')], has_more: false })
      : json({ data: [charge('ch_1'), charge('ch_2')], has_more: true });
  };
  const records = await collect(createStripeConnector('sk_test', transport));
  assert.deepEqual(
    records.map(({ externalId }) => externalId),
    ['ch_1', 'ch_2', 'ch_3'],
  );
  assert.equal(requested.length, 2);
});

class CursorWriter implements RecordWriter {
  cursor: string | undefined;
  async upsert(): Promise<'created'> {
    return 'created';
  }
  async getCursor(): Promise<undefined> {
    return undefined;
  }
  async startRun(source: SourceName): Promise<string> {
    return source;
  }
  async finishRun(
    _runId: string,
    _status: 'success' | 'error',
    _counts: SyncCounts,
    cursor?: string,
  ): Promise<void> {
    this.cursor = cursor;
  }
}

test('sync cursor is the run start minus an overlap, not the finish time', async () => {
  let clock = Date.parse('2026-10-05T12:00:00.000Z');
  const writer = new CursorWriter();
  const slowConnector: Connector = {
    name: 'stripe',
    async *read() {
      clock += 10 * 60_000;
      yield {
        object: 'payments',
        externalSource: 'stripe',
        externalId: 'ch_1',
        fields: {},
      };
    },
  };
  await runConnector(slowConnector, writer, { now: () => new Date(clock) });
  assert.equal(writer.cursor, '2026-10-05T11:58:00.000Z');
});

test('getCursor only reads successful runs', async () => {
  let filter = '';
  const transport: typeof fetch = async (input) => {
    filter = requestUrl(input).searchParams.get('filter') ?? '';
    return json({ data: { syncRuns: [{ id: 'run', cursor: 'c' }] } });
  };
  const client = new NovaCrmClient('http://crm.test', 'key', transport);
  assert.equal(await client.getCursor('stripe'), 'c');
  assert.equal(filter, 'and(source[eq]:"stripe",status[eq]:"success")');
});

test('CRM client retries 429 and 503 honouring Retry-After', async () => {
  const waits: number[] = [];
  const statuses = [429, 503, 200];
  let calls = 0;
  const transport: typeof fetch = async () => {
    const status = statuses[calls++] ?? 200;
    return status === 200
      ? json({ data: { syncRuns: [] } })
      : json({}, status, status === 429 ? { 'Retry-After': '2' } : {});
  };
  const client = new NovaCrmClient('http://crm.test', 'key', transport, {
    maxRequestsPerSecond: 0,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
  });
  assert.equal(await client.getCursor('stripe'), undefined);
  assert.equal(calls, 3);
  assert.equal(waits[0], 2000);
  assert.ok((waits[1] ?? 0) > 0);
});

test('CRM client gives up after five attempts', async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls += 1;
    return json({}, 502);
  };
  const client = new NovaCrmClient('http://crm.test', 'key', transport, {
    maxRequestsPerSecond: 0,
    sleep: async () => {},
  });
  await assert.rejects(client.getCursor('stripe'), /502/);
  assert.equal(calls, 5);
});

test('CRM client spaces requests by NOVA_CRM_MAX_RPS', async () => {
  const waits: number[] = [];
  const transport: typeof fetch = async () => json({ data: { syncRuns: [] } });
  const client = new NovaCrmClient('http://crm.test', 'key', transport, {
    maxRequestsPerSecond: 5,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
  });
  await Promise.all([
    client.getCursor('stripe'),
    client.getCursor('apaleo'),
    client.getCursor('welcome'),
  ]);
  assert.equal(waits.length, 2);
  for (const wait of waits) assert.ok(wait > 150 && wait <= 200);
});

test('CRM client caches link lookups within a run', async () => {
  let gets = 0;
  const transport: typeof fetch = async (input, init) => {
    const method = init?.method ?? 'GET';
    const url = requestUrl(input);
    if (method === 'GET' && url.pathname === '/rest/properties') {
      gets += 1;
      return json({
        data: {
          properties: [
            { id: 'property-1', externalSource: 'apaleo', externalId: 'HHA' },
          ],
        },
      });
    }
    if (method === 'GET') return json({ data: { stays: [] } });
    return json({ data: { createStay: { id: 'stay-x' } } }, 201);
  };
  const client = new NovaCrmClient('http://crm.test', 'key', transport, {
    maxRequestsPerSecond: 0,
  });
  for (const externalId of ['S1', 'S2', 'S3'])
    await client.upsert({
      object: 'stays',
      externalSource: 'apaleo',
      externalId,
      fields: { name: externalId },
      links: [
        {
          field: 'propertyId',
          object: 'properties',
          externalSource: 'apaleo',
          externalId: 'HHA',
        },
      ],
    });
  assert.equal(gets, 1);
});

test('SQLite WAL database on a read-only directory falls back to immutable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nova-connectors-wal-'));
  const path = join(directory, 'wal.db');
  const writable = new DatabaseSync(path);
  writable.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE sample (id TEXT); INSERT INTO sample VALUES ('one')",
  );
  writable.close();
  chmodSync(directory, 0o555);
  const logs: string[] = [];
  try {
    const database = openReadOnlyDatabase(path, (line) => logs.push(line));
    assert.deepEqual(
      database
        .prepare('SELECT id FROM sample')
        .all()
        .map(({ id }) => id),
      ['one'],
    );
    database.close();
    assert.equal(logs.length, 1);
    assert.match(logs[0] ?? '', /immutable=1/);
  } finally {
    chmodSync(directory, 0o755);
    rmSync(directory, { recursive: true });
  }
});
