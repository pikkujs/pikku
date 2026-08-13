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

/** Every exported name on an entry point, so order never matters to a test. */
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
