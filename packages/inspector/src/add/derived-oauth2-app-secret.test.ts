import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from '../inspector.js'
import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (criticals: Array<{ code: ErrorCode; message: string }>) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ severity, code, message }) => {
      if (severity !== 'warn') {
        criticals.push({ code, message })
      }
    },
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

const inspectSource = async (source: string) => {
  const rootDir = await mkdtemp(
    join(dirname(fileURLToPath(import.meta.url)), 'pikku-oauth-app-secret-')
  )
  const file = join(rootDir, 'credential.ts')
  await writeFile(file, source)
  try {
    return await inspect(makeLogger([]), [file], { rootDir })
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const CREDENTIAL = `
import { defineCredential } from '@pikku/core/credential'
defineCredential({
  name: 'gmailOAuth',
  displayName: 'Gmail',
  type: 'wire',
  schema: {} as any,
  oauth2: {
    appCredentialSecretId: 'GMAIL_APP_CREDENTIALS',
    tokenSecretId: 'GMAIL_TOKENS',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  },
})
`

describe('an OAuth2 credential implies its app secret', () => {
  test('the app secret is declared without anyone writing a defineSecret', async () => {
    const state = await inspectSource(CREDENTIAL)

    const app = state.secrets.definitions.find(
      (d) => d.secretId === 'GMAIL_APP_CREDENTIALS'
    )
    assert.ok(app, 'the app secret the connect flow needs must be declared')
    assert.equal(app!.oauth2?.tokenSecretId, 'GMAIL_TOKENS')
  })

  test("an author's own declaration is left alone", async () => {
    const state = await inspectSource(
      `${CREDENTIAL}
import { defineSecret } from '@pikku/core/secret'
import { z } from 'zod'
const GmailAppSchema = z.object({ clientId: z.string() })
defineSecret({
  name: 'gmailApp',
  displayName: 'My Own Gmail App',
  secretId: 'GMAIL_APP_CREDENTIALS',
  schema: GmailAppSchema,
})
`
    )

    const declared = state.secrets.definitions.filter(
      (d) => d.secretId === 'GMAIL_APP_CREDENTIALS'
    )
    assert.equal(declared.length, 1)
    assert.equal(declared[0]!.displayName, 'My Own Gmail App')
  })
})
