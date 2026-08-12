import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import {
  isAddonPackage,
  runAddonPackageChecks,
} from './addon-package-checks.js'

const makeTmp = async () => mkdtemp(join(tmpdir(), 'pikku-addon-pkg-'))

const write = async (
  root: string,
  rel: string,
  contents: string
): Promise<void> => {
  const path = join(root, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

const ids = (findings: { id: string }[]): string[] => findings.map((f) => f.id)

const PKG = {
  name: '@pikku/addon-example',
  version: '0.1.0',
  files: ['dist', '.pikku'],
  scripts: { build: 'tsc && cp -r .pikku types dist/' },
}

const GENERATED =
  "import type { SingletonServices } from '../../types/application-types.d.js'\n" +
  'export type Wired = SingletonServices\n'

const APPLICATION_TYPES =
  'export interface SingletonServices { readonly x: string }\n'

/** A package built the way the corrected build script builds it. */
const writeBuiltAddon = async (root: string): Promise<void> => {
  await write(root, 'package.json', JSON.stringify(PKG))
  await write(root, 'types/application-types.d.ts', APPLICATION_TYPES)
  await write(root, '.pikku/function/pikku-function-types.gen.ts', GENERATED)
  await write(
    root,
    'dist/.pikku/function/pikku-function-types.gen.ts',
    GENERATED
  )
  await write(root, 'dist/types/application-types.d.ts', APPLICATION_TYPES)
}

describe('addon package recognition', () => {
  test('a package shipping generated pikku output is an addon', async () => {
    const tmp = await makeTmp()
    try {
      await writeBuiltAddon(tmp)
      assert.strictEqual(await isAddonPackage(tmp), true)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a private package is not treated as publishable', async () => {
    const tmp = await makeTmp()
    try {
      await writeBuiltAddon(tmp)
      await write(
        tmp,
        'package.json',
        JSON.stringify({ ...PKG, private: true })
      )
      assert.strictEqual(await isAddonPackage(tmp), false)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  /**
   * An app's packages/functions has a .pikku directory too. It is codegen for
   * that app, not something anyone installs, so holding it to a published file
   * set reports a packaging problem on a package that has no packaging.
   */
  test("an app's functions package is not an addon", async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'package.json', JSON.stringify({ name: '@app/fns' }))
      await write(tmp, '.pikku/pikku-types.gen.ts', 'export {}\n')
      assert.strictEqual(await isAddonPackage(tmp), false)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a package with no generated output is not an addon', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'package.json', JSON.stringify({ name: 'plain-app' }))
      assert.strictEqual(await isAddonPackage(tmp), false)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('addon packaging', () => {
  test('a correctly built addon reports nothing', async () => {
    const tmp = await makeTmp()
    try {
      await writeBuiltAddon(tmp)
      assert.deepStrictEqual(ids(await runAddonPackageChecks(tmp)), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  /**
   * The @pikku/addon-* regression: `cp -r .pikku dist/` shipped the generated
   * files but not the `types/` they import, and `tsc` never emits a
   * hand-written .d.ts to outDir. Consumers typechecked against a module that
   * was not in the package.
   */
  test('a generated file importing a type that was never packed is an error', async () => {
    const tmp = await makeTmp()
    try {
      await writeBuiltAddon(tmp)
      await rm(join(tmp, 'dist/types'), { recursive: true, force: true })
      const findings = await runAddonPackageChecks(tmp)
      assert.deepStrictEqual(ids(findings), ['addon-shipped-import-unresolved'])
      assert.strictEqual(findings[0]!.severity, 'error')
      assert.match(findings[0]!.message, /application-types/)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  /**
   * The file is on disk but `files` does not carry it, so it is present for the
   * repo's own typecheck and absent for everybody who installs the package —
   * the same failure, one step later and much harder to see locally.
   */
  test('an import resolving outside the published file set is an error', async () => {
    const tmp = await makeTmp()
    try {
      await writeBuiltAddon(tmp)
      await write(
        tmp,
        'package.json',
        JSON.stringify({ ...PKG, files: ['dist/.pikku'] })
      )
      const findings = await runAddonPackageChecks(tmp)
      assert.deepStrictEqual(ids(findings), ['addon-shipped-import-not-packed'])
      assert.strictEqual(findings[0]!.severity, 'error')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('an unbuilt package says so rather than passing silently', async () => {
    const tmp = await makeTmp()
    try {
      await writeBuiltAddon(tmp)
      await rm(join(tmp, 'dist'), { recursive: true, force: true })
      const findings = await runAddonPackageChecks(tmp)
      assert.deepStrictEqual(ids(findings), ['addon-not-built'])
      assert.strictEqual(findings[0]!.severity, 'info')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('bare and dynamic specifiers are left alone', async () => {
    const tmp = await makeTmp()
    try {
      await writeBuiltAddon(tmp)
      await write(
        tmp,
        'dist/.pikku/function/pikku-function-types.gen.ts',
        "import type Stripe from 'stripe'\n" +
          "import { z } from 'zod'\n" +
          GENERATED
      )
      assert.deepStrictEqual(ids(await runAddonPackageChecks(tmp)), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a .js specifier may resolve to the .ts beside it', async () => {
    const tmp = await makeTmp()
    try {
      await writeBuiltAddon(tmp)
      await write(
        tmp,
        'dist/.pikku/function/pikku-function-types.gen.ts',
        "export { thing } from '../../src/thing.js'\n"
      )
      await write(tmp, 'dist/src/thing.ts', 'export const thing = 1\n')
      assert.deepStrictEqual(ids(await runAddonPackageChecks(tmp)), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
