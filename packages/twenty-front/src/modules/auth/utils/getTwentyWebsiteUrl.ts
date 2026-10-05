import {
  DOCUMENTATION_DEFAULT_LANGUAGE,
  DOCUMENTATION_SUPPORTED_LANGUAGES,
  PRODUCT_BRAND,
  type DocumentationSupportedLanguage,
} from 'twenty-shared/constants';

type TwentyWebsitePage = 'terms' | 'privacy-policy';

export const getTwentyWebsiteUrl = (
  locale: string,
  page: TwentyWebsitePage,
): string => {
  const language = new Intl.Locale(locale).language;

  const isLocalizedWebsitePath =
    language !== DOCUMENTATION_DEFAULT_LANGUAGE &&
    DOCUMENTATION_SUPPORTED_LANGUAGES.some(
      (supportedLanguage: DocumentationSupportedLanguage) =>
        supportedLanguage === language,
    );

  const url = new URL(
    isLocalizedWebsitePath ? `/${language}/${page}` : `/${page}`,
    PRODUCT_BRAND.websiteUrl,
  );

  return url.toString();
};
