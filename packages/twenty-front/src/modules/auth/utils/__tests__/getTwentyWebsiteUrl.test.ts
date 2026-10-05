import { getTwentyWebsiteUrl } from '@/auth/utils/getTwentyWebsiteUrl';

describe('getTwentyWebsiteUrl', () => {
  it.each([
    ['ar-SA', 'ar'],
    ['cs-CZ', 'cs'],
    ['de-DE', 'de'],
    ['es-ES', 'es'],
    ['fr-FR', 'fr'],
    ['it-IT', 'it'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['pt-BR', 'pt'],
    ['pt-PT', 'pt'],
    ['ro-RO', 'ro'],
    ['ru-RU', 'ru'],
    ['tr-TR', 'tr'],
    ['zh-CN', 'zh'],
    ['zh-TW', 'zh'],
  ])('uses the localized Nova CRM website path for %s', (locale, language) => {
    expect(getTwentyWebsiteUrl(locale, 'privacy-policy')).toBe(
      `https://crm.nova-tool.online/${language}/privacy-policy`,
    );
  });

  it('uses the default Nova CRM website path for English', () => {
    expect(getTwentyWebsiteUrl('en', 'terms')).toBe(
      'https://crm.nova-tool.online/terms',
    );
  });

  it('uses English for the pseudo locale', () => {
    expect(getTwentyWebsiteUrl('pseudo-en', 'terms')).toBe(
      'https://crm.nova-tool.online/terms',
    );
  });
});
