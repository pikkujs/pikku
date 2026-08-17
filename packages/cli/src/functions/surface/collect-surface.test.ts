import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'

import { collectSurface } from './collect-surface.js'

const makeTmp = async () => mkdtemp(join(tmpdir(), 'pikku-surface-'))

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
  compilerOptions: { outDir: 'dist', rootDir: 'src', module: 'Node16' },
})

const namesOf = (
  entrypoints: Awaited<ReturnType<typeof collectSurface>>,
  subpath: string
): string[] =>
  (entrypoints.find((e) => e.subpath === subpath)?.symbols ?? [])
    .map((s) => s.name)
    .sort()

describe('collectSurface', () => {
  test('reads the named exports of each entry point in the exports map', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/thing',
          exports: { '.': './dist/index.js', './extra': './dist/extra.js' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/index.ts', 'export const alpha = 1\n')
      await write(tmp, 'src/extra.ts', 'export const beta = 2\n')

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(namesOf(surface, '.'), ['alpha'])
      assert.deepStrictEqual(namesOf(surface, './extra'), ['beta'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('follows `export *` to the names it actually re-exports', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/star',
          exports: { '.': './dist/index.js' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/index.ts', "export * from './inner.js'\n")
      await write(
        tmp,
        'src/inner.ts',
        'export const hidden = 1\nexport type Shape = { a: string }\n'
      )

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(namesOf(surface, '.'), ['Shape', 'hidden'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('includes a name declared in the entry point file itself', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/inline',
          exports: { '.': './dist/index.js' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(
        tmp,
        'src/index.ts',
        "export { helper } from './helper.js'\nexport type Local = { b: number }\n"
      )
      await write(tmp, 'src/helper.ts', 'export const helper = () => 1\n')

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(namesOf(surface, '.'), ['Local', 'helper'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('records the declaring file, not the entry point that re-exports it', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/where',
          exports: { '.': './dist/index.js' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(
        tmp,
        'src/index.ts',
        "export { thing } from './deep/thing.js'\n"
      )
      await write(tmp, 'src/deep/thing.ts', 'export const thing = 1\n')

      const surface = await collectSurface(tmp)
      const symbol = surface[0]?.symbols.find((s) => s.name === 'thing')

      assert.strictEqual(symbol?.declaredAt, join('src', 'deep', 'thing.ts'))
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('resolves an exports map that points into dist/src', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/nested',
          exports: { '.': './dist/src/index.js' },
        })
      )
      await write(
        tmp,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: { outDir: 'dist', module: 'Node16' },
        })
      )
      await write(tmp, 'src/index.ts', 'export const gamma = 3\n')

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(namesOf(surface, '.'), ['gamma'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('classifies each export by what it is', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/kinds',
          exports: { '.': './dist/index.js' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(
        tmp,
        'src/index.ts',
        [
          'export const value = 1',
          'export function fn() { return 1 }',
          'export class Klass {}',
          'export interface Iface { a: string }',
          'export type Alias = string',
          'export enum Flavour { A }',
        ].join('\n')
      )

      const surface = await collectSurface(tmp)
      const kinds = Object.fromEntries(
        (surface[0]?.symbols ?? []).map((s) => [s.name, s.kind])
      )

      assert.deepStrictEqual(kinds, {
        value: 'const',
        fn: 'function',
        Klass: 'class',
        Iface: 'interface',
        Alias: 'type',
        Flavour: 'enum',
      })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('reads a bare string exports field as the root entry point', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/string-root',
          exports: './dist/index.js',
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/index.ts', 'export const rooted = 1\n')

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(namesOf(surface, '.'), ['rooted'])
      assert.strictEqual(surface[0]?.specifier, '@scope/string-root')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('reads a condition-only exports field as the root entry point', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/condition-root',
          exports: { types: './dist/index.d.ts', import: './dist/index.js' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/index.ts', 'export const conditioned = 1\n')

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(namesOf(surface, '.'), ['conditioned'])
      assert.strictEqual(surface[0]?.specifier, '@scope/condition-root')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('expands a wildcard that points at build output, nested files included', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/wild-dist',
          exports: { './parts/*': './dist/parts/*' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/parts/one.ts', 'export const one = 1\n')
      await write(tmp, 'src/parts/deep/two.ts', 'export const two = 2\n')
      await write(tmp, 'dist/parts/one.js', 'export const one = 1\n')
      await write(tmp, 'dist/parts/one.d.ts', 'export declare const one: 1\n')
      await write(tmp, 'dist/parts/one.js.map', '{}\n')
      await write(tmp, 'dist/parts/deep/two.js', 'export const two = 2\n')

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(surface.map((e) => e.subpath).sort(), [
        './parts/deep/two',
        './parts/one',
      ])
      assert.deepStrictEqual(namesOf(surface, './parts/one'), ['one'])
      assert.deepStrictEqual(namesOf(surface, './parts/deep/two'), ['two'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a wildcard subpath keeps the .js an importer has to write', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/wild-suffix',
          exports: { './parts/*.js': './dist/parts/*.js' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/parts/one.ts', 'export const one = 1\n')
      await write(tmp, 'dist/parts/one.js', 'export const one = 1\n')

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(
        surface.map((e) => e.subpath),
        ['./parts/one.js']
      )
      assert.strictEqual(
        surface[0]?.specifier,
        '@scope/wild-suffix/parts/one.js'
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a package with no exports map has no surface', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({ name: '@scope/private', main: './dist/index.js' })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/index.ts', 'export const nope = 1\n')

      assert.deepStrictEqual(await collectSurface(tmp), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('collectSurface on a package published straight from source', () => {
  test('resolves an exports map that points at a .ts file', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/from-source',
          exports: { '.': './src/index.ts' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/index.ts', 'export const direct = 1\n')

      assert.deepStrictEqual(namesOf(await collectSurface(tmp), '.'), [
        'direct',
      ])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('resolves a .tsx entry point', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/tsx',
          exports: { './mark': './src/Mark.tsx' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/Mark.tsx', 'export const Mark = () => null\n')

      assert.deepStrictEqual(namesOf(await collectSurface(tmp), './mark'), [
        'Mark',
      ])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('ignores a subpath that publishes an asset rather than code', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/assets',
          exports: {
            '.': './src/index.ts',
            './tokens.css': './src/tokens.css',
            './meta.json': './src/meta.json',
          },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/index.ts', 'export const code = 1\n')
      await write(tmp, 'src/tokens.css', ':root { --a: 1px }\n')
      await write(tmp, 'src/meta.json', '{}\n')

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(
        surface.map((e) => e.subpath),
        ['.']
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('expands a wildcard subpath to the files it publishes', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/wild',
          exports: { './parts/*': './src/parts/*' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/parts/one.ts', 'export const one = 1\n')
      await write(tmp, 'src/parts/two.ts', 'export const two = 2\n')

      const surface = await collectSurface(tmp)

      assert.deepStrictEqual(surface.map((e) => e.subpath).sort(), [
        './parts/one',
        './parts/two',
      ])
      assert.deepStrictEqual(namesOf(surface, './parts/one'), ['one'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a wildcard that maps .js onto .ts does not publish the subpath twice', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/wild-js',
          exports: { './src/*.js': './src/*.ts', './src/*': './src/*' },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, 'src/only.ts', 'export const only = 1\n')

      const surface = await collectSurface(tmp)
      const entryFiles = surface.map((e) => e.entryFile)

      assert.deepStrictEqual(entryFiles, [join('src', 'only.ts')])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('collectSurface on a project that has not been built yet', () => {
  test('reads the generated leaves an addon points at through its build output', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'package.json',
        JSON.stringify({
          name: '@scope/addon',
          imports: {
            '#pikku/*.js': './dist/.pikku/*.js',
            '#pikku/*': ['./dist/.pikku/*/index.js', './dist/.pikku/*'],
          },
        })
      )
      await write(tmp, 'tsconfig.json', TSCONFIG)
      await write(tmp, '.pikku/http/index.ts', 'export const wireHTTP = 1\n')

      const surface = await collectSurface(tmp, {
        importsSubpath: '#pikku/*',
      })

      assert.deepStrictEqual(namesOf(surface, '#pikku/http'), ['wireHTTP'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
