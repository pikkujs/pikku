import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import {
  VIRTUAL_USER_SIGN_IN_OPT_IN_ENV,
  VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
  DEV_VIRTUAL_USER_SIGN_IN_ENV,
  resolveVirtualUserSignIn,
} from '@pikku/better-auth'

import {
  disableDevVirtualUserSignIn,
  enableDevVirtualUserSignIn,
  setDevVirtualUserApiUrl,
} from './virtual-user-sign-in.js'
import {
  verifyKeyFor,
  readDevSigningKey,
} from '../utils/virtual-user-signer.js'

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
  delete process.env.VIRTUAL_USER_VERIFY_KEY
  delete process.env.VIRTUAL_USER_API_URL
}

const runtimeDir = () => mkdtempSync(join(tmpdir(), 'pikku-vu-'))

describe('pikku dev enabling virtual user sign-in', () => {
  beforeEach(clearEnv)
  afterEach(clearEnv)

  test('opens the gate and hands the app only the public key', () => {
    const dir = runtimeDir()
    enableDevVirtualUserSignIn(recordingLogger() as any, dir)

    assert.equal(resolveVirtualUserSignIn().enabled, true)
    assert.equal(
      process.env.VIRTUAL_USER_VERIFY_KEY,
      verifyKeyFor(readDevSigningKey(dir)!)
    )
    assert.ok(
      !Object.values(process.env).includes(readDevSigningKey(dir)),
      'the private key is on disk only'
    )
  })

  test('a restart keeps the key, so a statement signed before it still verifies', () => {
    const dir = runtimeDir()
    enableDevVirtualUserSignIn(recordingLogger() as any, dir)
    const first = process.env.VIRTUAL_USER_VERIFY_KEY
    clearEnv()
    enableDevVirtualUserSignIn(recordingLogger() as any, dir)

    assert.equal(process.env.VIRTUAL_USER_VERIFY_KEY, first)
  })

  test('another project gets another key', () => {
    enableDevVirtualUserSignIn(recordingLogger() as any, runtimeDir())
    const first = process.env.VIRTUAL_USER_VERIFY_KEY
    clearEnv()
    enableDevVirtualUserSignIn(recordingLogger() as any, runtimeDir())

    assert.notEqual(process.env.VIRTUAL_USER_VERIFY_KEY, first)
  })
})

describe('the address a run drives the dev server at', () => {
  beforeEach(clearEnv)
  afterEach(clearEnv)

  test('is the bound origin plus the prefix the dev environment names', () => {
    setDevVirtualUserApiUrl(
      'http://localhost:4123',
      'http://localhost:3000/api/'
    )
    assert.equal(process.env.VIRTUAL_USER_API_URL, 'http://localhost:4123/api')
  })

  test('is the bound origin alone when the environment names none', () => {
    setDevVirtualUserApiUrl('http://localhost:4123', undefined)
    assert.equal(process.env.VIRTUAL_USER_API_URL, 'http://localhost:4123')
  })

  test('leaves an address the project set itself alone', () => {
    process.env.VIRTUAL_USER_API_URL = 'https://tunnel.example.com'
    setDevVirtualUserApiUrl('http://localhost:4123', undefined)
    assert.equal(process.env.VIRTUAL_USER_API_URL, 'https://tunnel.example.com')
  })
})

describe('pikku serve refusing virtual user sign-in', () => {
  beforeEach(clearEnv)
  afterEach(clearEnv)

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
