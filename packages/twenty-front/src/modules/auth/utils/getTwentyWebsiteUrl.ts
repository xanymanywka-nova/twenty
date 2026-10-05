import { PRODUCT_BRAND } from 'twenty-shared/constants';

type TwentyWebsitePage =
  | 'terms'
  | 'privacy-policy'
  | 'data-processing-agreement';

export const getTwentyWebsiteUrl = (
  page: TwentyWebsitePage,
): string | undefined => {
  switch (page) {
    case 'terms':
      return PRODUCT_BRAND.termsUrl;
    case 'privacy-policy':
      return PRODUCT_BRAND.privacyUrl;
    case 'data-processing-agreement':
      return PRODUCT_BRAND.dataProcessingAgreementUrl;
  }
};
