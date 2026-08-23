import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import {
  ACTOR_SIGN_IN_OPT_IN_ENV,
  ACTOR_SIGN_IN_OPT_IN_VALUE,
  DEV_ACTOR_SIGN_IN_ENV,
  resolveActorSignIn,
} from '@pikku/better-auth'

import {
  ACTOR_SECRET_ENV,
  VITE_ACTOR_SECRET_ENV,
  disableDevActorSignIn,
  enableDevActorSignIn,
} from './actor-sign-in.js'

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
  delete process.env[DEV_ACTOR_SIGN_IN_ENV]
  delete process.env[ACTOR_SIGN_IN_OPT_IN_ENV]
  delete process.env[ACTOR_SECRET_ENV]
  delete process.env[VITE_ACTOR_SECRET_ENV]
}

describe('pikku dev enabling actor sign-in', () => {
  afterEach(clearEnv)

  test('mints an ephemeral secret under both names and opens the gate', () => {
    const logger = recordingLogger()
    enableDevActorSignIn(logger as any)

    const minted = process.env[ACTOR_SECRET_ENV]
    assert.ok(minted && minted.length >= 32, 'a real secret, not a placeholder')
    assert.equal(
      process.env[VITE_ACTOR_SECRET_ENV],
      minted,
      'the dev frontend reads the VITE_-prefixed copy of the same value'
    )
    assert.equal(resolveActorSignIn().enabled, true)
    assert.match(logger.lines.info.join('\n'), /minted for this run/)
  })

  test('the minted secret is per-run, so nothing from a previous run signs in', () => {
    enableDevActorSignIn(recordingLogger() as any)
    const first = process.env[ACTOR_SECRET_ENV]
    clearEnv()
    enableDevActorSignIn(recordingLogger() as any)

    assert.notEqual(process.env[ACTOR_SECRET_ENV], first)
  })

  test('an explicitly-set secret beats the minted one', () => {
    process.env[ACTOR_SECRET_ENV] = 'the-one-the-scenario-runs-use'
    const logger = recordingLogger()
    enableDevActorSignIn(logger as any)

    assert.equal(process.env[ACTOR_SECRET_ENV], 'the-one-the-scenario-runs-use')
    assert.equal(
      process.env[VITE_ACTOR_SECRET_ENV],
      'the-one-the-scenario-runs-use',
      'the frontend copy is filled in from it rather than minted separately'
    )
    assert.match(logger.lines.info.join('\n'), /already in this environment/)
  })

  test('a frontend-only secret is mirrored onto the name the server compares', () => {
    process.env[VITE_ACTOR_SECRET_ENV] = 'set-by-the-frontend-env-file'
    enableDevActorSignIn(recordingLogger() as any)

    assert.equal(
      process.env[ACTOR_SECRET_ENV],
      'set-by-the-frontend-env-file',
      'otherwise the switcher posts a secret the server never heard of'
    )
  })

  test('names a disagreement between the two rather than picking silently', () => {
    process.env[ACTOR_SECRET_ENV] = 'server-side'
    process.env[VITE_ACTOR_SECRET_ENV] = 'frontend-side'
    const logger = recordingLogger()
    enableDevActorSignIn(logger as any)

    assert.equal(process.env[ACTOR_SECRET_ENV], 'server-side')
    assert.equal(process.env[VITE_ACTOR_SECRET_ENV], 'server-side')
    assert.match(logger.lines.warn.join('\n'), /different values/)
  })
})

describe('pikku serve refusing actor sign-in', () => {
  afterEach(clearEnv)

  test('leaves the gate shut even with a secret in the environment', () => {
    process.env[ACTOR_SECRET_ENV] = 'leaked-into-production'
    disableDevActorSignIn(recordingLogger() as any)

    assert.equal(resolveActorSignIn().enabled, false)
  })

  test('clears an inherited dev marker and says that it did', () => {
    process.env[DEV_ACTOR_SIGN_IN_ENV] = 'true'
    const logger = recordingLogger()
    disableDevActorSignIn(logger as any)

    assert.equal(process.env[DEV_ACTOR_SIGN_IN_ENV], undefined)
    assert.equal(resolveActorSignIn().enabled, false)
    assert.match(logger.lines.warn.join('\n'), /has been cleared/)
  })

  test('never enables anything, so it stays quiet on a clean environment', () => {
    const logger = recordingLogger()
    disableDevActorSignIn(logger as any)

    assert.deepEqual(logger.lines.warn, [])
    assert.deepEqual(logger.lines.info, [])
  })

  test('leaves the deliberate opt-in alone, so a deployed stage can run scenarios', () => {
    process.env[ACTOR_SIGN_IN_OPT_IN_ENV] = ACTOR_SIGN_IN_OPT_IN_VALUE
    disableDevActorSignIn(recordingLogger() as any)

    assert.equal(resolveActorSignIn().enabled, true)
  })
})
