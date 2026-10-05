import { bootstrap } from './crm/bootstrap.js';
import { DryRunWriter, NovaCrmClient } from './crm/client.js';
import { crmConfig } from './config.js';
import { createConnector, SOURCE_NAMES } from './connectors/index.js';
import { runConnector } from './sync.js';
import type { SourceName } from './types.js';

const main = async (): Promise<void> => {
  const [command, rawSource, ...flags] = process.argv.slice(2);
  if (command === 'bootstrap') {
    const config = crmConfig();
    console.log(JSON.stringify(await bootstrap(config.url, config.apiKey)));
    return;
  }
  const source = command === 'migrate-legacy' ? 'legacy' : rawSource;
  if (
    (command !== 'sync' && command !== 'migrate-legacy') ||
    !source ||
    !SOURCE_NAMES.includes(source as SourceName)
  ) {
    throw new Error(
      `Usage: npm run sync -- <${SOURCE_NAMES.join('|')}> [--full] [--dry-run]`,
    );
  }
  const dryRun = flags.includes('--dry-run');
  const writer = dryRun
    ? new DryRunWriter()
    : (() => {
        const config = crmConfig();
        return new NovaCrmClient(config.url, config.apiKey);
      })();
  const counts = await runConnector(
    createConnector(source as SourceName),
    writer,
    { full: flags.includes('--full') },
  );
  console.log(JSON.stringify({ source, dryRun, ...counts }));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
