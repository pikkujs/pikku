import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  collectManifestPaths,
  findInstallRoot,
  findProjectRoot,
  resolveInstalled,
  rewriteRange,
  runUpdate,
  type Packument,
} from './update.js'

const scratch = () => mkdtempSync(join(tmpdir(), 'pikku-update-'))

const writeJson = (path: string, value: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

const packument = (
  distTags: Record<string, string>,
  versions: Packument['versions'] = {}
): Packument => ({ 'dist-tags': distTags, versions })

describe('rewriteRange', () => {
  test('keeps the range operator when moving the floor', () => {
    assert.equal(rewriteRange('^0.12.83', '0.12.99'), '^0.12.99')
    assert.equal(rewriteRange('~0.12.83', '0.12.99'), '~0.12.99')
    assert.equal(rewriteRange('>=0.12.83', '0.12.99'), '>=0.12.99')
    assert.equal(rewriteRange('0.12.83', '0.12.99'), '0.12.99')
  })

  test('refuses ranges whose meaning a substitution would change', () => {
    assert.equal(rewriteRange('workspace:*', '0.12.99'), null)
    assert.equal(rewriteRange('^18 || ^19', '19.2.0'), null)
    assert.equal(rewriteRange('0.12.x', '0.12.99'), null)
    assert.equal(rewriteRange('*', '0.12.99'), null)
    assert.equal(rewriteRange('file:../core', '0.12.99'), null)
  })

  test('carries prerelease and build metadata through', () => {
    assert.equal(rewriteRange('^1.0.0', '2.0.0-rc.1'), '^2.0.0-rc.1')
  })
})

describe('project layout discovery', () => {
  test('finds the nearest package.json walking up', () => {
    const root = scratch()
    const nested = join(root, 'src', 'deep')
    mkdirSync(nested, { recursive: true })
    writeJson(join(root, 'package.json'), { name: 'app' })
    assert.equal(findProjectRoot(nested), root)
  })

  test('install root is the directory holding the lockfile, not the package', () => {
    const root = scratch()
    const pkg = join(root, 'packages', 'api')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(root, 'yarn.lock'), '', 'utf-8')
    assert.deepEqual(findInstallRoot(pkg), {
      dir: root,
      packageManager: 'yarn',
    })
  })

  test('the corepack packageManager field beats a stale lockfile', () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'mono',
      packageManager: 'bun@1.3.14',
    })
    writeFileSync(join(root, 'yarn.lock'), '', 'utf-8')
    assert.deepEqual(findInstallRoot(root), {
      dir: root,
      packageManager: 'bun',
    })
  })

  test('reports an unknown package manager when nothing names one', () => {
    const root = scratch()
    assert.equal(findInstallRoot(root).packageManager, 'unknown')
  })

  test('collects workspace manifests alongside the root', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'mono',
      workspaces: ['packages/*'],
    })
    writeJson(join(root, 'packages', 'api', 'package.json'), { name: 'api' })
    writeJson(join(root, 'packages', 'web', 'package.json'), { name: 'web' })
    writeJson(join(root, 'node_modules', 'ignored', 'package.json'), {
      name: 'ignored',
    })

    const paths = await collectManifestPaths(root)
    assert.deepEqual(paths, [
      join(root, 'package.json'),
      join(root, 'packages', 'api', 'package.json'),
      join(root, 'packages', 'web', 'package.json'),
    ])
  })

  test('resolves an installed version from a hoisted node_modules', () => {
    const root = scratch()
    const pkg = join(root, 'packages', 'api')
    mkdirSync(pkg, { recursive: true })
    writeJson(join(root, 'node_modules', '@pikku', 'core', 'package.json'), {
      name: '@pikku/core',
      version: '0.12.83',
    })
    assert.equal(resolveInstalled(pkg, '@pikku/core'), '0.12.83')
    assert.equal(resolveInstalled(pkg, '@pikku/missing'), null)
  })
})

describe('runUpdate', () => {
  const base = {
    apply: false,
    updatePeers: false,
    install: false,
    tag: 'latest',
    registry: 'https://registry.npmjs.org',
  }

  test('reports an outdated range without touching package.json', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: { '@pikku/core': '^0.12.83', express: '^5.0.0' },
    })

    const result = await runUpdate({
      ...base,
      rootDir: root,
      fetchPackument: async (name) =>
        name === '@pikku/core' ? packument({ latest: '0.12.99' }) : null,
    })

    assert.equal(result.summary.checked, 1, 'only @pikku packages are checked')
    assert.equal(result.summary.outdated, 1)
    assert.equal(result.entries[0]!.target, '^0.12.99')
    assert.equal(result.entries[0]!.status, 'outdated')
    assert.deepEqual(result.written, [])
    assert.match(
      readFileSync(join(root, 'package.json'), 'utf-8'),
      /"@pikku\/core": "\^0\.12\.83"/,
      'a reporting run must not write'
    )
  })

  test('flags a range that already allows latest but an install that does not', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: { '@pikku/core': '^0.12.99' },
    })
    writeJson(join(root, 'node_modules', '@pikku', 'core', 'package.json'), {
      name: '@pikku/core',
      version: '0.12.90',
    })

    const result = await runUpdate({
      ...base,
      rootDir: root,
      fetchPackument: async () => packument({ latest: '0.12.99' }),
    })

    assert.equal(result.entries[0]!.status, 'stale-install')
    assert.equal(result.entries[0]!.target, null)
    assert.equal(result.summary.staleInstall, 1)
  })

  test('leaves a range it cannot safely rewrite alone', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: { '@pikku/core': '^0.12.0 || ^0.13.0' },
    })

    const result = await runUpdate({
      ...base,
      apply: true,
      rootDir: root,
      fetchPackument: async () => packument({ latest: '0.12.99' }),
    })

    assert.equal(result.entries[0]!.status, 'manual')
    assert.equal(result.summary.manual, 1)
    assert.deepEqual(result.written, [])
    assert.match(
      readFileSync(join(root, 'package.json'), 'utf-8'),
      /\^0\.12\.0 \|\| \^0\.13\.0/
    )
  })

  test('a locally linked package is reported apart from a range needing a decision', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: {
        '@pikku/core': 'workspace:*',
        '@pikku/cli': 'file:../cli',
        '@pikku/kysely': 'link:../kysely',
      },
    })

    const result = await runUpdate({
      ...base,
      apply: true,
      rootDir: root,
      fetchPackument: async () => packument({ latest: '0.12.99' }),
    })

    assert.equal(result.summary.linked, 3)
    assert.equal(
      result.summary.manual,
      0,
      'a deliberate local checkout is not a decision waiting on the user'
    )
    assert.deepEqual(result.written, [])
    assert.match(
      readFileSync(join(root, 'package.json'), 'utf-8'),
      /"workspace:\*"/
    )
  })

  test('marks a package the registry has no such tag for as unresolved', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: { '@pikku/core': '^0.12.83' },
    })

    const result = await runUpdate({
      ...base,
      rootDir: root,
      tag: 'next',
      fetchPackument: async () => packument({ latest: '0.12.99' }),
    })

    assert.equal(result.entries[0]!.status, 'unresolved')
    assert.equal(result.summary.unresolved, 1)
  })

  test('--update writes every field and workspace, preserving formatting', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'mono',
      workspaces: ['packages/*'],
      devDependencies: { '@pikku/cli': '~0.12.100' },
    })
    writeJson(join(root, 'packages', 'api', 'package.json'), {
      name: 'api',
      dependencies: { '@pikku/core': '^0.12.83' },
      peerDependencies: { '@pikku/core': '^0.12.83' },
    })

    const result = await runUpdate({
      ...base,
      apply: true,
      rootDir: root,
      fetchPackument: async (name) =>
        packument({
          latest: name === '@pikku/cli' ? '0.12.103' : '0.12.99',
        }),
    })

    assert.deepEqual(result.written.sort(), [
      'package.json',
      'packages/api/package.json',
    ])

    const rootRaw = readFileSync(join(root, 'package.json'), 'utf-8')
    assert.match(rootRaw, /"@pikku\/cli": "~0\.12\.103"/)
    assert.ok(rootRaw.endsWith('\n'), 'trailing newline is preserved')
    assert.match(rootRaw, /\n  "name"/, 'two-space indentation is preserved')

    const api = JSON.parse(
      readFileSync(join(root, 'packages', 'api', 'package.json'), 'utf-8')
    )
    assert.equal(api.dependencies['@pikku/core'], '^0.12.99')
    assert.equal(
      api.peerDependencies['@pikku/core'],
      '^0.12.99',
      'an addon’s own peer range is a declared range too'
    )
  })

  test('reports a peer the target version needs but the project does not satisfy', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: { '@pikku/ai-vercel': '^0.12.10', ai: '^5.0.0' },
    })

    const result = await runUpdate({
      ...base,
      rootDir: root,
      fetchPackument: async (name) =>
        name === '@pikku/ai-vercel'
          ? packument(
              { latest: '0.12.20' },
              { '0.12.20': { peerDependencies: { ai: '^6.0.0' } } }
            )
          : null,
    })

    assert.equal(result.summary.peerIssues, 1)
    assert.deepEqual(
      {
        package: result.peers[0]!.package,
        peer: result.peers[0]!.peer,
        required: result.peers[0]!.required,
        found: result.peers[0]!.found,
      },
      {
        package: '@pikku/ai-vercel',
        peer: 'ai',
        required: '^6.0.0',
        found: '^5.0.0',
      }
    )
  })

  test('reads peers off the version being moved to, not the one installed', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: { '@pikku/ai-vercel': '^0.12.10', ai: '^5.0.0' },
    })
    writeJson(
      join(root, 'node_modules', '@pikku', 'ai-vercel', 'package.json'),
      { name: '@pikku/ai-vercel', version: '0.12.10' }
    )

    const result = await runUpdate({
      ...base,
      rootDir: root,
      fetchPackument: async (name) =>
        name === '@pikku/ai-vercel'
          ? packument(
              { latest: '0.12.20' },
              {
                '0.12.10': { peerDependencies: { ai: '^5.0.0' } },
                '0.12.20': { peerDependencies: { ai: '^6.0.0' } },
              }
            )
          : null,
    })

    assert.equal(
      result.summary.peerIssues,
      1,
      'the installed version is satisfied, the target is not'
    )
    assert.equal(result.peers[0]!.required, '^6.0.0')
  })

  test('does not report an @pikku peer the same run already brings forward', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: {
        '@pikku/kysely': '^0.12.1',
        '@pikku/core': '^0.12.40',
      },
    })

    const result = await runUpdate({
      ...base,
      rootDir: root,
      fetchPackument: async (name) =>
        name === '@pikku/kysely'
          ? packument(
              { latest: '0.13.15' },
              { '0.13.15': { peerDependencies: { '@pikku/core': '^0.12.82' } } }
            )
          : packument({ latest: '0.12.99' }),
    })

    assert.deepEqual(result.peers, [])
  })

  test('skips an optional peer the project does not declare', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: { '@pikku/uws-handler': '^0.12.1' },
    })

    const result = await runUpdate({
      ...base,
      rootDir: root,
      fetchPackument: async () =>
        packument(
          { latest: '0.12.9' },
          {
            '0.12.9': {
              peerDependencies: { 'uWebSockets.js': '*' },
              peerDependenciesMeta: { 'uWebSockets.js': { optional: true } },
            },
          }
        ),
    })

    assert.deepEqual(result.peers, [])
  })

  test('--update alone leaves peer ranges alone; --update-peers writes them', async () => {
    const manifest = {
      name: 'app',
      dependencies: { '@pikku/ai-vercel': '^0.12.10', ai: '^5.0.0' },
    }
    const fetchPackument = async (name: string) =>
      name === '@pikku/ai-vercel'
        ? packument(
            { latest: '0.12.20' },
            { '0.12.20': { peerDependencies: { ai: '^6.0.0' } } }
          )
        : null

    const reportOnly = scratch()
    writeJson(join(reportOnly, 'package.json'), manifest)
    await runUpdate({
      ...base,
      apply: true,
      rootDir: reportOnly,
      fetchPackument,
    })
    assert.equal(
      JSON.parse(readFileSync(join(reportOnly, 'package.json'), 'utf-8'))
        .dependencies.ai,
      '^5.0.0',
      'a third-party major bump is not something --update decides'
    )

    const withPeers = scratch()
    writeJson(join(withPeers, 'package.json'), manifest)
    await runUpdate({
      ...base,
      apply: true,
      updatePeers: true,
      rootDir: withPeers,
      fetchPackument,
    })
    const written = JSON.parse(
      readFileSync(join(withPeers, 'package.json'), 'utf-8')
    )
    assert.equal(written.dependencies.ai, '^6.0.0')
    assert.equal(written.dependencies['@pikku/ai-vercel'], '^0.12.20')
  })

  test('a registry that answers nothing leaves everything unresolved rather than current', async () => {
    const root = scratch()
    writeJson(join(root, 'package.json'), {
      name: 'app',
      dependencies: { '@pikku/core': '^0.12.83' },
    })

    const result = await runUpdate({
      ...base,
      rootDir: root,
      fetchPackument: async () => null,
    })

    assert.equal(result.summary.unresolved, 1)
    assert.equal(result.summary.outdated, 0)
  })
})
