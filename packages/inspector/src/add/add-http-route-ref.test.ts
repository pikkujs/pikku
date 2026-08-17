import { strict as assert } from 'assert'
import { describe, test, before, after } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { inspect } from '../inspector.js'
import { filterInspectorState } from '../utils/filter-inspector-state.js'
import type { InspectorLogger, InspectorState } from '../types.js'

const ADDON_PACKAGE = '@addon/greeter'
const NAMESPACE = 'ext'
const TARGET = `${NAMESPACE}:greet`

const logger: InspectorLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
} as unknown as InspectorLogger

const writeAddonFixture = (rootDir: string) => {
  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({ name: 'consumer' })
  )
  const addonDir = join(rootDir, 'node_modules', ADDON_PACKAGE)
  const pikku = join(addonDir, '.pikku')
  mkdirSync(join(pikku, 'function'), { recursive: true })
  mkdirSync(join(pikku, 'schemas', 'schemas'), { recursive: true })
  writeFileSync(
    join(addonDir, 'package.json'),
    JSON.stringify({ name: ADDON_PACKAGE })
  )
  writeFileSync(
    join(pikku, 'function', 'pikku-functions-meta.gen.json'),
    JSON.stringify({
      greet: {
        pikkuFuncId: 'greet',
        name: 'greet',
        sessionless: true,
        inputSchemaName: 'GreetInput',
        outputSchemaName: 'GreetOutput',
        inputs: ['GreetInput'],
        outputs: ['GreetOutput'],
        services: { optimized: true, services: ['logger'] },
      },
    })
  )
  writeFileSync(
    join(pikku, 'schemas', 'schemas', 'GreetInput.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: {
        id: { type: 'string' },
        loud: { type: 'boolean' },
        name: { type: 'string' },
      },
    })
  )
}

const writeWiring = (rootDir: string): string => {
  const file = join(rootDir, 'greet.wiring.ts')
  writeFileSync(
    file,
    [
      `import { ref, wireAddon } from '@pikku/core'`,
      `import { wireHTTP } from '@pikku/core/http'`,
      ``,
      `wireAddon({ name: '${NAMESPACE}', package: '${ADDON_PACKAGE}' })`,
      ``,
      `wireHTTP({`,
      `  auth: false,`,
      `  method: 'get',`,
      `  route: '/greet/:id',`,
      `  func: ref('${TARGET}'),`,
      `})`,
      ``,
      `wireHTTP({`,
      `  auth: false,`,
      `  method: 'post',`,
      `  route: '/greet',`,
      `  query: ['loud'],`,
      `  func: ref('${TARGET}'),`,
      `})`,
    ].join('\n')
  )
  return file
}

describe('an HTTP route wired with ref() to an addon function', () => {
  let rootDir: string
  let state: InspectorState

  before(async () => {
    rootDir = mkdtempSync(join(tmpdir(), 'pikku-http-ref-'))
    writeAddonFixture(rootDir)
    const file = writeWiring(rootDir)
    state = await inspect(logger, [file], { rootDir })
  })

  after(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('records the ref target as the route function id', () => {
    assert.equal(state.http.meta.get['/greet/:id']?.pikkuFuncId, TARGET)
    assert.equal(state.http.meta.post['/greet']?.pikkuFuncId, TARGET)
  })

  test('tags the route with the addon package', () => {
    assert.equal(state.http.meta.get['/greet/:id']?.packageName, ADDON_PACKAGE)
    assert.equal(state.http.meta.post['/greet']?.packageName, ADDON_PACKAGE)
  })

  test('mints no wrapper function metadata for the route', () => {
    const wrapperIds = Object.keys(state.functions.meta).filter((id) =>
      id.startsWith('http:')
    )
    assert.deepEqual(wrapperIds, [])
    assert.equal(state.functions.meta[TARGET], undefined)
  })

  test('keeps each route its own params and query', () => {
    assert.deepEqual(state.http.meta.get['/greet/:id']?.params, ['id'])
    assert.equal(state.http.meta.get['/greet/:id']?.query, undefined)
    assert.equal(state.http.meta.post['/greet']?.params, undefined)
    assert.deepEqual(state.http.meta.post['/greet']?.query, ['loud'])
  })

  test('marks the addon target as used so tree-shaking keeps it', () => {
    assert.ok(state.serviceAggregation.usedFunctions.has(TARGET))
  })

  test('survives a filtered bundle together with its addon declaration', () => {
    const filtered = filterInspectorState(state, { names: [TARGET] }, logger)
    assert.equal(filtered.http.meta.get['/greet/:id']?.pikkuFuncId, TARGET)
    assert.equal(filtered.http.meta.post['/greet']?.pikkuFuncId, TARGET)
    assert.ok(filtered.rpc.wireAddonDeclarations.has(NAMESPACE))
    assert.ok(filtered.serviceAggregation.usedFunctions.has(TARGET))
  })
})
