import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import {
  assertSingleCoreVersion,
  coreSatisfiesRange,
} from './assert-single-core-version.js'

describe('coreSatisfiesRange', () => {
  test('caret ranges (0.x bumps the minor)', () => {
    assert.strictEqual(coreSatisfiesRange('0.12.57', '^0.12.57'), true)
    assert.strictEqual(coreSatisfiesRange('0.12.99', '^0.12.57'), true)
    assert.strictEqual(coreSatisfiesRange('0.12.56', '^0.12.57'), false)
    assert.strictEqual(coreSatisfiesRange('0.13.0', '^0.12.57'), false)
    assert.strictEqual(coreSatisfiesRange('1.5.0', '^1.2.3'), true)
    assert.strictEqual(coreSatisfiesRange('2.0.0', '^1.2.3'), false)
    assert.strictEqual(coreSatisfiesRange('0.0.3', '^0.0.3'), true)
    assert.strictEqual(coreSatisfiesRange('0.0.4', '^0.0.3'), false)
  })

  test('tilde, exact, and comparator ranges', () => {
    assert.strictEqual(coreSatisfiesRange('0.12.58', '~0.12.44'), true)
    assert.strictEqual(coreSatisfiesRange('0.13.0', '~0.12.44'), false)
    assert.strictEqual(coreSatisfiesRange('1.2.3', '1.2.3'), true)
    assert.strictEqual(coreSatisfiesRange('1.2.4', '1.2.3'), false)
    assert.strictEqual(coreSatisfiesRange('0.12.5', '>=0.12.4'), true)
    assert.strictEqual(coreSatisfiesRange('0.12.3', '>=0.12.4'), false)
    assert.strictEqual(coreSatisfiesRange('0.12.5', '>=0.12.0 <0.12.6'), true)
    assert.strictEqual(coreSatisfiesRange('0.12.6', '>=0.12.0 <0.12.6'), false)
    assert.strictEqual(coreSatisfiesRange('0.12.5', '^0.11.0 || ^0.12.0'), true)
    assert.strictEqual(
      coreSatisfiesRange('0.13.1', '^0.11.0 || ^0.12.0'),
      false
    )
  })

  test('not-understood input returns null so callers skip', () => {
    assert.strictEqual(coreSatisfiesRange('1.2.3', 'workspace:*'), null)
    assert.strictEqual(coreSatisfiesRange('not-a-version', '^1.0.0'), null)
    assert.strictEqual(coreSatisfiesRange('1.2.3', '*'), null)
  })
})

describe('assertSingleCoreVersion', () => {
  const warnings: string[] = []
  const logger = { warn: (m: string) => warnings.push(m) }
  const dirs: string[] = []

  const projectWithCores = (...versions: string[]) => {
    const root = mkdtempSync(path.join(tmpdir(), 'pikku-core-skew-'))
    dirs.push(root)
    versions.forEach((version, i) => {
      // First copy hoisted, further copies nested one level (npm/yarn layout).
      const base =
        i === 0
          ? path.join(root, 'node_modules')
          : path.join(root, 'node_modules', `dep-${i}`, 'node_modules')
      const coreDir = path.join(base, '@pikku', 'core')
      mkdirSync(coreDir, { recursive: true })
      writeFileSync(
        path.join(coreDir, 'package.json'),
        JSON.stringify({ name: '@pikku/core', version })
      )
    })
    return root
  }

  // The CLI's real peer range moves over time — derive an in-range version from
  // it so these tests don't rot on release.
  const cliCorePeerRange = async () => {
    const pkg = JSON.parse(
      await readFile(
        new URL('../../package.json', import.meta.url),
        'utf-8'
      ).catch(async () =>
        readFile(new URL('../../../package.json', import.meta.url), 'utf-8')
      )
    )
    return pkg.peerDependencies['@pikku/core'] as string
  }

  afterEach(() => {
    warnings.length = 0
    delete process.env.PIKKU_ALLOW_CORE_SKEW
    delete process.env.PIKKU_ALLOW_DUPLICATE_CORE
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  test('single core inside the peer range passes', async () => {
    const range = await cliCorePeerRange()
    const inRange = /(\d+\.\d+\.\d+)/.exec(range)![1]!
    await assertSingleCoreVersion(projectWithCores(inRange), logger)
    assert.strictEqual(warnings.length, 0)
  })

  test('single core outside the peer range throws PKU718', async () => {
    await assert.rejects(
      assertSingleCoreVersion(projectWithCores('999.999.999'), logger),
      /PKU718.*requires @pikku\/core/s
    )
  })

  test('PIKKU_ALLOW_CORE_SKEW downgrades skew to a warning', async () => {
    process.env.PIKKU_ALLOW_CORE_SKEW = '1'
    await assertSingleCoreVersion(projectWithCores('999.999.999'), logger)
    assert.strictEqual(warnings.length, 1)
    assert.match(warnings[0]!, /PKU718/)
  })

  test('two distinct cores still throw PKU717 (split beats skew)', async () => {
    await assert.rejects(
      assertSingleCoreVersion(projectWithCores('0.12.51', '0.12.56'), logger),
      /PKU717.*Multiple @pikku\/core versions/s
    )
  })

  test('no core installed is not an error', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pikku-core-skew-'))
    dirs.push(root)
    mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    await assertSingleCoreVersion(root, logger)
    assert.strictEqual(warnings.length, 0)
  })
})
