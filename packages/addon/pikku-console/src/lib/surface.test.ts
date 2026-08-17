import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  EMPTY_SURFACE_USAGE,
  readSurface,
  SURFACE_DOC_PACKAGE,
  SURFACE_DOC_PATH,
  SURFACE_USAGE_PATH,
  type SurfaceDoc,
  type SurfaceReader,
  type SurfaceUsage,
} from './surface.js'

const DOC: SurfaceDoc = {
  version: '0.13.0',
  entryPoints: [
    {
      id: 'app',
      job: 'Build a service',
      specifierBase: '#pikku',
      summary: 'Everything an app imports.',
      leaves: [
        {
          specifier: '#pikku/function',
          name: 'function',
          step: 'create a function',
          summary: 'The core abstraction.',
          symbols: [
            {
              name: 'pikkuFunc',
              kind: 'function',
              origin: { via: 'generated' },
            },
          ],
        },
      ],
    },
  ],
}

const USAGE: SurfaceUsage = {
  bySpecifier: {
    '#pikku/function': {
      pikkuFunc: { imports: 12, seenIn: ['src/todo.functions.ts'] },
    },
  },
}

const reader = (files: {
  doc?: unknown
  usage?: unknown
}): SurfaceReader & { asked: string[] } => {
  const asked: string[] = []
  return {
    asked,
    readFile: async (relativePath) => {
      asked.push(relativePath)
      return files.usage === undefined ? null : JSON.stringify(files.usage)
    },
    readPackageFile: async (packageName, relativePath) => {
      asked.push(`${packageName}:${relativePath}`)
      return files.doc === undefined ? null : JSON.stringify(files.doc)
    },
  }
}

test('reads the doc from the CLI package and the usage from the outDir', async () => {
  const source = reader({ doc: DOC, usage: USAGE })
  const result = await readSurface(source)

  assert.deepEqual(result, { doc: DOC, usage: USAGE })
  assert.deepEqual(source.asked, [
    `${SURFACE_DOC_PACKAGE}:${SURFACE_DOC_PATH}`,
    SURFACE_USAGE_PATH,
  ])
})

test('a doc with no usage still renders — the website case', async () => {
  const result = await readSurface(reader({ doc: DOC }))

  assert.deepEqual(result.doc, DOC)
  assert.deepEqual(result.usage, EMPTY_SURFACE_USAGE)
})

test('neither half present is an empty result, not a throw', async () => {
  const result = await readSurface(reader({}))

  assert.equal(result.doc, null)
  assert.deepEqual(result.usage, { bySpecifier: {} })
})

test('a reader that cannot resolve packages at all still answers', async () => {
  const result = await readSurface({ readFile: async () => null })

  assert.equal(result.doc, null)
  assert.deepEqual(result.usage, { bySpecifier: {} })
})

test('a read that throws counts as absent', async () => {
  const result = await readSurface({
    readFile: async () => {
      throw new Error('EACCES')
    },
    readPackageFile: async () => {
      throw new Error('EACCES')
    },
  })

  assert.equal(result.doc, null)
  assert.deepEqual(result.usage, { bySpecifier: {} })
})

test('unparseable JSON counts as absent rather than poisoning the page', async () => {
  const result = await readSurface({
    readFile: async () => '{ not json',
    readPackageFile: async () => '{ not json',
  })

  assert.equal(result.doc, null)
  assert.deepEqual(result.usage, { bySpecifier: {} })
})
