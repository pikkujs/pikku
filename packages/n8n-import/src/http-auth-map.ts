/**
 * Maps an authenticated n8n HTTP Request node onto an `HttpAuthDescriptor` — the
 * recipe the native `graph:httpRequest` function uses to inject auth from a
 * Pikku secret at request time.
 *
 * n8n keeps the actual auth material (secret value, and for generic header/query
 * auth the header/param NAME) in its own credential store, which the workflow
 * export never carries. So the export tells us the auth *type* but not always
 * the exact header — hence the `Authorization: Bearer` default + `todo` note for
 * generic header auth. OAuth2 and custom auth have no static recipe and stay a
 * throwing stub in v1 (the map returns `undefined`, same graceful-degradation
 * contract as `mapModel`).
 */
import type { HttpAuthDescriptor, N8nCredentialRef } from './types.js'
import { credentialNameForRef } from './credentials.js'

/** The node fields an auth recipe reads — satisfied by both N8nNode and ParsedNode. */
export interface AuthNode {
  name: string
  parameters?: Record<string, unknown>
  credentials?: Record<string, N8nCredentialRef>
}

/** Recipe minus the per-node `credential` name (filled in from the node). */
type Recipe = Omit<HttpAuthDescriptor, 'credential'>

/**
 * When a predefined `nodeCredentialType` isn't in the table below: `'stub'`
 * leaves the node a throwing stub (no auth guess); `'bearer'` emits a
 * best-effort `Authorization: Bearer` + a TODO. Defaults to `'stub'`.
 */
export const UNKNOWN_PREDEFINED_FALLBACK: 'stub' | 'bearer' = 'stub'

const HEADER_TODO =
  "n8n stored the auth header name in its credential store (absent from the export); assumed 'Authorization: Bearer'. Confirm the header for this API."
const QUERY_TODO =
  "n8n stored the auth query-param name in its credential store (absent from the export); assumed 'api_key'. Confirm the param for this API."

/** Generic auth types (`authentication === 'genericCredentialType'`). */
const GENERIC: Record<string, Recipe | undefined> = {
  httpheaderauth: { mode: 'bearer', todo: HEADER_TODO },
  httpbasicauth: { mode: 'basic' },
  httpqueryauth: {
    mode: 'apiKeyQuery',
    queryName: 'api_key',
    todo: QUERY_TODO,
  },
  // Custom auth (arbitrary headers/query/body) + OAuth2 have no static recipe.
  httpcustomauth: undefined,
  oauth2api: undefined,
}

/**
 * Predefined credential types (`authentication === 'predefinedCredentialType'`).
 * Each row encodes the API's documented static-key auth scheme; OAuth1/OAuth2
 * types are excluded by the suffix rule in `predefinedRecipe`.
 */
const PREDEFINED: Record<string, Recipe> = {
  // Bearer token in the Authorization header.
  openaiapi: { mode: 'bearer' },
  airtabletokenapi: { mode: 'bearer' },
  slackapi: { mode: 'bearer' },
  cloudflareapi: { mode: 'bearer' },
  todoistapi: { mode: 'bearer' },
  mistralcloudapi: { mode: 'bearer' },
  stripeapi: { mode: 'bearer' },
  githubapi: { mode: 'bearer' },
  whatsappapi: { mode: 'bearer' },
  hubspotapptoken: { mode: 'bearer' },
  huggingfaceapi: { mode: 'bearer' },
  mailerliteapi: { mode: 'bearer' },
  notionapi: {
    mode: 'bearer',
    extraHeaders: { 'Notion-Version': '2022-06-28' },
  },
  anthropicapi: {
    mode: 'apiKeyHeader',
    headerName: 'x-api-key',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
  },
  // API key in a named header.
  qdrantapi: { mode: 'apiKeyHeader', headerName: 'api-key' },
  n8napi: { mode: 'apiKeyHeader', headerName: 'X-N8N-API-KEY' },
  clockifyapi: { mode: 'apiKeyHeader', headerName: 'X-Api-Key' },
  virustotalapi: { mode: 'apiKeyHeader', headerName: 'x-apikey' },
  shopifyaccesstokenapi: {
    mode: 'apiKeyHeader',
    headerName: 'X-Shopify-Access-Token',
  },
  nocodbapitoken: { mode: 'apiKeyHeader', headerName: 'xc-token' },
  googlepalmapi: { mode: 'apiKeyHeader', headerName: 'x-goog-api-key' },
  dropcontactapi: { mode: 'apiKeyHeader', headerName: 'X-Access-Token' },
  // API key in a query parameter.
  serpapi: { mode: 'apiKeyQuery', queryName: 'api_key' },
  pipedriveapi: { mode: 'apiKeyQuery', queryName: 'api_token' },
  facebookgraphapi: { mode: 'apiKeyQuery', queryName: 'access_token' },
  calapi: { mode: 'apiKeyQuery', queryName: 'apiKey' },
  // Basic auth (credentials provisioned as `user:pass`).
  wordpressapi: { mode: 'basic' },
  qualysapi: { mode: 'basic' },
  zendeskapi: { mode: 'basic' },
  lemlistapi: { mode: 'basic' },
  woocommerceapi: { mode: 'basic' },
}

/** Legacy top-level auth modes map onto their generic equivalents. */
const LEGACY: Record<string, string> = {
  headerauth: 'httpheaderauth',
  basicauth: 'httpbasicauth',
  queryauth: 'httpqueryauth',
}

function predefinedRecipe(credType: string): Recipe | undefined {
  const key = credType.toLowerCase()
  if (key.endsWith('oauth2api') || key.endsWith('oauth1api')) return undefined
  if (key in PREDEFINED) return PREDEFINED[key]
  return UNKNOWN_PREDEFINED_FALLBACK === 'bearer'
    ? {
        mode: 'bearer',
        todo: `unrecognized n8n credential type "${credType}"; assumed 'Authorization: Bearer'. Confirm for this API.`,
      }
    : undefined
}

function firstCredRef(node: AuthNode): N8nCredentialRef | undefined {
  return Object.values(node.credentials ?? {})[0]
}

/**
 * The auth recipe for an authenticated HTTP Request node, or `undefined` when it
 * has no static recipe (OAuth2, custom auth, unknown predefined type) — the
 * caller then leaves the node a throwing integration stub. No-auth nodes are
 * handled separately (they become a plain `graph:httpRequest`).
 */
export function httpAuthRecipe(node: AuthNode): HttpAuthDescriptor | undefined {
  const p = node.parameters ?? {}
  const auth =
    typeof p.authentication === 'string' ? p.authentication : undefined
  if (!auth || auth === 'none') return undefined

  let recipe: Recipe | undefined
  let credType: string | undefined

  if (auth === 'genericCredentialType') {
    credType =
      typeof p.genericAuthType === 'string' ? p.genericAuthType : undefined
    recipe = credType ? GENERIC[credType.toLowerCase()] : undefined
  } else if (auth === 'predefinedCredentialType') {
    credType =
      typeof p.nodeCredentialType === 'string'
        ? p.nodeCredentialType
        : undefined
    recipe = credType ? predefinedRecipe(credType) : undefined
  } else {
    const generic = LEGACY[auth.toLowerCase()]
    recipe = generic ? GENERIC[generic] : undefined
  }

  if (!recipe) return undefined

  const ref = (credType && node.credentials?.[credType]) || firstCredRef(node)
  const credential = credentialNameForRef(ref, node.name)
  return { ...recipe, credential }
}
