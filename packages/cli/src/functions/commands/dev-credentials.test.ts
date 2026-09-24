import assert from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { LocalCredentialService } from '@pikku/core/services'

import {
  createDevCredentialService,
  resolveDevCredentialsKey,
} from './dev-credentials.js'

const runtimeDir = (): string => mkdtempSync(join(tmpdir(), 'pikku-dev-'))

const silentLogger = () => {
  const warnings: string[] = []
  return {
    warnings,
    logger: {
      info: () => {},
      debug: () => {},
      error: () => {},
      warn: (message: string) => warnings.push(message),
    } as any,
  }
}

test('the dev credentials key survives a restart', () => {
  const dir = runtimeDir()
  const first = resolveDevCredentialsKey(dir, {})
  assert.ok(first.length >= 32)
  assert.equal(resolveDevCredentialsKey(dir, {}), first)
  assert.equal(
    readFileSync(join(dir, 'dev-credentials.key'), 'utf8').trim(),
    first
  )
})

test('an explicit key wins over the persisted one', () => {
  const dir = runtimeDir()
  resolveDevCredentialsKey(dir, {})
  assert.equal(
    resolveDevCredentialsKey(dir, { PIKKU_DEV_CREDENTIALS_KEY: 'from-env' }),
    'from-env'
  )
})

test('without a database the store is in memory and nothing is said', async () => {
  const { logger, warnings } = silentLogger()
  const service = await createDevCredentialService({
    kysely: undefined,
    runtimeDir: runtimeDir(),
    logger,
    expectsCredentials: true,
  })
  assert.ok(service instanceof LocalCredentialService)
  assert.deepEqual(warnings, [])
})

test('a database without the credential tables falls back and says why', async () => {
  const { logger, warnings } = silentLogger()
  const missingTables = {
    introspection: {
      getTables: async () => [],
    },
  }
  const service = await createDevCredentialService({
    kysely: missingTables,
    runtimeDir: runtimeDir(),
    logger,
    expectsCredentials: true,
  })
  assert.ok(service instanceof LocalCredentialService)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0]!, /will not survive a restart/)
})
