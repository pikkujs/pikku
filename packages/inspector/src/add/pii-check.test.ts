import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeLogger() {
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  const logger: InspectorLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    critical: (code, message) => criticals.push({ code, message }),
    hasCriticalErrors: () => criticals.length > 0,
  }
  return { logger, criticals }
}

/**
 * Inline Private<T>/Pii<T>/Secret<T> definitions that the test source files use.
 * Mirrors what schema.d.ts emits so the TypeScript program sees the correct
 * structural brand type even without @pikku/core being importable from /tmp.
 */
const BRAND_TYPES = `
type Private<T> = T & { readonly __classification__: 'private' }
type Pii<T> = T & { readonly __classification__: 'pii' }
type Secret<T> = T & { readonly __classification__: 'secret' }
`

async function runInspect(sourceCode: string) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'pikku-pii-test-'))
  const file = join(tmpDir, 'funcs.ts')
  await writeFile(file, sourceCode)
  const { logger, criticals } = makeLogger()
  try {
    await inspect(logger, [file], { rootDir: tmpDir })
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
  return criticals
}

// ── findPiiPaths unit tests via full inspect() round-trip ────────────────────

describe('PII output check — PKU910', () => {
  test('flags a top-level Private<string> field', async () => {
    const criticals = await runInspect(`
${BRAND_TYPES}
import { pikkuFunc } from '@pikku/core'
export const getUser = pikkuFunc({
  func: async () => {
    const email = 'test@example.com' as Private<string>
    return { id: 1, email }
  }
})
`)
    const hit = criticals.find((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.ok(hit, `Expected PKU910 but got: ${JSON.stringify(criticals)}`)
    assert.match(hit.message, /email/)
  })

  test('flags a top-level Secret<string> field', async () => {
    const criticals = await runInspect(`
${BRAND_TYPES}
import { pikkuFunc } from '@pikku/core'
export const getToken = pikkuFunc({
  func: async () => {
    const token = 'abc' as Secret<string>
    return { token }
  }
})
`)
    const hit = criticals.find((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.ok(hit)
    assert.match(hit.message, /token/)
  })

  test('flags a nested Private field', async () => {
    const criticals = await runInspect(`
${BRAND_TYPES}
import { pikkuFunc } from '@pikku/core'
export const getProfile = pikkuFunc({
  func: async () => {
    const email = 'x@y.com' as Private<string>
    return { user: { id: 1, email } }
  }
})
`)
    const hit = criticals.find((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.ok(hit)
    assert.match(hit.message, /user\.email/)
  })

  test('does not flag a plain string return', async () => {
    const criticals = await runInspect(`
import { pikkuFunc } from '@pikku/core'
export const getPublicData = pikkuFunc({
  func: async () => ({ id: 1, status: 'active', count: 42 })
})
`)
    const hit = criticals.find((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.equal(
      hit,
      undefined,
      `Expected no PKU910 but got: ${JSON.stringify(hit)}`
    )
  })

  test('does not flag a void-returning function', async () => {
    const criticals = await runInspect(`
import { pikkuFunc } from '@pikku/core'
export const doWork = pikkuFunc({
  func: async () => { /* no return */ }
})
`)
    const hit = criticals.find((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.equal(hit, undefined)
  })

  test('flags a function that returns a typed alias with Private field', async () => {
    const criticals = await runInspect(`
${BRAND_TYPES}
import { pikkuFunc } from '@pikku/core'
type UserRow = { id: number; email: Private<string> }
export const getUser = pikkuFunc({
  func: async (): Promise<UserRow> => {
    return { id: 1, email: 'x' as Private<string> }
  }
})
`)
    const hit = criticals.find((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.ok(hit)
    assert.match(hit.message, /email/)
  })

  test('flags across multiple functions in the same file', async () => {
    const criticals = await runInspect(`
${BRAND_TYPES}
import { pikkuFunc } from '@pikku/core'
export const getEmail = pikkuFunc({
  func: async () => ({ email: 'x' as Private<string> })
})
export const getPhone = pikkuFunc({
  func: async () => ({ phone: '555' as Private<string> })
})
export const getSafe = pikkuFunc({
  func: async () => ({ name: 'Alice' })
})
`)
    const hits = criticals.filter((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.equal(hits.length, 2, `Expected 2 PKU910 but got ${hits.length}`)
  })

  test('flags branded values inside arrays', async () => {
    const criticals = await runInspect(`
${BRAND_TYPES}
import { pikkuFunc } from '@pikku/core'
export const getEmails = pikkuFunc({
  func: async () => ({ emails: ['x@y.com' as Private<string>] })
})
`)
    const hit = criticals.find((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.ok(hit, `Expected PKU910 but got: ${JSON.stringify(criticals)}`)
    assert.match(hit.message, /emails/)
  })

  test('flags branded values inside string-indexed records', async () => {
    const criticals = await runInspect(`
${BRAND_TYPES}
import { pikkuFunc } from '@pikku/core'
export const getMap = pikkuFunc({
  func: async () => ({ byId: { a: 'x@y.com' as Private<string> } as Record<string, Private<string>> })
})
`)
    const hit = criticals.find((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.ok(hit, `Expected PKU910 but got: ${JSON.stringify(criticals)}`)
    assert.match(hit.message, /byId/)
  })

  test('does not flag when branded field is stripped before return', async () => {
    const criticals = await runInspect(`
${BRAND_TYPES}
import { pikkuFunc } from '@pikku/core'
export const getUser = pikkuFunc({
  func: async () => {
    const raw: { email: Private<string> } = { email: 'x' as Private<string> }
    const safe: { email: string } = { email: raw.email as string }
    return safe
  }
})
`)
    // The explicit type annotation on 'safe' strips the brand from the inferred return type
    const hit = criticals.find((c) => c.code === ErrorCode.PII_IN_OUTPUT)
    assert.equal(hit, undefined)
  })
})
