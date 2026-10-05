import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const SQLITE_CANTOPEN = 14;
const SQLITE_READONLY = 8;

const isReadOnlyMountError = (error: unknown): boolean => {
  const errcode =
    error && typeof error === 'object' && 'errcode' in error
      ? Number((error as { errcode: unknown }).errcode)
      : NaN;
  const primary = errcode & 0xff;
  return primary === SQLITE_READONLY || primary === SQLITE_CANTOPEN;
};

const probe = (database: DatabaseSync): void => {
  database.prepare('SELECT 1 FROM sqlite_master LIMIT 1').all();
};

// A WAL database on a :ro mount fails on first read because SQLite needs to
// create -shm next to it; immutable=1 skips locking and the WAL entirely.
export const openReadOnlyDatabase = (
  path: string,
  log: (line: string) => void = console.warn,
): DatabaseSync => {
  if (!existsSync(path))
    throw new Error(`SQLite database does not exist: ${path}`);
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    probe(database);
    return database;
  } catch (error) {
    database.close();
    if (!isReadOnlyMountError(error)) throw error;
    log(
      `[sqlite] ${path}: read-only open failed (${error instanceof Error ? error.message : String(error)}), retrying with immutable=1`,
    );
    const url = pathToFileURL(resolve(path));
    url.searchParams.set('immutable', '1');
    const immutable = new DatabaseSync(url, { readOnly: true });
    probe(immutable);
    return immutable;
  }
};

export const queryRows = <TRow extends Record<string, unknown>>(
  database: DatabaseSync,
  sql: string,
  ...parameters: Array<string | number>
): TRow[] => database.prepare(sql).all(...parameters) as TRow[];
