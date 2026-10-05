import type {
  ObjectName,
  RecordWriter,
  SourceName,
  SyncCounts,
  SyncRecord,
} from '../types.js';
import { richText } from '../utils.js';

type CrmRecord = Record<string, unknown> & { id: string };
type CrmResponse = { data?: unknown } | unknown[];

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const retryDelay = (response: Response, attempt: number): number => {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return Math.min(30_000, 500 * 2 ** attempt);
};

export type NovaCrmClientOptions = {
  maxRequestsPerSecond?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const pluralKey = (object: ObjectName | 'syncRuns'): string => object;

const nestedString = (value: unknown, key: string): string | undefined =>
  value &&
  typeof value === 'object' &&
  key in value &&
  typeof (value as Record<string, unknown>)[key] === 'string'
    ? (value as Record<string, string>)[key]
    : undefined;

const equalsFilter = (field: string, value: string): string =>
  `${field}[eq]:${JSON.stringify(value)}`;

const comparable = (value: unknown, key?: string): unknown => {
  if (
    key === 'amountMicros' &&
    (typeof value === 'number' || typeof value === 'string')
  )
    return String(value);
  if (Array.isArray(value)) return value.map((item) => comparable(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([itemKey, item]) => [itemKey, comparable(item, itemKey)]),
    );
  }
  return value;
};

const unwrapRecords = (body: CrmResponse, key: string): CrmRecord[] => {
  if (Array.isArray(body)) return body as CrmRecord[];
  if (!body || typeof body !== 'object' || !('data' in body)) return [];
  const data = body.data;
  if (Array.isArray(data)) return data as CrmRecord[];
  if (data && typeof data === 'object' && key in data) {
    const nested = (data as Record<string, unknown>)[key];
    return Array.isArray(nested) ? (nested as CrmRecord[]) : [];
  }
  return [];
};

const unwrapRecord = (body: unknown, key: string): CrmRecord => {
  if (!body || typeof body !== 'object')
    throw new Error(`Nova CRM returned no ${key} record`);
  if ('data' in body) {
    const data = (body as { data: unknown }).data;
    if (data && typeof data === 'object' && key in data)
      return (data as Record<string, CrmRecord>)[key] as CrmRecord;
    if (data && typeof data === 'object' && 'id' in data)
      return data as CrmRecord;
    // REST mutations answer as { data: { createPerson: {...} } }.
    const nested =
      data && typeof data === 'object'
        ? Object.values(data).find(
            (value) => value && typeof value === 'object' && 'id' in value,
          )
        : undefined;
    if (nested) return nested as CrmRecord;
  }
  if ('id' in body) return body as CrmRecord;
  throw new Error(`Nova CRM returned an unexpected ${key} response`);
};

export class NovaCrmClient implements RecordWriter {
  private readonly minimumInterval: number;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  // Twenty's REST filters are not read-your-writes friendly for links, and a
  // run touches the same people and properties many times.
  private readonly records = new Map<string, CrmRecord | null>();

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly transport: typeof fetch = fetch,
    options: NovaCrmClientOptions = {},
  ) {
    const rate = options.maxRequestsPerSecond ?? 10;
    this.minimumInterval = rate > 0 ? 1000 / rate : 0;
    this.wait = options.sleep ?? sleep;
  }

  private throttle(): Promise<void> {
    const slot = this.queue.then(async () => {
      const delay = this.lastRequestAt + this.minimumInterval - Date.now();
      if (delay > 0) await this.wait(delay);
      this.lastRequestAt = Date.now();
    });
    this.queue = slot;
    return slot;
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    let response: Response;
    for (let attempt = 0; ; attempt += 1) {
      await this.throttle();
      response = await this.transport(`${this.url}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
      if (
        !RETRYABLE_STATUSES.has(response.status) ||
        attempt + 1 >= MAX_ATTEMPTS
      )
        break;
      await response.text();
      await this.wait(retryDelay(response, attempt));
    }
    const text = await response.text();
    if (!response.ok)
      throw new Error(
        `${init.method ?? 'GET'} ${path} failed with ${response.status}: ${text.slice(0, 500)}`,
      );
    return text ? (JSON.parse(text) as unknown) : {};
  }

  private async find(
    object: ObjectName,
    externalSource: string,
    externalId: string,
  ): Promise<CrmRecord | undefined> {
    const key = `${object}|${externalSource}|${externalId}`;
    if (this.records.has(key)) return this.records.get(key) ?? undefined;
    const filter = encodeURIComponent(
      `and(${equalsFilter('externalSource', externalSource)},${equalsFilter('externalId', externalId)})`,
    );
    const body = (await this.request(
      `/rest/${pluralKey(object)}?filter=${filter}&limit=1`,
    )) as CrmResponse;
    const found = unwrapRecords(body, pluralKey(object))[0];
    this.records.set(key, found ?? null);
    return found;
  }

  private async findPeopleByFilter(filter: string): Promise<CrmRecord[]> {
    const body = (await this.request(
      `/rest/people?filter=${encodeURIComponent(filter)}&limit=2`,
    )) as CrmResponse;
    return unwrapRecords(body, 'people');
  }

  private async findPersonCandidates(record: SyncRecord): Promise<CrmRecord[]> {
    const email = nestedString(record.fields.emails, 'primaryEmail');
    const phone = nestedString(record.fields.phones, 'primaryPhoneNumber');
    const firstName = nestedString(record.fields.name, 'firstName');
    const lastName = nestedString(record.fields.name, 'lastName');
    const birthDate =
      typeof record.fields.birthDate === 'string'
        ? record.fields.birthDate.slice(0, 10)
        : undefined;
    const matches = await Promise.all([
      ...(email
        ? [
            this.findPeopleByFilter(
              equalsFilter('emails.primaryEmail', email.toLowerCase()),
            ),
          ]
        : []),
      ...(phone
        ? [
            this.findPeopleByFilter(
              equalsFilter('phones.primaryPhoneNumber', phone),
            ),
          ]
        : []),
      ...(firstName && lastName && birthDate
        ? [
            this.findPeopleByFilter(
              `and(${equalsFilter('name.firstName', firstName)},${equalsFilter('name.lastName', lastName)},${equalsFilter('birthDate', birthDate)})`,
            ),
          ]
        : []),
    ]);
    return [
      ...new Map(
        matches.flat().map((candidate) => [candidate.id, candidate]),
      ).values(),
    ];
  }

  private async createDuplicateReviewTask(
    record: SyncRecord,
    candidates: CrmRecord[],
  ): Promise<void> {
    const candidateIds = candidates.map(({ id }) => id).sort();
    await this.upsert({
      object: 'tasks',
      externalSource: 'guest-dedupe',
      externalId: [record.externalId, ...candidateIds].join(':'),
      fields: {
        title: 'Проверить дубль',
        bodyV2: richText(
          `Incoming ${record.externalId}; possible CRM records: ${candidateIds.join(', ')}`,
        ),
      },
    });
  }

  private async linkedFields(
    record: SyncRecord,
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const link of record.links ?? []) {
      const target = await this.find(
        link.object,
        link.externalSource,
        link.externalId,
      );
      if (target) result[link.field] = target.id;
    }
    return result;
  }

  async upsert(record: SyncRecord): Promise<'created' | 'updated' | 'skipped'> {
    let existing = await this.find(
      record.object,
      record.externalSource,
      record.externalId,
    );
    if (record.object === 'people') {
      const identityCandidates = await this.findPersonCandidates(record);
      const candidates = [
        ...new Map(
          [...(existing ? [existing] : []), ...identityCandidates].map(
            (candidate) => [candidate.id, candidate],
          ),
        ).values(),
      ];
      if (candidates.length > 1) {
        await this.createDuplicateReviewTask(record, candidates);
      } else if (!existing) {
        existing = candidates[0];
      }
    }
    const data = Object.fromEntries(
      Object.entries({
        ...record.fields,
        ...(await this.linkedFields(record)),
        externalSource: record.externalSource,
        externalId: record.externalId,
      }).filter(([, value]) => value !== undefined),
    );
    const key = `${record.object}|${record.externalSource}|${record.externalId}`;
    if (!existing) {
      const body = await this.request(`/rest/${pluralKey(record.object)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      try {
        this.records.set(key, unwrapRecord(body, record.object));
      } catch {
        this.records.delete(key);
      }
      return 'created';
    }
    const changed = Object.entries(data).some(
      ([key, value]) =>
        JSON.stringify(comparable(existing[key])) !==
        JSON.stringify(comparable(value)),
    );
    if (!changed) return 'skipped';
    await this.request(`/rest/${pluralKey(record.object)}/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    this.records.set(key, { ...existing, ...data, id: existing.id });
    return 'updated';
  }

  async getCursor(source: SourceName): Promise<string | undefined> {
    const filter = encodeURIComponent(
      `and(${equalsFilter('source', source)},${equalsFilter('status', 'success')})`,
    );
    const body = (await this.request(
      `/rest/syncRuns?filter=${filter}&order_by=startedAt[DescNullsLast]&limit=1`,
    )) as CrmResponse;
    const row = unwrapRecords(body, 'syncRuns')[0];
    return typeof row?.cursor === 'string' ? row.cursor : undefined;
  }

  async startRun(source: SourceName): Promise<string> {
    // Records may be edited or deleted in the CRM between scheduled runs.
    this.records.clear();
    const now = new Date().toISOString();
    const record = unwrapRecord(
      await this.request('/rest/syncRuns', {
        method: 'POST',
        body: JSON.stringify({
          name: `${source} ${now}`,
          source,
          startedAt: now,
          status: 'running',
          created: 0,
          updated: 0,
          skipped: 0,
        }),
      }),
      'syncRun',
    );
    return record.id;
  }

  async finishRun(
    runId: string,
    status: 'success' | 'error',
    counts: SyncCounts,
    cursor?: string,
    error?: string,
  ): Promise<void> {
    await this.request(`/rest/syncRuns/${runId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        ...counts,
        cursor,
        error: richText(error),
        finishedAt: new Date().toISOString(),
      }),
    });
  }
}

export class DryRunWriter implements RecordWriter {
  constructor(private readonly output: (line: string) => void = console.log) {}
  async upsert(record: SyncRecord): Promise<'created'> {
    this.output(JSON.stringify(record));
    return 'created';
  }
  async getCursor(): Promise<undefined> {
    return undefined;
  }
  async startRun(source: SourceName): Promise<string> {
    this.output(`[dry-run] start ${source}`);
    return `dry-${source}`;
  }
  async finishRun(
    _runId: string,
    status: 'success' | 'error',
    counts: SyncCounts,
  ): Promise<void> {
    this.output(`[dry-run] ${status} ${JSON.stringify(counts)}`);
  }
}
