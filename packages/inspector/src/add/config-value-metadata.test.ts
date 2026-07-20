import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from '../inspector.js'
import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

// Fixtures must sit inside the package so `zod` resolves — the schema-vendor
// check rejects a schema it cannot trace to a supported library, and the
// definition is then never recorded at all.
const fixtureRoot = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '__fixtures'
)

const makeLogger = (criticals: Array<{ code: ErrorCode; message: string }>) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }) => {
      criticals.push({ code, message })
    },
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

/**
 * `docsUrl` is only useful if it survives inspection — a field declared on the
 * wiring but dropped by the inspector is invisible to every consumer
 * downstream, which is exactly how `displayName` went unused.
 */
describe('config value metadata (docsUrl)', () => {
  test('carries docsUrl from wireSecret into the definition', async () => {
    const rootDir = await mkdtemp(`${fixtureRoot}-secret-`)
    const file = join(rootDir, 'secret.ts')

    await writeFile(
      file,
      [
        "import { wireSecret } from '@pikku/core'",
        "import { z } from 'zod'",
        'export const StripeKeySchema = z.string()',
        'wireSecret({',
        "  name: 'stripeKey',",
        "  displayName: 'Stripe Secret Key',",
        "  secretId: 'STRIPE_SECRET_KEY',",
        "  docsUrl: 'https://dashboard.stripe.com/apikeys',",
        '  schema: StripeKeySchema,',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      const def = state.secrets.definitions.find(
        (d) => d.secretId === 'STRIPE_SECRET_KEY'
      )
      assert.ok(def, 'expected the secret definition to be inspected')
      assert.equal(def!.docsUrl, 'https://dashboard.stripe.com/apikeys')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('leaves docsUrl undefined when not declared', async () => {
    const rootDir = await mkdtemp(`${fixtureRoot}-bare-`)
    const file = join(rootDir, 'secret.ts')

    await writeFile(
      file,
      [
        "import { wireSecret } from '@pikku/core'",
        "import { z } from 'zod'",
        'export const ApiKeySchema = z.string()',
        'wireSecret({',
        "  name: 'apiKey',",
        "  displayName: 'API Key',",
        "  secretId: 'API_KEY',",
        '  schema: ApiKeySchema,',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      const def = state.secrets.definitions.find(
        (d) => d.secretId === 'API_KEY'
      )
      assert.ok(def, 'expected the secret definition to be inspected')
      assert.equal(def!.docsUrl, undefined)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('carries docsUrl from wireVariable into the definition', async () => {
    const rootDir = await mkdtemp(`${fixtureRoot}-variable-`)
    const file = join(rootDir, 'variable.ts')

    await writeFile(
      file,
      [
        "import { wireVariable } from '@pikku/core'",
        "import { z } from 'zod'",
        'export const ConsoleUrlSchema = z.string()',
        'wireVariable({',
        "  name: 'consoleUrl',",
        "  displayName: 'Console URL',",
        "  variableId: 'CONSOLE_URL',",
        "  docsUrl: 'https://example.com/docs/console-url',",
        '  schema: ConsoleUrlSchema,',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      const def = state.variables.definitions.find(
        (d) => d.variableId === 'CONSOLE_URL'
      )
      assert.ok(def, 'expected the variable definition to be inspected')
      assert.equal(def!.docsUrl, 'https://example.com/docs/console-url')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('carries docsUrl from wireCredential into the definition', async () => {
    const rootDir = await mkdtemp(`${fixtureRoot}-credential-`)
    const file = join(rootDir, 'credential.ts')

    await writeFile(
      file,
      [
        "import { wireCredential } from '@pikku/core'",
        "import { z } from 'zod'",
        'export const TokenSchema = z.object({ token: z.string() })',
        'wireCredential({',
        "  name: 'githubToken',",
        "  displayName: 'GitHub Token',",
        "  type: 'wire',",
        "  docsUrl: 'https://github.com/settings/tokens',",
        '  schema: TokenSchema,',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      const def = state.credentials.definitions.find(
        (d) => d.name === 'githubToken'
      )
      assert.ok(def, 'expected the credential definition to be inspected')
      assert.equal(def!.docsUrl, 'https://github.com/settings/tokens')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
