import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'

import { leafEntries } from '../wirings/functions/pikku-command-leaf-indexes.js'
import {
  buildSurfaceDoc,
  MissingSurfaceEditorialError,
} from './build-surface-doc.js'
import { LEAF_EDITORIAL } from './surface-editorial.js'
import type { SurfaceEntryPoint, SurfaceLeaf } from './surface-doc.types.js'

const write = async (
  root: string,
  rel: string,
  contents: string
): Promise<void> => {
  const path = join(root, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

const TSCONFIG = JSON.stringify({
  compilerOptions: { module: 'Node16', moduleResolution: 'Node16' },
})

/**
 * A generated project, as the CLI leaves it: a `.pikku` tree of leaf barrels
 * and a package.json mapping `#pikku/*` onto them.
 */
const makeProject = async (
  name: string,
  leaves: Record<string, string>
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-surface-doc-'))
  await write(
    root,
    'package.json',
    JSON.stringify({
      name,
      type: 'module',
      imports: {
        '#pikku/*.js': './.pikku/*.ts',
        '#pikku/*': ['./.pikku/*/index.ts', './.pikku/*'],
      },
    })
  )
  await write(root, 'tsconfig.json', TSCONFIG)
  for (const [leaf, source] of Object.entries(leaves)) {
    await write(root, join('.pikku', leaf, 'index.ts'), source)
  }
  return root
}

const APP_LEAVES = {
  function: 'export const pikkuFunc = (config: unknown) => config\n',
  http: [
    'export const wireHTTP = (wiring: { route: string }) => wiring',
    'export const addHTTPMiddleware = (middleware: unknown[]) => middleware',
  ].join('\n'),
}

const ADDON_LEAVES = {
  function: APP_LEAVES.function,
  http: 'export const addHTTPMiddleware = (middleware: unknown[]) => middleware\n',
}

const leafOf = (
  entryPoint: SurfaceEntryPoint | undefined,
  name: string
): SurfaceLeaf | undefined =>
  entryPoint?.leaves.find((leaf) => leaf.name === name)

const buildFor = async (
  app: Record<string, string>,
  addon: Record<string, string>
) => {
  const appDir = await makeProject('@fixture/app', app)
  const addonDir = await makeProject('@fixture/addon', addon)
  try {
    return {
      doc: await buildSurfaceDoc({
        version: '1.2.3',
        app: { projectDir: appDir },
        addon: { projectDir: addonDir },
      }),
      cleanup: async () => {
        await rm(appDir, { recursive: true, force: true })
        await rm(addonDir, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await rm(appDir, { recursive: true, force: true })
    await rm(addonDir, { recursive: true, force: true })
    throw error
  }
}

describe('buildSurfaceDoc', () => {
  test('reads an application leaf, wiring included', async () => {
    const { doc, cleanup } = await buildFor(APP_LEAVES, ADDON_LEAVES)
    try {
      const app = doc.entryPoints.find((each) => each.id === 'app')
      const http = leafOf(app, 'http')

      assert.strictEqual(doc.version, '1.2.3')
      assert.strictEqual(app?.specifierBase, '#pikku')
      assert.strictEqual(http?.specifier, '#pikku/http')
      assert.deepStrictEqual(
        http?.symbols.map((symbol) => symbol.name),
        ['addHTTPMiddleware', 'wireHTTP']
      )
    } finally {
      await cleanup()
    }
  })

  test('reads an addon leaf, wiring excluded', async () => {
    const { doc, cleanup } = await buildFor(APP_LEAVES, ADDON_LEAVES)
    try {
      const addon = doc.entryPoints.find((each) => each.id === 'addon')

      assert.deepStrictEqual(
        leafOf(addon, 'http')?.symbols.map((symbol) => symbol.name),
        ['addHTTPMiddleware']
      )
    } finally {
      await cleanup()
    }
  })

  test('orders the leaves by the step you meet them at', async () => {
    const { doc, cleanup } = await buildFor(APP_LEAVES, ADDON_LEAVES)
    try {
      const app = doc.entryPoints.find((each) => each.id === 'app')

      assert.deepStrictEqual(
        app?.leaves.map((leaf) => [leaf.name, leaf.step]),
        [
          ['function', 'create a function'],
          ['http', 'wire it up'],
        ]
      )
    } finally {
      await cleanup()
    }
  })

  test('a leaf with no editorial entry fails the build', async () => {
    await assert.rejects(
      buildFor(
        { ...APP_LEAVES, telepathy: 'export const think = 1\n' },
        ADDON_LEAVES
      ),
      (error: unknown) => {
        assert.ok(error instanceof MissingSurfaceEditorialError)
        assert.match(error.message, /telepathy/)
        assert.match(error.message, /LEAF_EDITORIAL/)
        return true
      }
    )
  })

  test('keeps type-only exports, which the console filters and the website may not', async () => {
    const { doc, cleanup } = await buildFor(
      {
        ...APP_LEAVES,
        error: 'export type PikkuError = { code: string }\n',
      },
      ADDON_LEAVES
    )
    try {
      const app = doc.entryPoints.find((each) => each.id === 'app')

      assert.deepStrictEqual(leafOf(app, 'error')?.symbols, [
        {
          name: 'PikkuError',
          kind: 'type',
          origin: { via: 'generated' },
        },
      ])
    } finally {
      await cleanup()
    }
  })
})

describe('buildSurfaceDoc origins', () => {
  test('names the core subpath a leaf re-exports from', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-surface-origin-'))
    try {
      await write(
        root,
        'package.json',
        JSON.stringify({
          name: '@fixture/origins',
          type: 'module',
          imports: { '#pikku/*': './.pikku/*/index.ts' },
        })
      )
      await write(root, 'tsconfig.json', TSCONFIG)
      await write(
        root,
        'node_modules/@pikku/core/package.json',
        JSON.stringify({
          name: '@pikku/core',
          type: 'module',
          exports: { './middleware': './dist/middleware/index.d.ts' },
        })
      )
      await write(
        root,
        'node_modules/@pikku/core/dist/middleware/index.d.ts',
        'export declare const cors: (origin: string) => void\n'
      )
      await write(
        root,
        '.pikku/http/index.ts',
        [
          "export { cors } from '@pikku/core/middleware'",
          'export const wireHTTP = (route: string) => route',
        ].join('\n')
      )

      const doc = await buildSurfaceDoc({
        version: '0.0.0',
        app: { projectDir: root },
        addon: { projectDir: root },
      })
      const symbols = Object.fromEntries(
        (
          leafOf(
            doc.entryPoints.find((each) => each.id === 'app'),
            'http'
          )?.symbols ?? []
        ).map((symbol) => [symbol.name, symbol.origin])
      )

      assert.deepStrictEqual(symbols, {
        cors: { via: 'core', subpath: './middleware' },
        wireHTTP: { via: 'generated' },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('carries the signature and the deprecation the type checker knows about', async () => {
    const root = await makeProject('@fixture/details', {
      function: [
        '/**',
        ' * Defines a function.',
        ' *',
        ' * More prose the console does not show.',
        ' */',
        'export const pikkuFunc = (name: string): number => name.length',
        '/** @deprecated use pikkuFunc instead */',
        'export const oldFunc = (name: string): number => name.length',
      ].join('\n'),
    })
    try {
      const doc = await buildSurfaceDoc({
        version: '0.0.0',
        app: { projectDir: root },
        addon: { projectDir: root },
      })
      const symbols = leafOf(
        doc.entryPoints.find((each) => each.id === 'app'),
        'function'
      )?.symbols

      const defined = symbols?.find((symbol) => symbol.name === 'pikkuFunc')
      assert.strictEqual(defined?.summary, 'Defines a function.')
      assert.strictEqual(defined?.signature, '(name: string) => number')
      assert.strictEqual(defined?.deprecated, undefined)
      assert.strictEqual(
        symbols?.find((symbol) => symbol.name === 'oldFunc')?.deprecated,
        'use pikkuFunc instead'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('the editorial layer', () => {
  test('covers every leaf the codegen can write', () => {
    const undocumented = leafEntries
      .map(([leaf]) => leaf)
      .filter((leaf) => !LEAF_EDITORIAL[leaf])

    assert.deepStrictEqual(undocumented, [])
  })
})
