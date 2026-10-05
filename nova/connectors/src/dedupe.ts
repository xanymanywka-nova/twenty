import { normalizeEmail, normalizePhone } from './utils.js';

export type GuestIdentity = {
  id: string;
  email?: string | undefined;
  phone?: string | undefined;
  name?: string | undefined;
  birthDate?: string | undefined;
};

export type GuestMatch =
  | { type: 'new' }
  | { type: 'match'; id: string; reason: 'email' | 'phone' | 'nameBirthDate' }
  | { type: 'review'; ids: string[] };

const nameBirthDateKey = (guest: GuestIdentity): string | undefined =>
  guest.name && guest.birthDate
    ? `${guest.name.trim().toLocaleLowerCase('de')}|${guest.birthDate.slice(0, 10)}`
    : undefined;

export class GuestDeduplicator {
  private readonly emails = new Map<string, string>();
  private readonly phones = new Map<string, string>();
  private readonly namesAndBirthDates = new Map<string, string>();

  add(guest: GuestIdentity): void {
    const email = normalizeEmail(guest.email);
    const phone = normalizePhone(guest.phone);
    const nameAndBirthDate = nameBirthDateKey(guest);
    if (email) this.emails.set(email, guest.id);
    if (phone) this.phones.set(phone, guest.id);
    if (nameAndBirthDate)
      this.namesAndBirthDates.set(nameAndBirthDate, guest.id);
  }

  find(guest: GuestIdentity): GuestMatch {
    const candidates = [
      ['email', normalizeEmail(guest.email), this.emails] as const,
      ['phone', normalizePhone(guest.phone), this.phones] as const,
      [
        'nameBirthDate',
        nameBirthDateKey(guest),
        this.namesAndBirthDates,
      ] as const,
    ].flatMap(([reason, key, index]) =>
      key && index.has(key) ? [{ reason, id: index.get(key) as string }] : [],
    );
    const ids = [...new Set(candidates.map((candidate) => candidate.id))];
    if (ids.length > 1) return { type: 'review', ids };
    const candidate = candidates[0];
    return candidate
      ? { type: 'match', id: candidate.id, reason: candidate.reason }
      : { type: 'new' };
  }
}
