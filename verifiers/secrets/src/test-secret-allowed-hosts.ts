/**
 * Verifies `allowedHosts` survives the inspector → meta → generated JSON
 * pipeline.
 *
 * `test-secretless.ts` covers the enforcement half, but it hand-authors a
 * `SecretDefinitionsMeta` literal, so it stays green even when codegen drops the
 * field and leaves the egress control a permanent no-op at runtime. This reads
 * the real generated artifact instead.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSecretAllowedForHost } from '@pikku/core/services'
import type { SecretDefinitionsMeta } from '@pikku/core/secret'

const metaPath = join(
  fileURLToPath(new URL('../.pikku/secrets/', import.meta.url)),
  'pikku-secrets-meta.gen.json'
)

const meta = JSON.parse(
  readFileSync(metaPath, 'utf-8')
) as SecretDefinitionsMeta

const exampleApi = meta['example-api']
assert.ok(exampleApi, `'example-api' missing from ${metaPath}`)
assert.deepEqual(
  exampleApi.allowedHosts,
  ['api.example.com', '*.example.com'],
  'allowedHosts declared in credentials.ts did not survive code generation'
)
console.log('✓ allowedHosts survives inspector → meta → generated JSON')

const secretId = exampleApi.secretId
assertSecretAllowedForHost(secretId, 'https://api.example.com/v1', meta)
assertSecretAllowedForHost(secretId, 'https://cdn.example.com/v1', meta)
assert.throws(() =>
  assertSecretAllowedForHost(secretId, 'https://evil.example.net/v1', meta)
)
console.log('✓ the generated allowedHosts actually gates an outbound host')
