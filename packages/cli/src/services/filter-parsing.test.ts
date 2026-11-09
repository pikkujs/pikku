import { test } from 'node:test'
import * as assert from 'node:assert'
import { parseCLIFilters as parse } from '../utils/parse-cli-filters.js'

test('parseCLIFilters takes the selected backend filter from config', () => {
  const filters = parse(
    {},
    {
      backends: {
        api: {
          filter: {
            tags: ['api'],
            names: ['send*'],
            excludeWires: ['queue'],
            excludeTags: ['internal'],
          },
        },
        jobs: { filter: { tags: ['jobs'] } },
      },
    },
    'api'
  )

  assert.deepStrictEqual(filters.tags, ['api'])
  assert.deepStrictEqual(filters.names, ['send*'])
  assert.deepStrictEqual(filters.excludeWires, ['queue'])
  assert.deepStrictEqual(filters.excludeTags, ['internal'])
})

test('parseCLIFilters applies no filter when no backend is selected', () => {
  const filters = parse(
    {},
    { backends: { api: { filter: { tags: ['api'] } } } }
  )
  assert.deepStrictEqual(filters.tags, undefined)
})

test('parseCLIFilters adds the internal per-unit names to the backend filter', () => {
  const filters = parse(
    { names: ['a', 'b'], workflowMeta: ['wf'] },
    { backends: { api: { filter: { names: ['send*'] } } } },
    'api'
  )
  assert.deepStrictEqual(filters.names, ['send*', 'a', 'b'])
  assert.deepStrictEqual(filters.workflowMeta, ['wf'])
})

test('parseCLIFilters throws on an undeclared backend', () => {
  assert.throws(
    () => parse({}, { backends: { api: { filter: {} } } }, 'missing'),
    /Unknown backend 'missing'. Declared backends: api/
  )
})

const via = (
  filter: Record<string, unknown>,
  config: Record<string, unknown> = {}
) => parse({}, { ...config, backends: { b: { filter: filter as never } } }, 'b')

test('parseCLIFilters validates target and excludeTarget values', () => {
  assert.throws(
    () => via({ target: ['edge'] }),
    /Invalid filter.target value\(s\): \[edge\]/
  )
  assert.throws(
    () => via({ excludeTarget: ['edge'] }),
    /Invalid filter.excludeTarget value\(s\): \[edge\]/
  )

  const filters = via(
    { target: ['serverless'], excludeTarget: ['server'] },
    { deploy: { serverlessIncompatible: ['db'] } }
  )

  assert.deepStrictEqual(filters.target, ['serverless'])
  assert.deepStrictEqual(filters.excludeTarget, ['server'])
  assert.deepStrictEqual(filters.serverlessIncompatible, ['db'])
})

test('parseCLIFilters threads deploy.defaultTarget when a target filter is set', () => {
  const filters = via(
    { target: ['server'] },
    { deploy: { providers: {}, defaultTarget: 'server' } }
  )
  assert.deepStrictEqual(filters.target, ['server'])
  assert.strictEqual(filters.defaultTarget, 'server')
})

test('parseCLIFilters omits defaultTarget when no target filter is set', () => {
  const filters = via(
    { tags: ['api'] },
    { deploy: { providers: {}, defaultTarget: 'server' } }
  )
  assert.strictEqual(filters.defaultTarget, undefined)
})

test('parseCLIFilters merges addon.serverlessIncompatible with deploy.serverlessIncompatible', () => {
  const filters = via(
    { target: ['serverless'] },
    {
      deploy: { serverlessIncompatible: ['DbService'] },
      addon: { serverlessIncompatible: ['FfmpegService'] },
    }
  )
  assert.deepStrictEqual(filters.serverlessIncompatible, [
    'DbService',
    'FfmpegService',
  ])
})

test('parseCLIFilters uses addon.serverlessIncompatible alone when no deploy config', () => {
  const filters = via(
    { target: ['server'] },
    { addon: { serverlessIncompatible: ['HumanDesignService'] } }
  )
  assert.deepStrictEqual(filters.serverlessIncompatible, ['HumanDesignService'])
})

test('parseCLIFilters ignores addon.serverlessIncompatible when addon is boolean true', () => {
  const filters = via({ target: ['serverless'] }, { addon: true })
  assert.strictEqual(filters.serverlessIncompatible, undefined)
})

test('parseCLIFilters does not set serverlessIncompatible when no target filter is active', () => {
  const filters = via(
    { tags: ['api'] },
    {
      deploy: { serverlessIncompatible: ['DbService'] },
      addon: { serverlessIncompatible: ['FfmpegService'] },
    }
  )
  assert.strictEqual(filters.serverlessIncompatible, undefined)
})
