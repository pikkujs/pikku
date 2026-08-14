import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  runTypeIdentityChecks,
  warnOnSplitTypeIdentity,
} from './type-identity-checks.js'
import { planValidation } from './validate-registry.js'

const makeTmp = () => mkdtemp(join(tmpdir(), 'pikku-type-identity-'))

const writeJson = async (path: string, value: unknown) => {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2))
}

/**
 * Mirrors the real shape: node_modules/@scope/linked is a genuine directory
 * whose `dist` symlinks into a sibling checkout, so TypeScript resolves that
 * package's imports from the other tree's node_modules.
 */
const linkExternal = async (
  root: string,
  external: string,
  externalVersion: string,
  ourVersion = '1.6.23'
) => {
  await writeJson(join(root, 'node_modules', 'better-auth', 'package.json'), {
    name: 'better-auth',
    version: ourVersion,
  })

  const linkedPkg = join(external, 'packages', 'linked')
  await mkdir(join(linkedPkg, 'dist'), { recursive: true })
  await writeJson(join(linkedPkg, 'package.json'), {
    name: '@scope/linked',
    version: '1.0.0',
  })
  await writeJson(
    join(external, 'node_modules', 'better-auth', 'package.json'),
    { name: 'better-auth', version: externalVersion }
  )

  const inNodeModules = join(root, 'node_modules', '@scope', 'linked')
  await mkdir(inNodeModules, { recursive: true })
  await writeJson(join(inNodeModules, 'package.json'), {
    name: '@scope/linked',
    version: '1.0.0',
  })
  await symlink(join(linkedPkg, 'dist'), join(inNodeModules, 'dist'), 'dir')
}

const withTmpPair = async (
  fn: (root: string, external: string) => Promise<void>
) => {
  const root = await makeTmp()
  const external = await makeTmp()
  try {
    await fn(root, external)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(external, { recursive: true, force: true })
  }
}

describe('split type identity via a linked dependency', () => {
  test('linked dep resolving a different version → error naming both', async () => {
    await withTmpPair(async (root, external) => {
      await linkExternal(root, external, '1.6.27')
      const findings = await runTypeIdentityChecks(root)
      const finding = findings.find((f) =>
        f.id.startsWith('split-type-identity')
      )
      assert.ok(
        finding,
        `expected a finding, got: ${JSON.stringify(findings.map((f) => f.id))}`
      )
      assert.equal(finding.severity, 'error')
      assert.match(finding.message, /1\.6\.27/)
      assert.match(finding.message, /1\.6\.23/)
      assert.match(finding.message, /@scope\/linked/)
    })
  })

  test('linked dep resolving the same version → no finding', async () => {
    await withTmpPair(async (root, external) => {
      await linkExternal(root, external, '1.6.23')
      assert.deepEqual(await runTypeIdentityChecks(root), [])
    })
  })

  // Bun's isolated layout: node_modules/@scope/linked is itself a symlink into
  // an in-project store, and the link out of the tree is the `dist` inside that
  // target. Both hops have to be followed — the first one lands inside the
  // project and proves nothing.
  test('finds the link through an in-project store symlink', async () => {
    await withTmpPair(async (root, external) => {
      await writeJson(join(root, 'node_modules', 'better-auth', 'package.json'), {
        name: 'better-auth',
        version: '1.6.23',
      })
      await writeJson(
        join(external, 'node_modules', 'better-auth', 'package.json'),
        { name: 'better-auth', version: '1.6.27' }
      )
      const externalDist = join(external, 'packages', 'linked', 'dist')
      await mkdir(externalDist, { recursive: true })
      await writeJson(join(external, 'packages', 'linked', 'package.json'), {
        name: '@scope/linked',
        version: '1.0.0',
      })

      const store = join(root, 'node_modules', '.store', 'linked@1.0.0')
      await mkdir(store, { recursive: true })
      await writeJson(join(store, 'package.json'), {
        name: '@scope/linked',
        version: '1.0.0',
      })
      await symlink(externalDist, join(store, 'dist'), 'dir')

      await mkdir(join(root, 'node_modules', '@scope'), { recursive: true })
      await symlink(store, join(root, 'node_modules', '@scope', 'linked'), 'dir')

      const findings = await runTypeIdentityChecks(root)
      assert.ok(
        findings.some((f) => f.id.startsWith('split-type-identity')),
        `expected a finding, got: ${JSON.stringify(findings.map((f) => f.id))}`
      )
    })
  })

  test('no linked dependency → no finding', async () => {
    await withTmpPair(async (root) => {
      await writeJson(
        join(root, 'node_modules', 'better-auth', 'package.json'),
        { name: 'better-auth', version: '1.6.23' }
      )
      assert.deepEqual(await runTypeIdentityChecks(root), [])
    })
  })

  // The version the project resolves is the one the workspace package sees. An
  // isolated install (bun's default) never hoists it to the root, so a root-only
  // probe finds nothing and the check silently passes.
  test('finds the project version under a workspace package, not just the root', async () => {
    await withTmpPair(async (root, external) => {
      await writeJson(join(root, 'package.json'), { name: 'root' })
      await writeJson(
        join(root, 'packages', 'api', 'node_modules', 'kysely', 'package.json'),
        { name: 'kysely', version: '0.29.2' }
      )
      await linkExternal(root, external, '1.6.23')
      await writeJson(
        join(external, 'node_modules', 'kysely', 'package.json'),
        { name: 'kysely', version: '0.28.0' }
      )
      const ids = (await runTypeIdentityChecks(root)).map((f) => f.id)
      assert.ok(
        ids.some((id) => id.endsWith('kysely')),
        `expected a kysely finding, got: ${JSON.stringify(ids)}`
      )
    })
  })

  test('is not planned at all when nothing is installed', async () => {
    await withTmpPair(async (root) => {
      await writeJson(join(root, 'package.json'), { name: 'root' })
      const planned = (await planValidation(root)).filter(
        ({ check }) => check.id === 'type-identity'
      )
      assert.deepEqual(planned, [])
    })
  })

  test('runs once per install, at the root, not per workspace package', async () => {
    await withTmpPair(async (root) => {
      await writeJson(join(root, 'package.json'), { name: 'root' })
      await writeJson(join(root, 'packages', 'api', 'package.json'), {
        name: 'api',
      })
      await writeJson(join(root, 'packages', 'web', 'package.json'), {
        name: 'web',
      })
      await mkdir(join(root, 'node_modules'), { recursive: true })
      const planned = (await planValidation(root)).filter(
        ({ check }) => check.id === 'type-identity'
      )
      assert.equal(planned.length, 1)
      assert.equal(planned[0]?.target.label, '.')
    })
  })
})

describe('warnOnSplitTypeIdentity (codegen preflight)', () => {
  const collect = () => {
    const warnings: string[] = []
    return { warnings, logger: { warn: (m: string) => warnings.push(m) } }
  }

  test('warns, naming the code and both versions', async () => {
    await withTmpPair(async (root, external) => {
      await linkExternal(root, external, '1.6.27')
      const { warnings, logger } = collect()
      await warnOnSplitTypeIdentity(root, logger)
      assert.equal(warnings.length, 1)
      assert.match(warnings[0]!, /PKU719/)
      assert.match(warnings[0]!, /1\.6\.27/)
      assert.match(warnings[0]!, /1\.6\.23/)
    })
  })

  test('says nothing when the versions agree', async () => {
    await withTmpPair(async (root, external) => {
      await linkExternal(root, external, '1.6.23')
      const { warnings, logger } = collect()
      await warnOnSplitTypeIdentity(root, logger)
      assert.deepEqual(warnings, [])
    })
  })

  // It runs on every codegen, so it must never be the reason a build stops.
  test('never throws, even on an unreadable root', async () => {
    const { warnings, logger } = collect()
    await warnOnSplitTypeIdentity('/definitely/not/a/path', logger)
    assert.deepEqual(warnings, [])
  })

  test('PIKKU_SKIP_TYPE_IDENTITY_CHECK silences it', async () => {
    await withTmpPair(async (root, external) => {
      await linkExternal(root, external, '1.6.27')
      const { warnings, logger } = collect()
      process.env.PIKKU_SKIP_TYPE_IDENTITY_CHECK = '1'
      try {
        await warnOnSplitTypeIdentity(root, logger)
      } finally {
        delete process.env.PIKKU_SKIP_TYPE_IDENTITY_CHECK
      }
      assert.deepEqual(warnings, [])
    })
  })
})
