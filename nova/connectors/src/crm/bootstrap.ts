type MetadataObject = {
  id: string;
  nameSingular: string;
  fields?: MetadataField[];
};
type MetadataField = { id: string; name: string; type: string };
type FieldDefinition = {
  name: string;
  label: string;
  type: string;
  target?: string;
  targetLabel?: string;
};
type ObjectDefinition = {
  singular: string;
  plural: string;
  label: string;
  fields: FieldDefinition[];
};

const pluralLabel = (label: string): string =>
  label.endsWith('y') ? `${label.slice(0, -1)}ies` : `${label}s`;

const COMMON_FIELDS: FieldDefinition[] = [
  { name: 'externalSource', label: 'External source', type: 'TEXT' },
  { name: 'externalId', label: 'External ID', type: 'TEXT' },
];

export const OBJECT_DEFINITIONS: ObjectDefinition[] = [
  {
    singular: 'property',
    plural: 'properties',
    label: 'Property',
    fields: [
      ...COMMON_FIELDS,
      { name: 'code', label: 'Code', type: 'TEXT' },
      { name: 'type', label: 'Type', type: 'TEXT' },
      { name: 'website', label: 'Website', type: 'LINK' },
      { name: 'listings', label: 'Listings', type: 'RICH_TEXT' },
    ],
  },
  {
    singular: 'stay',
    plural: 'stays',
    label: 'Stay',
    fields: [
      ...COMMON_FIELDS,
      { name: 'arrival', label: 'Arrival', type: 'DATE' },
      { name: 'departure', label: 'Departure', type: 'DATE' },
      { name: 'nights', label: 'Nights', type: 'NUMBER' },
      { name: 'adults', label: 'Adults', type: 'NUMBER' },
      { name: 'status', label: 'Status', type: 'TEXT' },
      { name: 'channel', label: 'Channel', type: 'TEXT' },
      { name: 'totalGross', label: 'Total gross', type: 'CURRENCY' },
      { name: 'balance', label: 'Balance', type: 'CURRENCY' },
      { name: 'ratePlan', label: 'Rate plan', type: 'TEXT' },
      { name: 'unit', label: 'Unit', type: 'TEXT' },
      {
        name: 'property',
        label: 'Property',
        type: 'RELATION',
        target: 'property',
        targetLabel: 'Stays',
      },
      {
        name: 'guest',
        label: 'Guest',
        type: 'RELATION',
        target: 'person',
        targetLabel: 'Stays',
      },
      {
        name: 'company',
        label: 'Company',
        type: 'RELATION',
        target: 'company',
        targetLabel: 'Stays',
      },
    ],
  },
  {
    singular: 'payment',
    plural: 'payments',
    label: 'Payment',
    fields: [
      ...COMMON_FIELDS,
      { name: 'amount', label: 'Amount', type: 'CURRENCY' },
      { name: 'method', label: 'Method', type: 'TEXT' },
      { name: 'provider', label: 'Provider', type: 'TEXT' },
      { name: 'date', label: 'Date', type: 'DATE_TIME' },
      { name: 'status', label: 'Status', type: 'TEXT' },
      {
        name: 'stay',
        label: 'Stay',
        type: 'RELATION',
        target: 'stay',
        targetLabel: 'Payments',
      },
    ],
  },
  {
    singular: 'review',
    plural: 'reviews',
    label: 'Review',
    fields: [
      ...COMMON_FIELDS,
      { name: 'platform', label: 'Platform', type: 'TEXT' },
      { name: 'rating', label: 'Rating', type: 'NUMBER' },
      { name: 'title', label: 'Title', type: 'TEXT' },
      { name: 'text', label: 'Text', type: 'RICH_TEXT' },
      { name: 'language', label: 'Language', type: 'TEXT' },
      { name: 'publishedAt', label: 'Published at', type: 'DATE_TIME' },
      { name: 'replied', label: 'Replied', type: 'BOOLEAN' },
      { name: 'reviewerName', label: 'Reviewer name', type: 'TEXT' },
      {
        name: 'property',
        label: 'Property',
        type: 'RELATION',
        target: 'property',
        targetLabel: 'Reviews',
      },
      {
        name: 'stay',
        label: 'Stay',
        type: 'RELATION',
        target: 'stay',
        targetLabel: 'Reviews',
      },
      {
        name: 'guest',
        label: 'Guest',
        type: 'RELATION',
        target: 'person',
        targetLabel: 'Reviews',
      },
    ],
  },
  {
    singular: 'conversation',
    plural: 'conversations',
    label: 'Conversation',
    fields: [
      ...COMMON_FIELDS,
      { name: 'channel', label: 'Channel', type: 'TEXT' },
      { name: 'subject', label: 'Subject', type: 'TEXT' },
      { name: 'lastMessageAt', label: 'Last message at', type: 'DATE_TIME' },
      { name: 'direction', label: 'Direction', type: 'TEXT' },
      { name: 'sourceLink', label: 'Source link', type: 'LINK' },
      { name: 'duration', label: 'Duration seconds', type: 'NUMBER' },
      { name: 'contactName', label: 'Contact name', type: 'TEXT' },
      {
        name: 'guest',
        label: 'Guest',
        type: 'RELATION',
        target: 'person',
        targetLabel: 'Conversations',
      },
    ],
  },
  {
    singular: 'webStat',
    plural: 'webStats',
    label: 'Web stat',
    fields: [
      ...COMMON_FIELDS,
      { name: 'date', label: 'Date', type: 'DATE' },
      { name: 'pageViews', label: 'Page views', type: 'NUMBER' },
      { name: 'visitors', label: 'Visitors', type: 'NUMBER' },
      { name: 'topReferrers', label: 'Top referrers', type: 'RICH_TEXT' },
      { name: 'bookingsFromWeb', label: 'Bookings from web', type: 'NUMBER' },
      {
        name: 'property',
        label: 'Property',
        type: 'RELATION',
        target: 'property',
        targetLabel: 'Web stats',
      },
    ],
  },
  {
    singular: 'syncRun',
    plural: 'syncRuns',
    label: 'Sync run',
    fields: [
      { name: 'source', label: 'Source', type: 'TEXT' },
      { name: 'startedAt', label: 'Started at', type: 'DATE_TIME' },
      { name: 'finishedAt', label: 'Finished at', type: 'DATE_TIME' },
      { name: 'status', label: 'Status', type: 'TEXT' },
      { name: 'created', label: 'Created', type: 'NUMBER' },
      { name: 'updated', label: 'Updated', type: 'NUMBER' },
      { name: 'skipped', label: 'Skipped', type: 'NUMBER' },
      { name: 'error', label: 'Error', type: 'RICH_TEXT' },
      { name: 'cursor', label: 'Cursor', type: 'TEXT' },
    ],
  },
];

const STANDARD_FIELDS: Record<string, FieldDefinition[]> = {
  person: [
    ...COMMON_FIELDS,
    { name: 'legacyId', label: 'Legacy ID', type: 'TEXT' },
    { name: 'birthDate', label: 'Birth date', type: 'DATE' },
  ],
  company: [
    ...COMMON_FIELDS,
    { name: 'customerType', label: 'Customer type', type: 'TEXT' },
  ],
  note: COMMON_FIELDS,
  noteTarget: COMMON_FIELDS,
  task: COMMON_FIELDS,
};

const list = (body: unknown): MetadataObject[] => {
  if (!body || typeof body !== 'object') return [];
  const data = 'data' in body ? (body as { data: unknown }).data : body;
  if (Array.isArray(data)) return data as MetadataObject[];
  if (
    data &&
    typeof data === 'object' &&
    'objects' in data &&
    Array.isArray((data as { objects: unknown }).objects)
  )
    return (data as { objects: MetadataObject[] }).objects;
  return [];
};

export const bootstrap = async (
  url: string,
  apiKey: string,
  transport: typeof fetch = fetch,
): Promise<{ createdObjects: number; createdFields: number }> => {
  const request = async (
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> => {
    const response = await transport(`${url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    const body = (await response.json()) as unknown;
    if (!response.ok)
      throw new Error(
        `${init.method ?? 'GET'} ${path} failed: ${JSON.stringify(body)}`,
      );
    return body;
  };
  let objects = list(await request('/rest/metadata/objects?limit=1000'));
  let createdObjects = 0;
  let createdFields = 0;
  for (const definition of OBJECT_DEFINITIONS) {
    if (objects.some((object) => object.nameSingular === definition.singular))
      continue;
    await request('/rest/metadata/objects', {
      method: 'POST',
      body: JSON.stringify({
        nameSingular: definition.singular,
        namePlural: definition.plural,
        labelSingular: definition.label,
        labelPlural: pluralLabel(definition.label),
        icon: 'IconDatabase',
      }),
    });
    createdObjects += 1;
  }
  objects = list(await request('/rest/metadata/objects?limit=1000'));
  const definitions = [
    ...OBJECT_DEFINITIONS.map((object) => ({
      singular: object.singular,
      fields: object.fields,
    })),
    ...Object.entries(STANDARD_FIELDS).map(([singular, fields]) => ({
      singular,
      fields,
    })),
  ];
  for (const definition of definitions) {
    const object = objects.find(
      (candidate) => candidate.nameSingular === definition.singular,
    );
    if (!object)
      throw new Error(`Metadata object ${definition.singular} was not found`);
    for (const field of definition.fields) {
      if (object.fields?.some((candidate) => candidate.name === field.name))
        continue;
      const relationCreationPayload = field.target
        ? {
            type: 'MANY_TO_ONE',
            targetObjectMetadataId: objects.find(
              (candidate) => candidate.nameSingular === field.target,
            )?.id,
            targetFieldLabel: field.targetLabel,
            targetFieldIcon: 'IconList',
          }
        : undefined;
      await request('/rest/metadata/fields', {
        method: 'POST',
        body: JSON.stringify({
          objectMetadataId: object.id,
          name: field.name,
          label: field.label,
          type: field.type,
          isNullable: true,
          relationCreationPayload,
        }),
      });
      createdFields += 1;
    }
  }
  return { createdObjects, createdFields };
};
