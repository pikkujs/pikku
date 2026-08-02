import assert from 'node:assert/strict'
import { describe, test, beforeEach } from 'node:test'
import { ErrorCode } from '../error-codes.js'
import { validateTagsResolveToMiddleware } from './validate-tags-resolve-to-middleware.js'

let diagnostics: Array<{ severity: string; code: string; message: string }>

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  critical: () => {},
  diagnostic: (d: any) => diagnostics.push(d),
  hasCriticalErrors: () => false,
} as any

/**
 * The three pieces of state the check reads: the addon declarations that carry
 * tags, and the two registries a tag can resolve against.
 */
const stateWith = (
  addons: Record<string, { tags?: string[] }>,
  httpTags: string[] = [],
  channelTags: string[] = []
) =>
  ({
    rpc: { wireAddonDeclarations: new Map(Object.entries(addons)) },
    middleware: { tagMiddleware: new Map(httpTags.map((t) => [t, []])) },
    channelMiddleware: {
      tagMiddleware: new Map(channelTags.map((t) => [t, []])),
    },
  }) as any

const run = (state: any) => {
  validateTagsResolveToMiddleware(logger, state)
  return diagnostics.filter(
    (d) => d.code === ErrorCode.TAG_RESOLVES_TO_NO_MIDDLEWARE
  )
}

beforeEach(() => {
  diagnostics = []
})

describe('validateTagsResolveToMiddleware', () => {
  test('warns about an addon tag no middleware is registered for', () => {
    const found = run(stateWith({ console: { tags: ['admin'] } }))
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /console/)
    assert.match(found[0]!.message, /admin/)
  })

  test('warns rather than fails the build', () => {
    // The tag may be registered by host code the inspector never sees, so this
    // has to stay advisory — a false positive must not break codegen.
    const found = run(stateWith({ console: { tags: ['admin'] } }))
    assert.equal(found[0]!.severity, 'warn')
  })

  test('stays quiet when http middleware is registered for the tag', () => {
    assert.deepEqual(run(stateWith({ console: { tags: ['admin'] } }, ['admin'])), [])
  })

  test('stays quiet when only channel middleware is registered for the tag', () => {
    assert.deepEqual(
      run(stateWith({ console: { tags: ['admin'] } }, [], ['admin'])),
      []
    )
  })

  test('reports each unresolved tag on an addon separately', () => {
    const found = run(
      stateWith({ console: { tags: ['admin', 'audited'] } }, ['admin'])
    )
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /audited/)
  })

  test('reports the same tag once per addon that declares it', () => {
    const found = run(
      stateWith({ console: { tags: ['admin'] }, billing: { tags: ['admin'] } })
    )
    assert.equal(found.length, 2)
  })

  test('stays quiet for an addon with no tags', () => {
    assert.deepEqual(run(stateWith({ console: {} })), [])
  })

  test('stays quiet when there are no addons at all', () => {
    assert.deepEqual(run(stateWith({})), [])
  })

  test('tolerates rpc state being absent', () => {
    // Inspection of a package with no RPC surface never populates it.
    assert.deepEqual(
      run({
        middleware: { tagMiddleware: new Map() },
        channelMiddleware: { tagMiddleware: new Map() },
      } as any),
      []
    )
  })
})
