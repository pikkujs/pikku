import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import {
  VIRTUAL_USER_SIGN_IN_OPT_IN_ENV,
  VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
  DEV_VIRTUAL_USER_SIGN_IN_ENV,
  resolveVirtualUserSignIn,
} from '@pikku/better-auth'

import {
  VIRTUAL_USER_SECRET_ENV,
  VITE_VIRTUAL_USER_SECRET_ENV,
  disableDevVirtualUserSignIn,
  enableDevVirtualUserSignIn,
} from './virtual-user-sign-in.js'

const recordingLogger = () => {
  const info: string[] = []
  const warn: string[] = []
  return {
    info: (message: string) => info.push(message),
    warn: (message: string) => warn.push(message),
    error: () => {},
    debug: () => {},
    setLevel: () => {},
    lines: { info, warn },
  }
}

const clearEnv = () => {
  delete process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV]
  delete process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV]
  delete process.env[VIRTUAL_USER_SECRET_ENV]
  delete process.env[VITE_VIRTUAL_USER_SECRET_ENV]
  delete process.env.VITE_DEV_VIRTUAL_USER_SECRETS
}

describe('pikku dev enabling virtual user sign-in', () => {
  beforeEach(clearEnv)
  afterEach(clearEnv)

  test('mints an ephemeral root and opens the gate', async () => {
    const logger = recordingLogger()
    await enableDevVirtualUserSignIn(logger as any)

    const minted = process.env[VIRTUAL_USER_SECRET_ENV]
    assert.ok(minted && minted.length >= 32, 'a real secret, not a placeholder')
    assert.equal(
      process.env[VITE_VIRTUAL_USER_SECRET_ENV],
      undefined,
      'the root derives every virtual user, so it never reaches the bundle'
    )
    assert.equal(resolveVirtualUserSignIn().enabled, true)
    assert.match(logger.lines.info.join('\n'), /minted for this run/)
  })

  test('the minted root is per-run, so nothing from a previous run signs in', async () => {
    await enableDevVirtualUserSignIn(recordingLogger() as any)
    const first = process.env[VIRTUAL_USER_SECRET_ENV]
    clearEnv()
    await enableDevVirtualUserSignIn(recordingLogger() as any)

    assert.notEqual(process.env[VIRTUAL_USER_SECRET_ENV], first)
  })

  test('an explicitly-set root beats the minted one', async () => {
    process.env[VIRTUAL_USER_SECRET_ENV] =
      'the-one-the-scenario-runs-use-and-then-some'
    const logger = recordingLogger()
    await enableDevVirtualUserSignIn(logger as any)

    assert.equal(
      process.env[VIRTUAL_USER_SECRET_ENV],
      'the-one-the-scenario-runs-use-and-then-some'
    )
    assert.match(logger.lines.info.join('\n'), /already in this environment/)
  })

  test('a frontend-only root is mirrored onto the name the server derives from', async () => {
    process.env[VITE_VIRTUAL_USER_SECRET_ENV] =
      'set-by-the-frontend-env-file-and-long-enough'
    await enableDevVirtualUserSignIn(recordingLogger() as any)

    assert.equal(
      process.env[VIRTUAL_USER_SECRET_ENV],
      'set-by-the-frontend-env-file-and-long-enough',
      'otherwise the switcher posts credentials the server never derived'
    )
    assert.equal(process.env[VITE_VIRTUAL_USER_SECRET_ENV], undefined)
  })

  test('names a disagreement between the two rather than picking silently', async () => {
    process.env[VIRTUAL_USER_SECRET_ENV] =
      'server-side-root-that-is-long-enough-ok'
    process.env[VITE_VIRTUAL_USER_SECRET_ENV] =
      'frontend-side-root-that-is-long-enough'
    const logger = recordingLogger()
    await enableDevVirtualUserSignIn(logger as any)

    assert.equal(
      process.env[VIRTUAL_USER_SECRET_ENV],
      'server-side-root-that-is-long-enough-ok'
    )
    assert.match(logger.lines.warn.join('\n'), /different values/)
  })

  test('puts no virtual user credential in the frontend env', async () => {
    await enableDevVirtualUserSignIn(recordingLogger() as any)

    assert.equal(process.env.VITE_DEV_VIRTUAL_USER_SECRETS, undefined)
  })

  test('a root too short to derive from says why', async () => {
    process.env[VIRTUAL_USER_SECRET_ENV] = 'too-short'
    const logger = recordingLogger()
    await enableDevVirtualUserSignIn(logger as any)

    assert.match(logger.lines.warn.join('\n'), /shorter than 32 characters/)
  })
})

describe('pikku serve refusing virtual user sign-in', () => {
  beforeEach(clearEnv)
  afterEach(clearEnv)

  test('leaves the gate shut even with a secret in the environment', () => {
    process.env[VIRTUAL_USER_SECRET_ENV] = 'leaked-into-production'
    disableDevVirtualUserSignIn(recordingLogger() as any)

    assert.equal(resolveVirtualUserSignIn().enabled, false)
  })

  test('clears an inherited dev marker and says that it did', () => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
    const logger = recordingLogger()
    disableDevVirtualUserSignIn(logger as any)

    assert.equal(process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV], undefined)
    assert.equal(resolveVirtualUserSignIn().enabled, false)
    assert.match(logger.lines.warn.join('\n'), /has been cleared/)
  })

  test('never enables anything, so it stays quiet on a clean environment', () => {
    const logger = recordingLogger()
    disableDevVirtualUserSignIn(logger as any)

    assert.deepEqual(logger.lines.warn, [])
    assert.deepEqual(logger.lines.info, [])
  })

  test('leaves the deliberate opt-in alone, so a deployed stage can run scenarios', () => {
    process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV] =
      VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE
    disableDevVirtualUserSignIn(recordingLogger() as any)

    assert.equal(resolveVirtualUserSignIn().enabled, true)
  })
})
