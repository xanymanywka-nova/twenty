import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const path = resolve(process.argv[2] ?? 'fixtures/hotel-anna.db');
mkdirSync(dirname(path), { recursive: true });
rmSync(path, { force: true });
const database = new DatabaseSync(path);
database.exec(`
  CREATE TABLE Reservation (
    id TEXT PRIMARY KEY, propertyId TEXT NOT NULL, guestName TEXT NOT NULL,
    guestEmail TEXT NOT NULL, guestPhone TEXT, checkIn TEXT NOT NULL,
    checkOut TEXT NOT NULL, adults INTEGER NOT NULL, totalPrice REAL NOT NULL,
    status TEXT NOT NULL, apaleoId TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE TABLE PageView (
    id TEXT PRIMARY KEY, propertyId TEXT NOT NULL, referrer TEXT,
    visitorId TEXT, createdAt TEXT NOT NULL
  );
  INSERT INTO Reservation VALUES
    ('FIXTURE-WEB-1', 'HHA', 'Website Fixture', 'website.fixture@example.test',
     '+49 160 0000000', '2026-01-20', '2026-01-22', 2, 240, 'confirmed', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  INSERT INTO PageView VALUES
    ('VIEW-1', 'HHA', 'https://search.example.test', 'daily-hash-1', '2026-01-01T10:00:00Z'),
    ('VIEW-2', 'HHA', NULL, 'daily-hash-1', '2026-01-01T11:00:00Z');
`);
database.close();
console.log(path);
