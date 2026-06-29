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
