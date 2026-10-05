const LEGAL_FORM =
  /\b(gmbh|ug|ag|kg|ohg|gbr|ltd|limited|llc|inc|corp|b\.?v\.?|s\.?a\.?)\b/i;
const BUSINESS_WORD =
  /\b(logistik|transport|handel|service|consulting|engineering|agentur|agency|hotel|immobilien|bau|technik|group|holding)\b/i;
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'web.de',
  'gmx.de',
  'gmx.net',
  't-online.de',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'freenet.de',
]);
const OTA_EMAIL =
  /@(guest\.booking\.com|m\.expediapartnercentral\.com|guest\.airbnb\.com|reply\.airbnb\.com)$/i;

export type CustomerClassification = {
  type: 'B2B' | 'B2C';
  score: number;
  signals: string[];
};

export const classifyCustomer = (input: {
  name?: string | undefined;
  companyName?: string | undefined;
  email?: string | undefined;
}): CustomerClassification => {
  let score = 0;
  const signals: string[] = [];
  const combinedName = `${input.companyName ?? ''} ${input.name ?? ''}`;
  if (input.companyName?.trim()) {
    score += 60;
    signals.push('companyField');
  }
  if (LEGAL_FORM.test(combinedName)) {
    score += 60;
    signals.push('legalForm');
  }
  if (BUSINESS_WORD.test(combinedName)) {
    score += 30;
    signals.push('businessWord');
  }
  const domain = input.email?.trim().toLowerCase().split('@')[1];
  if (
    domain &&
    !FREE_EMAIL_DOMAINS.has(domain) &&
    !OTA_EMAIL.test(input.email ?? '')
  ) {
    score += 25;
    signals.push('corporateDomain');
  }
  return { type: score >= 45 ? 'B2B' : 'B2C', score, signals };
};
