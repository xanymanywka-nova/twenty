import cron from 'node-cron';
import { NovaCrmClient } from './crm/client.js';
import { connectorSchedule, crmConfig, isConnectorEnabled } from './config.js';
import { createConnector, SOURCE_NAMES } from './connectors/index.js';
import { runConnector } from './sync.js';

const config = crmConfig();
const writer = new NovaCrmClient(config.url, config.apiKey);

for (const source of SOURCE_NAMES.filter(
  (candidate) => candidate !== 'legacy' && isConnectorEnabled(candidate),
)) {
  const schedule = connectorSchedule(source);
  if (!cron.validate(schedule))
    throw new Error(`Invalid cron expression for ${source}: ${schedule}`);
  let running = false;
  cron.schedule(schedule, async () => {
    if (running) return;
    running = true;
    try {
      const counts = await runConnector(createConnector(source), writer);
      console.log(JSON.stringify({ source, status: 'success', ...counts }));
    } catch (error) {
      console.error(
        JSON.stringify({
          source,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      running = false;
    }
  });
  console.log(`Scheduled ${source}: ${schedule}`);
}
