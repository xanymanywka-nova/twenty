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

export const phoneValue = (
  primaryPhoneNumber: string,
  additionalPhoneNumbers: string[] = [],
) => ({
  primaryPhoneNumber: normalizePhone(primaryPhoneNumber) ?? primaryPhoneNumber,
  primaryPhoneCountryCode: '',
  primaryPhoneCallingCode: '',
  additionalPhones: additionalPhoneNumbers.map((number) => ({
    number: normalizePhone(number) ?? number,
    countryCode: '',
    callingCode: '',
  })),
});

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
