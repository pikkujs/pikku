import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requirePackageDependencies } from './require-package-dependencies.js'

const shippedRange = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
).dependencies['@pikku/websocket']

const sdkPackage = async (pkg: Record<string, unknown>) => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-require-dep-'))
  await mkdir(join(root, 'src', 'pikku'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2))
  return {
    root,
    file: join(root, 'src', 'pikku', 'cli-client.gen.ts'),
    read: async () => readFile(join(root, 'package.json'), 'utf-8'),
  }
}

describe('requirePackageDependencies', () => {
  test('fails naming the package and the range the CLI ships with, and leaves package.json alone', async () => {
    const sdk = await sdkPackage({ name: 'sdk' })
    const before = await sdk.read()
    await assert.rejects(
      requirePackageDependencies(sdk.file, ['@pikku/websocket']),
      (error: Error) =>
        error.message.includes(`"@pikku/websocket": "${shippedRange}"`) &&
        error.message.includes('package.json')
    )
    assert.equal(await sdk.read(), before)
  })

  test('lists every missing package in one error', async () => {
    const sdk = await sdkPackage({
      name: 'sdk',
      dependencies: { '@pikku/fetch': '^0.12.12' },
    })
    await assert.rejects(
      requirePackageDependencies(sdk.file, [
        '@pikku/fetch',
        '@pikku/websocket',
        '@pikku/kysely',
      ]),
      (error: Error) =>
        error.message.includes('@pikku/websocket') &&
        error.message.includes('@pikku/kysely') &&
        !error.message.includes('"@pikku/fetch"')
    )
  })

  test('accepts a package declared in any dependency field', async () => {
    const sdk = await sdkPackage({
      name: 'sdk',
      peerDependencies: { '@pikku/websocket': '*' },
    })
    await requirePackageDependencies(sdk.file, ['@pikku/websocket'])
  })

  test('skips a nameless package.json stub and checks the real package', async () => {
    const sdk = await sdkPackage({
      name: 'sdk',
      dependencies: { '@pikku/websocket': '*' },
    })
    await writeFile(
      join(sdk.file, '..', '..', 'package.json'),
      JSON.stringify({ type: 'module' })
    )
    await requirePackageDependencies(sdk.file, ['@pikku/websocket'])
  })

  test("checks the project that owns a deploy unit, not the unit's generated package.json", async () => {
    const sdk = await sdkPackage({
      name: 'sdk',
      dependencies: { '@pikku/websocket': shippedRange },
    })
    const unit = join(sdk.root, '.deploy', 'cloudflare', 'units', 'a')
    await mkdir(join(unit, '.pikku'), { recursive: true })
    await writeFile(
      join(unit, 'package.json'),
      JSON.stringify({ name: 'a', dependencies: {} })
    )
    await requirePackageDependencies(join(unit, '.pikku', 'x.gen.ts'), [
      '@pikku/websocket',
    ])
  })
})
