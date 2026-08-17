import assert from 'node:assert'
import { describe, test } from 'node:test'
import ts from 'typescript'

import {
  accumulateSurfaceUsage,
  surfaceUsageArea,
  type SurfaceUsageCounts,
} from './extract-surface-usage.js'

const countsFor = (
  files: Array<{ area: string; source: string }>
): SurfaceUsageCounts => {
  const counts: SurfaceUsageCounts = {}
  files.forEach(({ area, source }, index) => {
    accumulateSurfaceUsage(
      ts.createSourceFile(
        `/project/src/file-${index}.ts`,
        source,
        ts.ScriptTarget.Latest,
        true
      ),
      area,
      counts
    )
  })
  return counts
}

describe('accumulateSurfaceUsage', () => {
  test('counts an import site per named import', () => {
    const counts = countsFor([
      {
        area: 'src',
        source:
          "import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'\n",
      },
      { area: 'src', source: "import { pikkuFunc } from '#pikku/function'\n" },
    ])

    assert.deepStrictEqual(counts['#pikku/function'], {
      pikkuFunc: { imports: 2, seenIn: ['src'] },
      pikkuSessionlessFunc: { imports: 1, seenIn: ['src'] },
    })
  })

  test('counts a deep specifier against the leaf it belongs to', () => {
    const counts = countsFor([
      {
        area: 'src',
        source:
          "import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'\n",
      },
      {
        area: 'workers',
        source: "import { pikkuWorkflowFunc } from '#pikku/workflow'\n",
      },
    ])

    assert.deepStrictEqual(counts['#pikku/workflow'], {
      pikkuWorkflowFunc: { imports: 2, seenIn: ['src', 'workers'] },
    })
  })

  test('records the aliased name, not the local one', () => {
    const counts = countsFor([
      {
        area: 'src',
        source: "import { cors as allowAll } from '#pikku/http'\n",
      },
    ])

    assert.deepStrictEqual(counts['#pikku/http'], {
      cors: { imports: 1, seenIn: ['src'] },
    })
  })

  test('counts a re-export as a use of the leaf', () => {
    const counts = countsFor([
      { area: 'src', source: "export { wireHTTP } from '#pikku/http'\n" },
    ])

    assert.deepStrictEqual(counts['#pikku/http']!.wireHTTP!.imports, 1)
  })

  test('ignores imports from anywhere else', () => {
    const counts = countsFor([
      {
        area: 'src',
        source: [
          "import { z } from 'zod'",
          "import { thing } from './local.js'",
          "import * as everything from '#pikku/function'",
          "import bootstrap from '#pikku/pikku-bootstrap.gen.js'",
        ].join('\n'),
      },
    ])

    assert.deepStrictEqual(counts, {})
  })
})

describe('surfaceUsageArea', () => {
  test('falls back to the top-level source directory in a single package', () => {
    assert.strictEqual(
      surfaceUsageArea('/project/src/wirings/todo.ts', '/project', new Map()),
      'src'
    )
  })

  test('does not label everything with the root package name', () => {
    const cache = new Map<string, string | null>([
      ['/project/src/wirings', null],
      ['/project/src', null],
    ])

    assert.strictEqual(
      surfaceUsageArea('/project/src/wirings/todo.ts', '/project', cache),
      'src'
    )
  })

  test('prefers the workspace package a file belongs to', () => {
    const cache = new Map<string, string | null>([
      ['/project/packages/api/src', null],
      ['/project/packages/api', '@app/api'],
    ])

    assert.strictEqual(
      surfaceUsageArea('/project/packages/api/src/todo.ts', '/project', cache),
      '@app/api'
    )
  })
})
