import { test } from 'node:test'
import * as assert from 'node:assert'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runValidate } from '@pikku/cli/validate'

const root = process.cwd()
const configPath = join(root, 'pikku.config.json')

const coreImports = async (): Promise<string[]> => {
  const { findings } = await runValidate(root)
  return findings
    .filter((finding) => finding.id === 'core-import')
    .map((finding) => `${finding.severity} ${finding.fixHint}`)
}

/**
 * Restores the config whatever the assertions do, so a failure does not leave
 * the verifier's own project with a lint rule switched off.
 */
const withConfig = async (patch: unknown, body: () => Promise<void>) => {
  const original = await readFile(configPath, 'utf8')
  await writeFile(configPath, JSON.stringify(patch, null, 2))
  try {
    await body()
  } finally {
    await writeFile(configPath, original)
  }
}

test('app code reaching past #pikku into @pikku/core is reported', async () => {
  assert.deepStrictEqual(await coreImports(), [
    "error Import the same names from '#pikku/error'",
    "error Nothing in '#pikku' carries these names yet — that is a gap in " +
      'what the CLI emits, so please open an issue naming them. ' +
      "'@pikku/core/services' is the one subpath an app may name, for the " +
      'service implementations it picks in bootstrap. To keep the import ' +
      'meanwhile, set "lint": { "coreImport": "off" } in pikku.config.json',
  ])
})

test('the service implementations bootstrap picks are not reported', async () => {
  const services = await readFile(join(root, 'src', 'services.ts'), 'utf8')
  assert.ok(services.includes("from '@pikku/core/services'"))

  const { findings } = await runValidate(root)
  assert.deepStrictEqual(
    findings.filter((finding) => finding.path.endsWith('services.ts')),
    []
  )
})

test('the lint key lowers the severity', async () => {
  await withConfig(
    {
      tsconfig: './tsconfig.json',
      srcDirectories: ['src'],
      outDir: '.pikku',
      lint: { coreImport: 'warn' },
    },
    async () => {
      const findings = await coreImports()
      assert.equal(findings.length, 2)
      assert.ok(findings.every((finding) => finding.startsWith('warn ')))
    }
  )
})

test('the lint key switches the rule off', async () => {
  await withConfig(
    {
      tsconfig: './tsconfig.json',
      srcDirectories: ['src'],
      outDir: '.pikku',
      lint: { coreImport: 'off' },
    },
    async () => {
      assert.deepStrictEqual(await coreImports(), [])
    }
  )
})
