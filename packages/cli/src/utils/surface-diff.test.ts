import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeSurfaceDiff } from './surface-diff.js'
import type { Surface } from './surface.js'

const surface = (partial: Partial<Surface> = {}): Surface => ({
  schemaVersion: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  functions: {},
  schemas: {},
  wirings: {},
  publishedVersions: {},
  ...partial,
})

const fn = (
  key: string,
  version = 1,
  schemas: Partial<{ input: string; output: string }> = {}
) => ({
  key,
  version,
  inputSchemaName: schemas.input ?? null,
  outputSchemaName: schemas.output ?? null,
})

const object = (
  properties: Record<string, unknown>,
  required: string[] = []
) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const str = { type: 'string' }

const changeFor = (
  changes: ReturnType<typeof computeSurfaceDiff>,
  id: string
) => changes.changes.find((c) => c.id === id)

describe('computeSurfaceDiff — verdict', () => {
  test('a removed function is major', () => {
    const result = computeSurfaceDiff(
      surface({ functions: { getUser: fn('getUser') } }),
      surface(),
      'prod'
    )
    assert.equal(result.verdict, 'major')
    assert.equal(changeFor(result, 'getUser')?.breaking, true)
    assert.equal(result.summary.removed, 1)
  })

  test('an added function is minor', () => {
    const result = computeSurfaceDiff(
      surface(),
      surface({ functions: { archiveUser: fn('archiveUser') } }),
      'prod'
    )
    assert.equal(result.verdict, 'minor')
    assert.equal(changeFor(result, 'archiveUser')?.breaking, false)
  })

  test('an unchanged surface is patch — the release is internal work', () => {
    const both = { functions: { getUser: fn('getUser') } }
    const result = computeSurfaceDiff(surface(both), surface(both), 'prod')
    assert.equal(result.verdict, 'patch')
    assert.deepEqual(result.changes, [])
  })

  test('the baseline is recorded on the artifact', () => {
    const result = computeSurfaceDiff(
      surface(),
      surface(),
      'https://api.acme.com/surface.json'
    )
    assert.equal(result.baseline, 'https://api.acme.com/surface.json')
  })
})

describe('computeSurfaceDiff — function schemas', () => {
  const withSchemas = (
    input: Record<string, unknown>,
    output: Record<string, unknown>
  ) =>
    surface({
      functions: {
        getUser: fn('getUser', 1, {
          input: 'GetUserInput',
          output: 'GetUserOutput',
        }),
      },
      schemas: { GetUserInput: input, GetUserOutput: output },
    })

  test('a newly required input field makes the release major', () => {
    const result = computeSurfaceDiff(
      withSchemas(object({ id: str }, ['id']), object({ name: str }, ['name'])),
      withSchemas(
        object({ id: str, tenant: str }, ['id', 'tenant']),
        object({ name: str }, ['name'])
      ),
      'prod'
    )
    assert.equal(result.verdict, 'major')
    assert.deepEqual(changeFor(result, 'getUser')?.reasons, [
      'input.tenant: required field added',
    ])
  })

  test('a new optional input field is minor, not major', () => {
    const result = computeSurfaceDiff(
      withSchemas(object({ id: str }, ['id']), object({ name: str }, ['name'])),
      withSchemas(
        object({ id: str, tenant: str }, ['id']),
        object({ name: str }, ['name'])
      ),
      'prod'
    )
    assert.equal(result.verdict, 'minor')
    assert.equal(changeFor(result, 'getUser')?.status, 'modified')
    assert.equal(changeFor(result, 'getUser')?.breaking, false)
  })

  test('a removed output field makes the release major', () => {
    const result = computeSurfaceDiff(
      withSchemas(
        object({ id: str }, ['id']),
        object({ name: str, email: str }, ['name'])
      ),
      withSchemas(object({ id: str }, ['id']), object({ name: str }, ['name'])),
      'prod'
    )
    assert.equal(result.verdict, 'major')
    assert.deepEqual(changeFor(result, 'getUser')?.reasons, [
      'output.email: field removed',
    ])
  })

  test('an unavailable schema falls back to the contract hash and is treated as breaking', () => {
    const before = surface({
      functions: {
        getUser: {
          ...fn('getUser', 1, { input: 'GetUserInput' }),
          contractHash: 'aaaa',
        },
      },
    })
    const after = surface({
      functions: {
        getUser: {
          ...fn('getUser', 1, { input: 'GetUserInput' }),
          contractHash: 'bbbb',
        },
      },
    })
    const result = computeSurfaceDiff(before, after, 'prod')
    assert.equal(result.verdict, 'major')
    assert.match(
      changeFor(result, 'getUser')?.reasons[0] ?? '',
      /contract hash changed/
    )
  })

  test('an equal contract hash with no schemas is not a change', () => {
    const both = surface({
      functions: {
        getUser: { ...fn('getUser'), contractHash: 'aaaa' },
      },
    })
    const result = computeSurfaceDiff(both, both, 'prod')
    assert.equal(result.verdict, 'patch')
  })
})

describe('computeSurfaceDiff — the version manifest', () => {
  test('a @v2 bump is minor while v1 is still published', () => {
    const before = surface({
      functions: { getUser: fn('getUser', 1) },
      publishedVersions: { getUser: [1] },
    })
    const after = surface({
      functions: { 'getUser@v2': fn('getUser', 2) },
      publishedVersions: { getUser: [1, 2] },
    })

    const result = computeSurfaceDiff(before, after, 'prod')
    assert.equal(result.verdict, 'minor')
    assert.equal(changeFor(result, 'getUser')?.breaking, false)
    assert.match(
      changeFor(result, 'getUser')?.reasons[0] ?? '',
      /still published in versions\.pikku\.json/
    )
    assert.equal(changeFor(result, 'getUser@v2')?.status, 'added')
  })

  test('without the manifest the same disappearance is major', () => {
    const result = computeSurfaceDiff(
      surface({ functions: { getUser: fn('getUser', 1) } }),
      surface({ functions: { 'getUser@v2': fn('getUser', 2) } }),
      'prod'
    )
    assert.equal(result.verdict, 'major')
    assert.equal(changeFor(result, 'getUser')?.breaking, true)
  })
})

describe('computeSurfaceDiff — wirings', () => {
  const http = (entries: Record<string, unknown>) =>
    surface({ wirings: { http: entries } })

  test('a removed route is major even when the function survives', () => {
    const result = computeSurfaceDiff(
      http({ 'GET /users/:id': { pikkuFuncId: 'getUser' } }),
      http({}),
      'prod'
    )
    assert.equal(result.verdict, 'major')
    assert.equal(changeFor(result, 'GET /users/:id')?.kind, 'http')
  })

  test('an added route is minor', () => {
    const result = computeSurfaceDiff(
      http({}),
      http({ 'POST /users/:id/archive': { pikkuFuncId: 'archiveUser' } }),
      'prod'
    )
    assert.equal(result.verdict, 'minor')
  })

  test('a route that starts requiring auth is major', () => {
    const result = computeSurfaceDiff(
      http({ 'GET /public': { pikkuFuncId: 'f', auth: false } }),
      http({ 'GET /public': { pikkuFuncId: 'f', auth: true } }),
      'prod'
    )
    assert.equal(result.verdict, 'major')
    assert.match(
      changeFor(result, 'GET /public')?.reasons[0] ?? '',
      /requires authentication/
    )
  })

  test('another wiring change is compatible', () => {
    const result = computeSurfaceDiff(
      http({ 'GET /x': { pikkuFuncId: 'f', middleware: [] } }),
      http({ 'GET /x': { pikkuFuncId: 'f', middleware: ['rateLimit'] } }),
      'prod'
    )
    assert.equal(result.verdict, 'minor')
    assert.equal(changeFor(result, 'GET /x')?.breaking, false)
  })
})

describe('computeSurfaceDiff — ordering', () => {
  test('breaking changes come first, then removals before additions', () => {
    const result = computeSurfaceDiff(
      surface({
        functions: { gone: fn('gone'), kept: fn('kept') },
        wirings: { http: { 'GET /gone': { pikkuFuncId: 'gone' } } },
      }),
      surface({
        functions: { kept: fn('kept'), fresh: fn('fresh') },
        wirings: { http: { 'GET /fresh': { pikkuFuncId: 'fresh' } } },
      }),
      'prod'
    )
    assert.deepEqual(
      result.changes.map((c) => [c.status, c.id]),
      [
        ['removed', 'gone'],
        ['removed', 'GET /gone'],
        ['added', 'fresh'],
        ['added', 'GET /fresh'],
      ]
    )
    assert.equal(result.summary.breaking, 2)
  })
})
