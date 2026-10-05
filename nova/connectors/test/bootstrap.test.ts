import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrap } from '../src/crm/bootstrap.js';

type MockField = { id: string; name: string; type: string };
type MockObject = {
  id: string;
  nameSingular: string;
  namePlural: string;
  fields: MockField[];
};

test('metadata bootstrap creates missing definitions once', async () => {
  const objects: MockObject[] = [
    'person',
    'company',
    'note',
    'noteTarget',
    'task',
  ].map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    nameSingular: name,
    namePlural: name === 'company' ? 'companies' : `${name}s`,
    fields: [],
  }));
  let sequence = 10;
  const transport: typeof fetch = async (input, init) => {
    const path = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input
          : input.url,
    ).pathname;
    const method = init?.method ?? 'GET';
    if (method === 'GET' && path === '/rest/metadata/objects') {
      return new Response(JSON.stringify({ data: objects }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (method === 'POST' && path === '/rest/metadata/objects') {
      const object: MockObject = {
        id: `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
        nameSingular: String(body.nameSingular),
        namePlural: String(body.namePlural),
        fields: [],
      };
      objects.push(object);
      return new Response(JSON.stringify({ data: object }), { status: 201 });
    }
    if (method === 'POST' && path === '/rest/metadata/fields') {
      const object = objects.find(
        (candidate) => candidate.id === body.objectMetadataId,
      );
      if (!object) return new Response('{}', { status: 404 });
      const field = {
        id: String(sequence++),
        name: String(body.name),
        type: String(body.type),
      };
      object.fields.push(field);
      return new Response(JSON.stringify({ data: field }), { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };

  const first = await bootstrap('http://crm.test', 'test-key', transport);
  const second = await bootstrap('http://crm.test', 'test-key', transport);
  assert.equal(first.createdObjects, 7);
  assert.ok(first.createdFields > 40);
  assert.deepEqual(second, { createdObjects: 0, createdFields: 0 });
});
