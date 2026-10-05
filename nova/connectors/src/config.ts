import type { SourceName } from './types.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const crmConfig = () => ({
  apiKey: required('NOVA_CRM_API_KEY'),
  url: required('NOVA_CRM_URL').replace(/\/$/, ''),
});

export const isConnectorEnabled = (source: SourceName): boolean =>
  process.env[
    `CONNECTOR_${source.replaceAll('-', '_').toUpperCase()}_ENABLED`
  ] === 'true';

export const connectorSchedule = (source: SourceName): string =>
  process.env[`CONNECTOR_${source.replaceAll('-', '_').toUpperCase()}_CRON`] ??
  '0 * * * *';

export const requireEnvironment = required;
