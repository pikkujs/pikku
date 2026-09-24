import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CLILogger } from '../services/cli-logger.service.js'
import { ensurePackageDependency } from './ensure-package-dependency.js'

const logger = { info: () => {} } as unknown as CLILogger

const sdkPackage = async (pkg: Record<string, unknown>) => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-ensure-dep-'))
  await mkdir(join(root, 'src', 'pikku'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2))
  return {
    file: join(root, 'src', 'pikku', 'cli-client.gen.ts'),
    read: async () =>
      JSON.parse(await readFile(join(root, 'package.json'), 'utf-8')),
  }
}

describe('ensurePackageDependency', () => {
  test('declares the package in the nearest package.json, at the range the CLI ships with', async () => {
    const sdk = await sdkPackage({
      name: 'sdk',
      dependencies: { '@pikku/fetch': '^0.12.12' },
    })
    await ensurePackageDependency(logger, sdk.file, '@pikku/websocket')
    const pkg = await sdk.read()
    assert.match(pkg.dependencies['@pikku/websocket'], /^\^?\d+\.\d+\.\d+/)
    assert.deepEqual(Object.keys(pkg.dependencies), [
      '@pikku/fetch',
      '@pikku/websocket',
    ])
  })

  test('leaves a package that already declares it untouched', async () => {
    const sdk = await sdkPackage({
      name: 'sdk',
      peerDependencies: { '@pikku/websocket': '*' },
    })
    await ensurePackageDependency(logger, sdk.file, '@pikku/websocket')
    assert.deepEqual(await sdk.read(), {
      name: 'sdk',
      peerDependencies: { '@pikku/websocket': '*' },
    })
  })

  test('skips a nameless package.json stub and declares it in the real package', async () => {
    const sdk = await sdkPackage({ name: 'sdk' })
    const stub = join(sdk.file, '..', '..', 'package.json')
    await writeFile(stub, JSON.stringify({ type: 'module' }))
    await ensurePackageDependency(logger, sdk.file, '@pikku/websocket')
    assert.deepEqual(JSON.parse(await readFile(stub, 'utf-8')), {
      type: 'module',
    })
    assert.ok((await sdk.read()).dependencies['@pikku/websocket'])
  })

  test('adds nothing for a package the CLI itself does not ship with', async () => {
    const sdk = await sdkPackage({ name: 'sdk' })
    await ensurePackageDependency(logger, sdk.file, 'not-a-pikku-dependency')
    assert.deepEqual(await sdk.read(), { name: 'sdk' })
  })
})
