import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const openReadOnlyDatabase = (path: string): DatabaseSync => {
  if (!existsSync(path))
    throw new Error(`SQLite database does not exist: ${path}`);
  return new DatabaseSync(path, { readOnly: true });
};

export const queryRows = <TRow extends Record<string, unknown>>(
  database: DatabaseSync,
  sql: string,
  ...parameters: Array<string | number>
): TRow[] => database.prepare(sql).all(...parameters) as TRow[];
