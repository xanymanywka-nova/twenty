import { parsePhoneNumberWithError } from 'libphonenumber-js';

export const normalizeEmail = (value?: string | null): string | undefined => {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
};

export const normalizePhone = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return undefined;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+49${digits.slice(1)}`;
  return `+${digits}`;
};

// Prisma on SQLite stores DateTime as epoch milliseconds, while other sources hand over ISO strings.
export const isoTimestamp = (value: string | number): string =>
  typeof value === 'number' || /^\d+$/.test(value)
    ? new Date(Number(value)).toISOString()
    : value;

export const nightsBetween = (arrival: string, departure: string): number =>
  Math.max(
    0,
    Math.round((Date.parse(departure) - Date.parse(arrival)) / 86_400_000),
  );

export const ratingOutOfTen = (rating: number, maximum = 10): number =>
  Math.round(Math.min(10, Math.max(0, (rating / maximum) * 10)) * 10) / 10;

export const platformKey = (platform: string): string =>
  platform.toLowerCase().replace(/[^a-z0-9]/g, '');

export const companyExternalId = (name: string): string =>
  `name:${name.trim().toLocaleLowerCase('de').replace(/\s+/g, ' ')}`;

export const splitName = (
  name?: string | null,
): { firstName: string; lastName: string } => {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return {
    firstName: parts[0] ?? 'Unknown',
    lastName: parts.slice(1).join(' '),
  };
};

export const richText = (
  value?: string,
): { blocknote: null; markdown: string | null } => ({
  blocknote: null,
  markdown: value ?? null,
});

export const primaryLink = (
  url?: string,
):
  | {
      primaryLinkUrl: string;
      primaryLinkLabel: string;
      secondaryLinks: never[];
    }
  | undefined =>
  url
    ? { primaryLinkUrl: url, primaryLinkLabel: url, secondaryLinks: [] }
    : undefined;

// Twenty rejects the whole record when any number fails to parse, and legacy data
// holds typos such as "+0652078146", so unparsable numbers are dropped instead.
const isParsablePhone = (number: string): boolean => {
  try {
    parsePhoneNumberWithError(number);
    return true;
  } catch {
    return false;
  }
};

export const phoneValue = (
  primaryPhoneNumber: string,
  additionalPhoneNumbers: string[] = [],
) => {
  const [primary, ...additional] = [
    primaryPhoneNumber,
    ...additionalPhoneNumbers,
  ]
    .map((number) => normalizePhone(number))
    .filter((number): number is string => !!number && isParsablePhone(number));
  if (!primary) return undefined;
  return {
    primaryPhoneNumber: primary,
    primaryPhoneCountryCode: '',
    primaryPhoneCallingCode: '',
    additionalPhones: additional.map((number) => ({
      number,
      countryCode: '',
      callingCode: '',
    })),
  };
};

export const guestExternalId = (guest: {
  email?: string | null | undefined;
  phone?: string | null | undefined;
  name?: string | null | undefined;
  birthDate?: string | null | undefined;
  fallback: string;
}): string => {
  const email = normalizeEmail(guest.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(guest.phone);
  if (phone) return `phone:${phone}`;
  if (guest.name && guest.birthDate)
    return `name-dob:${guest.name.trim().toLowerCase()}|${guest.birthDate}`;
  return `record:${guest.fallback}`;
};

// Reviews, threads and calls rarely carry an email; a name alone is not an
// identity, so those sources only create a Person when this returns a key.
export const identifiedGuestExternalId = (guest: {
  email?: string | null | undefined;
  phone?: string | null | undefined;
  name?: string | null | undefined;
  birthDate?: string | null | undefined;
}): string | undefined => {
  const externalId = guestExternalId({ ...guest, fallback: '' });
  return externalId.startsWith('record:') ? undefined : externalId;
};
