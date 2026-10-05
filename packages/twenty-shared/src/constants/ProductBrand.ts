type ProductBrand = {
  name: string;
  websiteUrl: string;
  sourceCodeUrl: string;
  logoPath: string;
  darkLogoPath: string;
  markPath: string;
  // Optional: links that point at a missing page are hidden instead.
  termsUrl?: string;
  privacyUrl?: string;
  dataProcessingAgreementUrl?: string;
  documentationUrl?: string;
};

export const PRODUCT_BRAND: ProductBrand = {
  name: 'Nova CRM',
  websiteUrl: 'https://crm.nova-tool.online',
  sourceCodeUrl: 'https://github.com/xanymanywka-nova/twenty',
  logoPath: '/brand/logo.svg',
  darkLogoPath: '/brand/logo-white.svg',
  markPath: '/brand/nova-mark.svg',
};
