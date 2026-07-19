import { test } from 'node:test'
import assert from 'node:assert/strict'
import { httpAuthRecipe } from './http-auth-map.js'
import type { ParsedNode } from './types.js'

const httpNode = (
  parameters: Record<string, unknown>,
  credentials?: ParsedNode['credentials']
): ParsedNode =>
  ({
    id: '1',
    name: 'Call API',
    nodeId: 'callApi',
    type: 'n8n-nodes-base.httpRequest',
    typeShort: 'httpRequest',
    parameters,
    credentials,
    disabled: false,
    role: 'integration',
    rpcName: 'httpRequest__callApi',
  }) as ParsedNode

test('no auth / none → undefined (handled by the no-auth path, not a recipe)', () => {
  assert.equal(httpAuthRecipe(httpNode({})), undefined)
  assert.equal(httpAuthRecipe(httpNode({ authentication: 'none' })), undefined)
})

test('generic httpHeaderAuth → bearer (header name absent from export) + TODO', () => {
  const r = httpAuthRecipe(
    httpNode(
      {
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
      },
      { httpHeaderAuth: { name: 'OpsGenie' } }
    )
  )
  assert.equal(r?.mode, 'bearer')
  assert.equal(r?.credential, 'ops-genie')
  assert.ok(r?.todo && /header/i.test(r.todo))
})

test('generic httpBasicAuth → basic', () => {
  const r = httpAuthRecipe(
    httpNode(
      {
        authentication: 'genericCredentialType',
        genericAuthType: 'httpBasicAuth',
      },
      { httpBasicAuth: { name: 'n8n Creds' } }
    )
  )
  assert.equal(r?.mode, 'basic')
  assert.equal(r?.credential, 'n8n-creds')
})

test('generic httpQueryAuth → apiKeyQuery with default query name + TODO', () => {
  const r = httpAuthRecipe(
    httpNode({
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
    })
  )
  assert.equal(r?.mode, 'apiKeyQuery')
  assert.equal(r?.queryName, 'api_key')
  assert.ok(r?.todo)
})

test('generic httpCustomAuth → undefined (stub in v1)', () => {
  assert.equal(
    httpAuthRecipe(
      httpNode({
        authentication: 'genericCredentialType',
        genericAuthType: 'httpCustomAuth',
      })
    ),
    undefined
  )
})

test('generic oAuth2Api → undefined (stub in v1)', () => {
  assert.equal(
    httpAuthRecipe(
      httpNode({
        authentication: 'genericCredentialType',
        genericAuthType: 'oAuth2Api',
      })
    ),
    undefined
  )
})

test('predefined openAiApi → bearer', () => {
  const r = httpAuthRecipe(
    httpNode(
      {
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'openAiApi',
      },
      { openAiApi: { name: 'My OpenAI' } }
    )
  )
  assert.equal(r?.mode, 'bearer')
  assert.equal(r?.credential, 'my-open-ai')
})

test('predefined notionApi → bearer + Notion-Version extra header', () => {
  const r = httpAuthRecipe(
    httpNode({
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'notionApi',
    })
  )
  assert.equal(r?.mode, 'bearer')
  assert.deepEqual(r?.extraHeaders, { 'Notion-Version': '2022-06-28' })
})

test('predefined wordpressApi → basic', () => {
  const r = httpAuthRecipe(
    httpNode({
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'wordpressApi',
    })
  )
  assert.equal(r?.mode, 'basic')
})

test('predefined header-key APIs → apiKeyHeader with the right header name', () => {
  const cases: Array<[string, string]> = [
    ['qdrantApi', 'api-key'],
    ['n8nApi', 'X-N8N-API-KEY'],
    ['clockifyApi', 'X-Api-Key'],
    ['virusTotalApi', 'x-apikey'],
    ['shopifyAccessTokenApi', 'X-Shopify-Access-Token'],
    ['nocoDbApiToken', 'xc-token'],
    ['googlePalmApi', 'x-goog-api-key'],
    ['dropcontactApi', 'X-Access-Token'],
  ]
  for (const [credType, headerName] of cases) {
    const r = httpAuthRecipe(
      httpNode({
        authentication: 'predefinedCredentialType',
        nodeCredentialType: credType,
      })
    )
    assert.equal(r?.mode, 'apiKeyHeader', credType)
    assert.equal(r?.headerName, headerName, credType)
  }
})

test('predefined bearer-token APIs → bearer', () => {
  for (const credType of [
    'cloudflareApi',
    'todoistApi',
    'mistralCloudApi',
    'stripeApi',
    'githubApi',
    'whatsAppApi',
    'hubspotAppToken',
    'huggingFaceApi',
    'mailerLiteApi',
  ]) {
    const r = httpAuthRecipe(
      httpNode({
        authentication: 'predefinedCredentialType',
        nodeCredentialType: credType,
      })
    )
    assert.equal(r?.mode, 'bearer', credType)
  }
})

test('predefined query-key APIs → apiKeyQuery with the right param name', () => {
  const cases: Array<[string, string]> = [
    ['serpApi', 'api_key'],
    ['pipedriveApi', 'api_token'],
    ['facebookGraphApi', 'access_token'],
    ['calApi', 'apiKey'],
  ]
  for (const [credType, queryName] of cases) {
    const r = httpAuthRecipe(
      httpNode({
        authentication: 'predefinedCredentialType',
        nodeCredentialType: credType,
      })
    )
    assert.equal(r?.mode, 'apiKeyQuery', credType)
    assert.equal(r?.queryName, queryName, credType)
  }
})

test('predefined basic-auth APIs → basic', () => {
  for (const credType of [
    'qualysApi',
    'zendeskApi',
    'lemlistApi',
    'wooCommerceApi',
  ]) {
    const r = httpAuthRecipe(
      httpNode({
        authentication: 'predefinedCredentialType',
        nodeCredentialType: credType,
      })
    )
    assert.equal(r?.mode, 'basic', credType)
  }
})

test('predefined anthropicApi → apiKeyHeader x-api-key + anthropic-version', () => {
  const r = httpAuthRecipe(
    httpNode({
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'anthropicApi',
    })
  )
  assert.equal(r?.mode, 'apiKeyHeader')
  assert.equal(r?.headerName, 'x-api-key')
  assert.equal(r?.extraHeaders?.['anthropic-version'], '2023-06-01')
})

test('predefined *OAuth2Api → undefined (stub in v1)', () => {
  assert.equal(
    httpAuthRecipe(
      httpNode({
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'slackOAuth2Api',
      })
    ),
    undefined
  )
})

test('unknown predefined credential type → undefined (default fallback is stub)', () => {
  assert.equal(
    httpAuthRecipe(
      httpNode({
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'someObscureApi',
      })
    ),
    undefined
  )
})

test('legacy top-level headerAuth → bearer', () => {
  const r = httpAuthRecipe(
    httpNode(
      { authentication: 'headerAuth' },
      { httpHeaderAuth: { name: 'Legacy Header' } }
    )
  )
  assert.equal(r?.mode, 'bearer')
  assert.equal(r?.credential, 'legacy-header')
})

test('credential name falls back to the node name when no credential ref is present', () => {
  const r = httpAuthRecipe(
    httpNode({
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openAiApi',
    })
  )
  assert.equal(r?.credential, 'call-api')
})
