import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pikkuAddonSdk } from './pikku-command-addon-sdk.js'

const run = async (addon: boolean, packageJson: Record<string, unknown>) => {
  const rootDir = mkdtempSync(join(tmpdir(), 'pikku-addon-sdk-'))
  writeFileSync(join(rootDir, 'package.json'), JSON.stringify(packageJson))
  const warnings: string[] = []
  const logger = {
    warn: (message: string) => warnings.push(message),
    debug: () => {},
    info: () => {},
  }
  try {
    const result = await (pikkuAddonSdk as any).func(
      {
        logger,
        config: { addon, rootDir, outDir: join(rootDir, '.pikku', 'addon') },
        getInspectorState: async () => {
          throw new Error('a skipped SDK must not inspect')
        },
      },
      null,
      {}
    )
    return { result, warnings, sdkDir: existsSync(join(rootDir, '.pikku')) }
  } finally {
    rmSync(rootDir, { recursive: true, force: true })
  }
}

const ADDON_PACKAGE = {
  name: '@acme/notes',
  version: '1.2.3',
  peerDependencies: { '@pikku/core': '^0.12.0' },
}

describe('pikku all: the addon SDK step', () => {
  test('an app emits no SDK', async () => {
    const { result, warnings, sdkDir } = await run(false, ADDON_PACKAGE)
    assert.equal(result, null)
    assert.deepEqual(warnings, [])
    assert.equal(sdkDir, false)
  })

  test('an addon without a semver version packs nothing, and says so', async () => {
    const { result, warnings } = await run(true, {
      ...ADDON_PACKAGE,
      version: undefined,
    })
    assert.equal(result, null)
    assert.match(warnings[0]!, /is not a semver version/)
  })

  test('an addon that names no @pikku/core packs nothing, and says so', async () => {
    const { result, warnings } = await run(true, {
      name: '@acme/notes',
      version: '1.2.3',
    })
    assert.equal(result, null)
    assert.match(warnings[0]!, /declares no @pikku\/core/)
  })
})
