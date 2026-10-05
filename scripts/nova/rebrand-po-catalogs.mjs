import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CATALOG_DIRECTORIES = [
  'packages/twenty-front/src/locales',
  'packages/twenty-emails/src/locales',
  'packages/twenty-server/src/engine/core-modules/i18n/locales',
];

const parsePoString = (value) => JSON.parse(value.trim());

const readDirective = (lines, directive) => {
  const directiveIndex = lines.findIndex((line) =>
    line.startsWith(`${directive} `),
  );

  if (directiveIndex === -1) {
    return null;
  }

  let value = parsePoString(lines[directiveIndex].slice(directive.length + 1));

  for (let index = directiveIndex + 1; index < lines.length; index += 1) {
    if (!lines[index].startsWith('"')) {
      break;
    }

    value += parsePoString(lines[index]);
  }

  return value;
};

const rebrandEntry = (entry) => {
  const lines = entry.split('\n');
  const messageId = readDirective(lines, 'msgid');

  if (!messageId?.includes('Twenty')) {
    return entry;
  }

  const message = readDirective(lines, 'msgstr');
  const messageStartIndex = lines.findIndex((line) => line.startsWith('msgstr '));

  if (messageStartIndex === -1) {
    return entry;
  }

  if (message === '') {
    lines[messageStartIndex] = `msgstr ${JSON.stringify(
      messageId.replaceAll('Twenty', 'Nova CRM'),
    )}`;
    return lines.join('\n');
  }

  for (let index = messageStartIndex; index < lines.length; index += 1) {
    const line = lines[index];

    if (
      index > messageStartIndex &&
      line !== '' &&
      !line.startsWith('"')
    ) {
      break;
    }

    lines[index] = line.replaceAll('Twenty', 'Nova CRM');
  }

  return lines.join('\n');
};

for (const catalogDirectory of CATALOG_DIRECTORIES) {
  const catalogFiles = (await readdir(catalogDirectory)).filter((fileName) =>
    fileName.endsWith('.po'),
  );

  for (const catalogFile of catalogFiles) {
    const catalogPath = join(catalogDirectory, catalogFile);
    const catalog = await readFile(catalogPath, 'utf8');
    const rebrandedCatalog = catalog
      .split('\n\n')
      .map(rebrandEntry)
      .join('\n\n');

    await writeFile(catalogPath, rebrandedCatalog);
  }
}
