import assert from 'node:assert/strict';
import test from 'node:test';
import { GuestDeduplicator } from '../src/dedupe.js';
import { classifyCustomer } from '../src/classify.js';
import { ReadOnlyHttpClient } from '../src/http/read-only-client.js';
import { NovaCrmClient } from '../src/crm/client.js';
import { runConnector } from '../src/sync.js';
import type {
  Connector,
  RecordWriter,
  SourceName,
  SyncCounts,
  SyncRecord,
} from '../src/types.js';

class MemoryWriter implements RecordWriter {
  readonly records = new Map<string, SyncRecord>();
  async upsert(record: SyncRecord): Promise<'created' | 'skipped'> {
    const key = `${record.object}:${record.externalSource}:${record.externalId}`;
    if (this.records.has(key)) return 'skipped';
    this.records.set(key, record);
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
  ): Promise<void> {}
}

const connector: Connector = {
  name: 'apaleo',
  async *read() {
    yield {
      object: 'stays',
      externalSource: 'apaleo',
      externalId: 'stay-1',
      fields: { name: 'stay-1' },
    };
  },
};

test('upsert is idempotent on externalSource plus externalId', async () => {
  const writer = new MemoryWriter();
  assert.deepEqual(await runConnector(connector, writer), {
    created: 1,
    updated: 0,
    skipped: 0,
  });
  assert.deepEqual(await runConnector(connector, writer), {
    created: 0,
    updated: 0,
    skipped: 1,
  });
  assert.equal(writer.records.size, 1);
});

test('Nova CRM writer performs one POST over two identical upserts', async () => {
  const records: Array<Record<string, unknown> & { id: string }> = [];
  let posts = 0;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input
          : input.url,
    );
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      const filter = url.searchParams.get('filter') ?? '';
      const source = /externalSource\[eq\]:"([^"]+)"/.exec(filter)?.[1];
      const externalId = /externalId\[eq\]:"([^"]+)"/.exec(filter)?.[1];
      return new Response(
        JSON.stringify({
          data: {
            stays: records.filter(
              (record) =>
                record.externalSource === source &&
                record.externalId === externalId,
            ),
          },
        }),
        { status: 200 },
      );
    }
    if (method === 'POST') {
      posts += 1;
      const record = {
        id: `record-${posts}`,
        ...(JSON.parse(String(init?.body)) as Record<string, unknown>),
      };
      records.push(record);
      return new Response(JSON.stringify({ data: { stay: record } }), {
        status: 201,
      });
    }
    return new Response('{}', { status: 404 });
  };
  const writer = new NovaCrmClient('http://crm.test', 'test-key', transport);
  const record: SyncRecord = {
    object: 'stays',
    externalSource: 'apaleo',
    externalId: 'R1',
    fields: {
      name: 'R1',
      totalGross: { amountMicros: 1000000, currencyCode: 'EUR' },
      optional: undefined,
    },
  };
  assert.equal(await writer.upsert(record), 'created');
  assert.equal(await writer.upsert(record), 'skipped');
  assert.equal(posts, 1);
});

test('Nova CRM writer matches a returning guest by normalized phone across runs', async () => {
  const existingPerson = {
    id: 'person-1',
    externalSource: 'guest',
    externalId: 'phone:+4917612345678',
    name: { firstName: 'Test', lastName: 'Guest' },
    phones: {
      primaryPhoneNumber: '+4917612345678',
      primaryPhoneCountryCode: '',
      primaryPhoneCallingCode: '',
      additionalPhones: [],
    },
  };
  let posts = 0;
  let patches = 0;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input
          : input.url,
    );
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      const filter = url.searchParams.get('filter') ?? '';
      const matchesPhone = filter.includes(
        'phones.primaryPhoneNumber[eq]:"+4917612345678"',
      );
      return new Response(
        JSON.stringify({
          data: { people: matchesPhone ? [existingPerson] : [] },
        }),
        { status: 200 },
      );
    }
    if (method === 'PATCH') {
      patches += 1;
      return new Response('{}', { status: 200 });
    }
    posts += 1;
    return new Response('{}', { status: 201 });
  };
  const writer = new NovaCrmClient('http://crm.test', 'test-key', transport);
  const result = await writer.upsert({
    object: 'people',
    externalSource: 'guest',
    externalId: 'email:returning@example.test',
    fields: {
      name: { firstName: 'Test', lastName: 'Guest' },
      emails: {
        primaryEmail: 'returning@example.test',
        additionalEmails: null,
      },
      phones: {
        primaryPhoneNumber: '+4917612345678',
        primaryPhoneCountryCode: '',
        primaryPhoneCallingCode: '',
        additionalPhones: [],
      },
    },
  });
  assert.equal(result, 'updated');
  assert.equal(posts, 0);
  assert.equal(patches, 1);
});

test('source HTTP client rejects every non-GET method', async () => {
  const client = new ReadOnlyHttpClient('https://example.test');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
    await assert.rejects(client.request('/', method), /rejected/);
});

test('guest dedupe uses email then E.164 phone then name and birth date', () => {
  const dedupe = new GuestDeduplicator();
  dedupe.add({ id: 'email', email: 'guest@example.test' });
  dedupe.add({ id: 'phone', phone: '0176 12345678' });
  dedupe.add({ id: 'dob', name: 'Test Person', birthDate: '1990-01-02' });
  assert.deepEqual(
    dedupe.find({ id: 'new', email: 'GUEST@example.test', phone: '999' }),
    { type: 'match', id: 'email', reason: 'email' },
  );
  assert.deepEqual(dedupe.find({ id: 'new', phone: '+49 176 12345678' }), {
    type: 'match',
    id: 'phone',
    reason: 'phone',
  });
  assert.deepEqual(
    dedupe.find({
      id: 'new',
      name: 'test person',
      birthDate: '1990-01-02T00:00:00Z',
    }),
    { type: 'match', id: 'dob', reason: 'nameBirthDate' },
  );
  assert.deepEqual(
    dedupe.find({
      id: 'new',
      email: 'guest@example.test',
      phone: '+49 176 12345678',
    }),
    { type: 'review', ids: ['email', 'phone'] },
  );
});

test('customer classification distinguishes explicit companies from consumers', () => {
  assert.equal(
    classifyCustomer({
      companyName: 'Synthetic Logistik GmbH',
      email: 'office@synthetic.test',
    }).type,
    'B2B',
  );
  assert.equal(
    classifyCustomer({ name: 'Test Guest', email: 'guest@gmail.com' }).type,
    'B2C',
  );
});
