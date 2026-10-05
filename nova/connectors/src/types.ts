export type SourceName =
  | 'apaleo'
  | 'legacy'
  | 'welcome'
  | 'hotel-anna'
  | 'review-monitor'
  | 'stripe'
  | 'nova-beds';

export type ObjectName =
  | 'people'
  | 'companies'
  | 'properties'
  | 'stays'
  | 'payments'
  | 'reviews'
  | 'conversations'
  | 'webStats'
  | 'notes'
  | 'noteTargets'
  | 'tasks';

export type RecordLink = {
  field: string;
  object: ObjectName;
  externalSource: string;
  externalId: string;
};

export type SyncRecord = {
  object: ObjectName;
  externalSource: string;
  externalId: string;
  fields: Record<string, unknown>;
  links?: RecordLink[];
};

export type ConnectorContext = {
  cursor?: string | undefined;
  full: boolean;
};

export type Connector = {
  name: SourceName;
  read: (context: ConnectorContext) => AsyncIterable<SyncRecord>;
};

export type SyncCounts = {
  created: number;
  updated: number;
  skipped: number;
};

export type RecordWriter = {
  upsert: (record: SyncRecord) => Promise<'created' | 'updated' | 'skipped'>;
  getCursor: (source: SourceName) => Promise<string | undefined>;
  startRun: (source: SourceName) => Promise<string>;
  finishRun: (
    runId: string,
    status: 'success' | 'error',
    counts: SyncCounts,
    cursor?: string,
    error?: string,
  ) => Promise<void>;
};
