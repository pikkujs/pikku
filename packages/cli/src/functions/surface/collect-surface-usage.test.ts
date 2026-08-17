import assert from 'node:assert'
import { describe, test } from 'node:test'

import { mergeSurfaceUsage } from './collect-surface-usage.js'
import type { SurfaceDoc } from './surface-doc.types.js'

const doc: SurfaceDoc = {
  version: '1.0.0',
  entryPoints: [
    {
      id: 'app',
      job: 'build an app',
      specifierBase: '#pikku',
      summary: 'summary',
      leaves: [
        {
          specifier: '#pikku/http',
          name: 'http',
          step: 'wire it up',
          summary: 'summary',
          symbols: [
            {
              name: 'wireHTTP',
              kind: 'function',
              origin: { via: 'generated' },
            },
            { name: 'cors', kind: 'function', origin: { via: 'generated' } },
          ],
        },
      ],
    },
  ],
}

describe('mergeSurfaceUsage', () => {
  test('reports an export nothing imports as unused rather than omitting it', () => {
    const usage = mergeSurfaceUsage({
      counts: { '#pikku/http': { wireHTTP: { imports: 3, seenIn: ['src'] } } },
      doc,
    })

    assert.deepStrictEqual(usage.bySpecifier['#pikku/http'], {
      cors: { imports: 0, seenIn: [] },
      wireHTTP: { imports: 3, seenIn: ['src'] },
    })
  })

  test('sorts the areas an export was seen in', () => {
    const usage = mergeSurfaceUsage({
      counts: {
        '#pikku/http': {
          wireHTTP: { imports: 2, seenIn: ['services', '@app/api'] },
        },
      },
      doc,
    })

    assert.deepStrictEqual(usage.bySpecifier['#pikku/http']!.wireHTTP, {
      imports: 2,
      seenIn: ['@app/api', 'services'],
    })
  })

  test('keeps an import of something the doc does not describe', () => {
    const usage = mergeSurfaceUsage({
      counts: { '#pikku/mystery': { thing: { imports: 1, seenIn: ['src'] } } },
      doc,
    })

    assert.deepStrictEqual(usage.bySpecifier['#pikku/mystery'], {
      thing: { imports: 1, seenIn: ['src'] },
    })
  })

  test('without a doc it reports only what was measured', () => {
    const usage = mergeSurfaceUsage({
      counts: { '#pikku/http': { wireHTTP: { imports: 1, seenIn: ['src'] } } },
    })

    assert.deepStrictEqual(Object.keys(usage.bySpecifier), ['#pikku/http'])
    assert.deepStrictEqual(Object.keys(usage.bySpecifier['#pikku/http']!), [
      'wireHTTP',
    ])
  })
})
