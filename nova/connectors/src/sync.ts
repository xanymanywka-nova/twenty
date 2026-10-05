import type { Connector, RecordWriter, SyncCounts } from './types.js';
import { GuestDeduplicator } from './dedupe.js';
import { richText } from './utils.js';

const CURSOR_OVERLAP_MS = 2 * 60_000;

const stringField = (value: unknown, key: string): string | undefined =>
  value &&
  typeof value === 'object' &&
  key in value &&
  typeof (value as Record<string, unknown>)[key] === 'string'
    ? (value as Record<string, string>)[key]
    : undefined;

export const runConnector = async (
  connector: Connector,
  writer: RecordWriter,
  options: { full?: boolean; now?: () => Date } = {},
): Promise<SyncCounts> => {
  const counts: SyncCounts = { created: 0, updated: 0, skipped: 0 };
  // Source rows written while the run is in flight must be picked up next
  // time, so the cursor is the run start minus a margin for clock skew.
  const nextCursor = new Date(
    (options.now ?? (() => new Date()))().getTime() - CURSOR_OVERLAP_MS,
  ).toISOString();
  const runId = await writer.startRun(connector.name);
  const cursor = options.full
    ? undefined
    : await writer.getCursor(connector.name);
  const deduplicator = new GuestDeduplicator();
  const personAliases = new Map<string, string>();
  try {
    for await (const incoming of connector.read({
      cursor,
      full: options.full === true,
    })) {
      let record = incoming;
      let reviewIds: string[] | undefined;
      if (record.object === 'people') {
        const identity = {
          id: record.externalId,
          email: stringField(record.fields.emails, 'primaryEmail'),
          phone: stringField(record.fields.phones, 'primaryPhoneNumber'),
          name: `${stringField(record.fields.name, 'firstName') ?? ''} ${stringField(record.fields.name, 'lastName') ?? ''}`.trim(),
          birthDate:
            typeof record.fields.birthDate === 'string'
              ? record.fields.birthDate
              : undefined,
        };
        const match = deduplicator.find(identity);
        if (match.type === 'match') {
          personAliases.set(record.externalId, match.id);
          record = { ...record, externalId: match.id };
        } else if (match.type === 'review') {
          reviewIds = match.ids;
        } else {
          deduplicator.add(identity);
        }
      } else if (record.links) {
        record = {
          ...record,
          links: record.links.map((link) =>
            link.object === 'people'
              ? {
                  ...link,
                  externalId:
                    personAliases.get(link.externalId) ?? link.externalId,
                }
              : link,
          ),
        };
      }
      const result = await writer.upsert(record);
      counts[result] += 1;
      if (reviewIds) {
        const taskResult = await writer.upsert({
          object: 'tasks',
          externalSource: 'guest-dedupe',
          externalId: [record.externalId, ...reviewIds].sort().join(':'),
          fields: {
            title: 'Проверить дубль',
            bodyV2: richText(
              `Possible duplicates: ${[record.externalId, ...reviewIds].join(', ')}`,
            ),
          },
        });
        counts[taskResult] += 1;
      }
    }
    await writer.finishRun(runId, 'success', counts, nextCursor);
    return counts;
  } catch (error) {
    await writer.finishRun(
      runId,
      'error',
      counts,
      cursor,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
};
