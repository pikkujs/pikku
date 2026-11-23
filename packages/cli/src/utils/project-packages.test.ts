import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import {
  isNestedProject,
  listProjectFiles,
  orderAddonPackages,
  packageDependencyNames,
  projectSourceDirs,
  resolveWorkspacePackages,
  findMainEntry,
  defaultScaffoldDir,
  checkAddonsWired,
  type AddonPackage,
} from './project-packages.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))
  )
})

const project = async (
  packages: Record<string, Record<string, unknown> | null>
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-dirs-'))
  roots.push(root)
  for (const [dir, pkg] of Object.entries(packages)) {
    await mkdir(join(root, dir), { recursive: true })
    await writeFile(
      join(root, dir, 'pikku.config.json'),
      JSON.stringify({ addon: true })
    )
    if (pkg)
      await writeFile(join(root, dir, 'package.json'), JSON.stringify(pkg))
  }
  return root
}

const pkg = (
  entry: string,
  name: string,
  dependsOn: string[] = []
): AddonPackage => ({
  entry,
  dir: `/x/${entry}`,
  name,
  dependsOn,
})

describe('packageDependencyNames', () => {
  test('reads the four dependency fields and pikku.uses in both forms', () => {
    const names = packageDependencyNames({
      dependencies: { a: '1' },
      devDependencies: { b: '1' },
      peerDependencies: { c: '1' },
      optionalDependencies: { d: '1' },
      pikku: { uses: { billing: '@scope/billing@^1.0.0' } },
    })
    assert.deepEqual(names.sort(), ['@scope/billing', 'a', 'b', 'c', 'd'])
    assert.deepEqual(packageDependencyNames({ pikku: { uses: ['x', 'y'] } }), [
      'x',
      'y',
    ])
    assert.deepEqual(packageDependencyNames({}), [])
  })
})

describe('orderAddonPackages', () => {
  test('puts a package after the listed packages it depends on', () => {
    const ordered = orderAddonPackages(
      [
        pkg('app', 'app', ['lib']),
        pkg('lib', 'lib', ['base']),
        pkg('base', 'base'),
      ],
      'pikku.config.json'
    )
    assert.deepEqual(
      ordered.map((p) => p.entry),
      ['base', 'lib', 'app']
    )
  })

  test('keeps the listed order between packages that do not depend on each other', () => {
    const ordered = orderAddonPackages(
      [pkg('c', 'c'), pkg('a', 'a'), pkg('b', 'b', ['a'])],
      'pikku.config.json'
    )
    assert.deepEqual(
      ordered.map((p) => p.entry),
      ['c', 'a', 'b']
    )
  })

  test('ignores a dependency that is not listed, and a self dependency', () => {
    const ordered = orderAddonPackages(
      [pkg('a', 'a', ['react', 'a']), pkg('b', 'b')],
      'pikku.config.json'
    )
    assert.deepEqual(
      ordered.map((p) => p.entry),
      ['a', 'b']
    )
  })

  test('names the cycle', () => {
    assert.throws(
      () =>
        orderAddonPackages(
          [pkg('packages/a', 'a', ['b']), pkg('packages/b', 'b', ['a'])],
          '/p/pikku.config.json'
        ),
      {
        message:
          'The addon packages of /p/pikku.config.json have a dependency cycle: packages/a -> packages/b -> packages/a. Remove one of the dependencies.',
      }
    )
  })

  test('a cycle behind a package that can be ordered is still found', () => {
    assert.throws(
      () =>
        orderAddonPackages(
          [
            pkg('ok', 'ok'),
            pkg('x', 'x', ['y']),
            pkg('y', 'y', ['z']),
            pkg('z', 'z', ['y']),
          ],
          'pikku.config.json'
        ),
      /dependency cycle: y -> z -> y\./
    )
  })
})

describe('findWorkspaceConfigs and resolveWorkspacePackages', () => {
  const file = 'pikku.config.json'

  type Member = {
    config: Record<string, unknown> | null
    pkg?: Record<string, unknown> | null
  }
  const workspace = async (
    members: Record<string, Member>,
    workspaces: unknown = ['packages/*'],
    rootConfig: Record<string, unknown> = {}
  ): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-ws-'))
    roots.push(root)
    await writeFile(join(root, file), JSON.stringify(rootConfig))
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'root', workspaces })
    )
    for (const [dir, member] of Object.entries(members)) {
      await mkdir(join(root, dir), { recursive: true })
      if (member.config) {
        await writeFile(join(root, dir, file), JSON.stringify(member.config))
      }
      if (member.pkg !== null) {
        await writeFile(
          join(root, dir, 'package.json'),
          JSON.stringify(member.pkg ?? { name: basename(dir) })
        )
      }
    }
    return root
  }
  const addon = () => ({ config: { addon: { displayName: 'x' } } })
  const main = { config: { main: true } }
  const load = (root: string) =>
    resolveWorkspacePackages(join(root, file), root)

  test('a main package and two addons are found by their markers', async () => {
    const root = await workspace({
      'packages/functions': main,
      'packages/a': {
        ...addon(),
        pkg: { name: 'a', dependencies: { b: '1' } },
      },
      'packages/b': addon(),
    })
    const found = await load(root)
    assert.equal(found.main?.entry, 'packages/functions')
    assert.deepEqual(
      found.addons.map((p) => [p.entry, p.name, p.dependsOn]),
      [
        ['packages/a', 'a', ['b']],
        ['packages/b', 'b', []],
      ]
    )
  })

  test('a project with no workspaces, or no package configs, has no packages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-ws-'))
    roots.push(root)
    await writeFile(join(root, file), '{}')
    assert.deepEqual(await load(root), { addons: [] })
    const bare = await workspace({ 'packages/x': { config: null } })
    assert.deepEqual(await load(bare), { addons: [] })
  })

  test('two main packages are an error naming both', async () => {
    const root = await workspace({
      'packages/one': main,
      'packages/two': main,
    })
    await assert.rejects(
      load(root),
      /packages\/one and packages\/two are both marked "main": true/
    )
  })

  test('a workspace package config with neither marker is an error', async () => {
    const root = await workspace({ 'packages/loose': { config: {} } })
    await assert.rejects(
      load(root),
      /packages\/loose\/pikku\.config\.json is a workspace package with no role marker/
    )
  })

  test('a package marked both main and addon is an error', async () => {
    const root = await workspace({
      'packages/x': { config: { main: true, addon: true } },
    })
    await assert.rejects(load(root), /both "main" and "addon"/)
  })

  test('a package.json without a name is an error', async () => {
    const root = await workspace({ 'packages/a': { ...addon(), pkg: {} } })
    await assert.rejects(load(root), /package\.json has no name/)
  })

  test('only workspace members count: node_modules, dot-directories, nested fixtures and negations are left out', async () => {
    const root = await workspace(
      {
        'packages/main': main,
        'packages/main/fixtures/inner': { config: {} },
        'node_modules/dep': { config: {} },
        'packages/.hidden': { config: {} },
        'packages/skipped': { config: {} },
        'other/outside': { config: {} },
      },
      ['packages/*', '!packages/skipped', 'node_modules/*']
    )
    const found = await load(root)
    assert.equal(found.main?.entry, 'packages/main')
    assert.deepEqual(found.addons, [])
  })

  test('the workspaces object form and ** patterns are read', async () => {
    const root = await workspace(
      { 'apps/deep/one': addon('one'), 'apps/two': main },
      { packages: ['apps/**'] }
    )
    const found = await load(root)
    assert.deepEqual(
      found.addons.map((p) => p.entry),
      ['apps/deep/one']
    )
    assert.equal(found.main?.entry, 'apps/two')
  })

  test('a marked config is a package, not a project root, and finds nothing', async () => {
    const root = await workspace({ 'packages/a': addon() }, ['packages/*'], {
      main: true,
    })
    assert.deepEqual(await load(root), { addons: [] })
  })

  test('a member that resolves outside the project is refused', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'pikku-ws-outside-'))
    roots.push(outside)
    await writeFile(join(outside, file), '{"main":true}')
    await writeFile(join(outside, 'package.json'), '{"name":"out"}')
    const root = await workspace({})
    await mkdir(join(root, 'packages'), { recursive: true })
    await symlink(outside, join(root, 'packages/out'))
    await assert.rejects(load(root), /resolves outside the project root/)
  })

  test('findMainEntry is the marked package, and never throws', async () => {
    const root = await workspace({
      'packages/m': main,
      'packages/l': { config: {} },
    })
    assert.equal(findMainEntry(root), 'packages/m')
    assert.equal(findMainEntry('/nonexistent-dir-xyz'), undefined)
  })
})

describe('checkAddonsWired', () => {
  const tools = {
    entry: 'packages/tools',
    name: '@x/tools',
  }
  const file = '/p/pikku.config.json'
  const call = (name: string, pkg: string, path = '/p/packages/app/src/a.ts') =>
    new Map([[name, { package: pkg, file: path }]])

  test('accepts an addon the main package wires under any name', () => {
    for (const name of ['tools', 'tols']) {
      assert.deepEqual(
        checkAddonsWired(
          file,
          [tools],
          call(name, '@x/tools'),
          '/p/packages/app'
        ),
        []
      )
    }
  })

  test('an addon wired more than once, under different names, is accepted', () => {
    const twice = new Map([
      ['tools', { package: '@x/tools', file: '/p/packages/app/src/a.ts' }],
      ['tools_test', { package: '@x/tools', file: '/p/packages/app/src/b.ts' }],
    ])
    assert.deepEqual(
      checkAddonsWired(file, [tools], twice, '/p/packages/app'),
      []
    )
  })

  test('a call whose package is an alias counts as the package it installs', () => {
    const alias = new Map([
      ['tools', { package: 'tools', file: '/p/packages/app/src/a.ts' }],
    ])
    const resolveName = (d: { package: string }) =>
      d.package === 'tools' ? '@x/tools' : d.package
    assert.deepEqual(
      checkAddonsWired(file, [tools], alias, '/p/packages/app', resolveName),
      []
    )
  })

  test('a declaration with no file counts', () => {
    const noFile = new Map([['tols', { package: '@x/tools' }]])
    assert.deepEqual(
      checkAddonsWired(file, [tools], noFile, '/p/packages/app'),
      []
    )
  })

  test('an addon no call points at is a warning naming it', () => {
    const warnings = checkAddonsWired(
      file,
      [tools],
      call('other', '@x/other'),
      '/p/packages/app'
    )
    assert.equal(warnings.length, 1)
    assert.match(
      warnings[0]!,
      /workspace of \/p\/pikku.config.json has the addon "packages\/tools"/
    )
    assert.match(warnings[0]!, /package: '@x\/tools'/)
  })

  test('only a call in the main package source counts', () => {
    const elsewhere = call('tools', '@x/tools', '/p/src/other.ts')
    assert.equal(
      checkAddonsWired(file, [tools], elsewhere, '/p/packages/app').length,
      1
    )
    assert.deepEqual(checkAddonsWired(file, [tools], elsewhere, '/p'), [])
  })
})

describe('project files', () => {
  test('a project inspects its own directory, plus its main package', async () => {
    const bare = await project({})
    assert.deepEqual(projectSourceDirs(bare), ['.'])
    const root = await project({})
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*'] })
    )
    await mkdir(join(root, 'packages/a'), { recursive: true })
    await writeFile(join(root, 'packages/a/pikku.config.json'), '{"main":true}')
    assert.deepEqual(projectSourceDirs(root), ['.', 'packages/a'])
    assert.equal(defaultScaffoldDir(root), 'packages/a/src/scaffold')
    assert.equal(defaultScaffoldDir(bare), 'src/scaffold')
  })

  test('the walk skips dependencies, output, dot-directories and nested projects', async () => {
    const root = await project({ nested: { name: 'nested' } })
    for (const f of [
      'src/a.ts',
      'node_modules/x/b.ts',
      'dist/c.ts',
      '.hidden/d.ts',
      '.pikku/e.ts',
      'nested/f.ts',
      'z.tsx',
    ]) {
      await mkdir(join(root, f, '..'), { recursive: true })
      await writeFile(join(root, f), '')
    }
    const files = await listProjectFiles(root, ['.'], ['.ts'])
    assert.deepEqual(files, [join(root, 'src/a.ts')])
    assert.equal(isNestedProject(join(root, 'nested'), root), true)
    assert.equal(isNestedProject(root, root), false)
  })

  test('a nested project is walked when it is the directory asked for', async () => {
    const root = await project({ nested: { name: 'nested' } })
    await writeFile(join(root, 'nested/f.ts'), '')
    assert.deepEqual(await listProjectFiles(root, ['nested'], ['.ts']), [
      join(root, 'nested/f.ts'),
    ])
  })
})
