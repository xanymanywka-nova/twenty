import { DOCUMENTATION_BASE_URL } from 'twenty-shared/constants';
import { ApiPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

type ApiCatalogLink = { href: string; type: string };

type ApiCatalogEntry = {
  anchor: string;
  'service-desc'?: ApiCatalogLink[];
  'service-doc'?: ApiCatalogLink[];
  'service-meta'?: ApiCatalogLink[];
};

// Without a documentation site the catalog advertises no human docs rather
// than links that 404.
const serviceDoc = (path: string): Pick<ApiCatalogEntry, 'service-doc'> =>
  isDefined(DOCUMENTATION_BASE_URL)
    ? {
        'service-doc': [
          { href: `${DOCUMENTATION_BASE_URL}${path}`, type: 'text/html' },
        ],
      }
    : {};

const API_DOCS = serviceDoc('/developers/extend/api');
const MCP_DOCS = serviceDoc('/user-guide/ai/capabilities/mcp');

// Points at each host's live OpenAPI, generated per workspace with its custom objects.
export const buildApiCatalog = (
  baseUrl: string,
): { linkset: ApiCatalogEntry[] } => ({
  linkset: [
    {
      anchor: `${baseUrl}/${ApiPath.Rest}`,
      'service-desc': [
        {
          href: `${baseUrl}/${ApiPath.Rest}/open-api/core`,
          type: 'application/json',
        },
      ],
      ...API_DOCS,
      'service-meta': [
        {
          href: `${baseUrl}/${ApiPath.WellKnown}/oauth-protected-resource`,
          type: 'application/json',
        },
      ],
    },
    {
      anchor: `${baseUrl}/${ApiPath.Rest}/metadata`,
      'service-desc': [
        {
          href: `${baseUrl}/${ApiPath.Rest}/open-api/metadata`,
          type: 'application/json',
        },
      ],
      ...API_DOCS,
    },
    {
      anchor: `${baseUrl}/${ApiPath.GraphQL}`,
      ...API_DOCS,
    },
    {
      anchor: `${baseUrl}/${ApiPath.Mcp}`,
      'service-desc': [
        {
          href: `${baseUrl}/${ApiPath.WellKnown}/mcp/server-card.json`,
          type: 'application/json',
        },
      ],
      ...MCP_DOCS,
    },
  ],
});
