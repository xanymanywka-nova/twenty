import { PRODUCT_BRAND } from 'twenty-shared/constants';

import { getTwentyWebsiteUrl } from '@/auth/utils/getTwentyWebsiteUrl';

describe('getTwentyWebsiteUrl', () => {
  it('returns the configured legal pages', () => {
    expect(getTwentyWebsiteUrl('terms')).toBe(PRODUCT_BRAND.termsUrl);
    expect(getTwentyWebsiteUrl('privacy-policy')).toBe(
      PRODUCT_BRAND.privacyUrl,
    );
    expect(getTwentyWebsiteUrl('data-processing-agreement')).toBe(
      PRODUCT_BRAND.dataProcessingAgreementUrl,
    );
  });

  it('never points at the product website root as a legal page', () => {
    expect(getTwentyWebsiteUrl('terms')).not.toBe(PRODUCT_BRAND.websiteUrl);
  });
});
