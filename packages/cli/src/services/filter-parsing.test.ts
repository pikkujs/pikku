import { test } from 'node:test'
import * as assert from 'node:assert'
import { parseCLIFilters as parse } from '../utils/parse-cli-filters.js'

test('parseCLIFilters merges named filter and CLI includes/excludes', () => {
  const filters = parse(
    {
      filter: 'api',
      tags: 'shared',
      excludeTags: 'internal',
      excludeNames: '*deprecated*',
    },
    {
      namedFilters: {
        api: {
          tags: ['api'],
          names: ['send*'],
          excludeWires: ['queue'],
        },
      },
    }
  )

  assert.deepStrictEqual(filters.tags, ['api', 'shared'])
  assert.deepStrictEqual(filters.names, ['send*'])
  assert.deepStrictEqual(filters.excludeWires, ['queue'])
  assert.deepStrictEqual(filters.excludeTags, ['internal'])
  assert.deepStrictEqual(filters.excludeNames, ['*deprecated*'])
})

test('parseCLIFilters throws on unknown named filter', () => {
  assert.throws(
    () =>
      parse(
        { filter: 'missing' },
        {
          namedFilters: {
            api: { tags: ['api'] },
          },
        }
      ),
    /Unknown --filter 'missing'/
  )
})

test('parseCLIFilters validates target and excludeTarget values', () => {
  assert.throws(
    () => parse({ target: 'edge' }, {}),
    /Invalid --target value\(s\): \[edge\]/
  )
  assert.throws(
    () => parse({ excludeTarget: 'edge' }, {}),
    /Invalid --exclude-target value\(s\): \[edge\]/
  )

  const filters = parse(
    {
      target: 'serverless',
      excludeTarget: 'server',
    },
    {
      deploy: { serverlessIncompatible: ['db'] },
    }
  )

  assert.deepStrictEqual(filters.target, ['serverless'])
  assert.deepStrictEqual(filters.excludeTarget, ['server'])
  assert.deepStrictEqual(filters.serverlessIncompatible, ['db'])
})

test('parseCLIFilters threads deploy.defaultTarget when a target filter is set', () => {
  const filters = parse(
    { target: 'server' },
    { deploy: { providers: {}, defaultTarget: 'server' } }
  )
  assert.deepStrictEqual(filters.target, ['server'])
  assert.strictEqual(filters.defaultTarget, 'server')
})

test('parseCLIFilters omits defaultTarget when no target filter is set', () => {
  const filters = parse(
    { tags: 'api' },
    { deploy: { providers: {}, defaultTarget: 'server' } }
  )
  assert.strictEqual(filters.defaultTarget, undefined)
})

test('parseCLIFilters merges addon.serverlessIncompatible with deploy.serverlessIncompatible', () => {
  const filters = parse(
    { target: 'serverless' },
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
  const filters = parse(
    { target: 'server' },
    { addon: { serverlessIncompatible: ['HumanDesignService'] } }
  )
  assert.deepStrictEqual(filters.serverlessIncompatible, ['HumanDesignService'])
})

test('parseCLIFilters ignores addon.serverlessIncompatible when addon is boolean true', () => {
  const filters = parse({ target: 'serverless' }, { addon: true })
  assert.strictEqual(filters.serverlessIncompatible, undefined)
})

test('parseCLIFilters does not set serverlessIncompatible when no target filter is active', () => {
  // serverlessIncompatible should only appear when --target / --exclude-target is set
  const filters = parse(
    { tags: 'api' },
    {
      deploy: { serverlessIncompatible: ['DbService'] },
      addon: { serverlessIncompatible: ['FfmpegService'] },
    }
  )
  assert.strictEqual(filters.serverlessIncompatible, undefined)
})
