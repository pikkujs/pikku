import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import {
  isNestedProject,
  listProjectFiles,
  orderAddonPackages,
  packageDependencyNames,
  projectSourceDirs,
  resolveAddonPackages,
  resolveBasePackage,
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
      JSON.stringify({ namespace: basename(dir), addon: true })
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
  namespace: name,
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
          'addons in /p/pikku.config.json has a dependency cycle: packages/a -> packages/b -> packages/a. Remove one of the dependencies.',
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

describe('resolveAddonPackages', () => {
  const file = 'pikku.config.json'

  test('reads each listed package in the order listed', async () => {
    const root = await project({
      'packages/a': { name: 'a', dependencies: { b: '1' } },
      'packages/b': { name: 'b' },
    })
    const packages = await resolveAddonPackages(file, root, [
      'packages/a',
      'packages/b',
    ])
    assert.deepEqual(
      packages.map((p) => [p.entry, p.name, p.dependsOn]),
      [
        ['packages/a', 'a', ['b']],
        ['packages/b', 'b', []],
      ]
    )
  })

  test('an absent key lists nothing', async () => {
    assert.deepEqual(await resolveAddonPackages(file, '/x', undefined), [])
  })

  test('refuses a value that is not a list of strings', async () => {
    await assert.rejects(
      resolveAddonPackages(file, '/x', 'packages/a'),
      /must be a list of directories/
    )
    await assert.rejects(
      resolveAddonPackages(file, '/x', [1]),
      /must be a list of directories/
    )
  })

  test('refuses the project directory itself', async () => {
    const root = await project({})
    await assert.rejects(
      resolveAddonPackages(file, root, ['.']),
      /which is this project's own directory/
    )
  })

  test('refuses a directory that does not exist', async () => {
    const root = await project({})
    await assert.rejects(
      resolveAddonPackages(file, root, ['nope']),
      /"nope", which does not exist/
    )
  })

  test('refuses a directory without its own pikku.config.json', async () => {
    const root = await project({})
    await mkdir(join(root, 'plain'))
    await assert.rejects(
      resolveAddonPackages(file, root, ['plain']),
      /"plain", which has no pikku.config.json/
    )
  })

  test('refuses a listed config that sets addons or base itself', async () => {
    const root = await project({ 'packages/a': { name: 'a' } })
    await writeFile(join(root, 'packages/a/pikku.config.json'), '{"base":"x"}')
    await assert.rejects(
      resolveAddonPackages(file, root, ['packages/a']),
      /sets addons or base itself/
    )
  })

  test('refuses a package.json without a name', async () => {
    const root = await project({ 'packages/a': {} })
    await assert.rejects(
      resolveAddonPackages(file, root, ['packages/a']),
      /package.json has no name/
    )
    const none = await project({ 'packages/a': null })
    await assert.rejects(
      resolveAddonPackages(file, none, ['packages/a']),
      /package.json has no name/
    )
  })

  test('refuses a listed package whose config has no namespace', async () => {
    const root = await project({ 'packages/a': { name: 'a' } })
    await writeFile(
      join(root, 'packages/a/pikku.config.json'),
      '{"addon":true}'
    )
    await assert.rejects(
      resolveAddonPackages(file, root, ['packages/a']),
      /"packages\/a", whose pikku.config.json has no namespace/
    )
  })

  test('refuses a namespace that is not a valid addon name', async () => {
    const root = await project({ 'packages/a': { name: 'a' } })
    await writeFile(
      join(root, 'packages/a/pikku.config.json'),
      '{"namespace":"Bad Name","addon":true}'
    )
    await assert.rejects(
      resolveAddonPackages(file, root, ['packages/a']),
      /namespace "Bad Name" in packages\/a\/pikku.config.json is not valid/
    )
  })

  test('refuses two packages that declare the same namespace', async () => {
    const root = await project({
      'packages/a': { name: 'a' },
      'packages/b': { name: 'b' },
    })
    for (const d of ['a', 'b']) {
      await writeFile(
        join(root, 'packages', d, 'pikku.config.json'),
        '{"namespace":"shared","addon":true}'
      )
    }
    await assert.rejects(
      resolveAddonPackages(file, root, ['packages/a', 'packages/b']),
      /"packages\/a" and "packages\/b", which both declare the namespace "shared"/
    )
  })

  test('refuses two entries that are the same package', async () => {
    const root = await project({
      'packages/a': { name: 'same' },
      'packages/b': { name: 'same' },
    })
    await assert.rejects(
      resolveAddonPackages(file, root, ['packages/a', 'packages/b']),
      /both the package "same"/
    )
  })
})

describe('resolveBasePackage', () => {
  const file = 'pikku.config.json'

  test('is undefined when the project is its own base', async () => {
    assert.equal(await resolveBasePackage(file, '/p', undefined, []), undefined)
  })

  test('reads a package with its own config and name', async () => {
    const root = await project({ 'packages/app': { name: 'app' } })
    await writeFile(join(root, 'packages/app/pikku.config.json'), '{}')
    const base = await resolveBasePackage(file, root, 'packages/app', [])
    assert.equal(base?.name, 'app')
    assert.equal(base?.dir, join(root, 'packages/app'))
  })

  test('refuses a list, an addon, a config that sets addons, and the project itself', async () => {
    const root = await project({ 'packages/app': { name: 'app' } })
    await assert.rejects(
      resolveBasePackage(file, root, ['packages/app'], []),
      /must be one directory/
    )
    await assert.rejects(
      resolveBasePackage(file, root, 'packages/app', []),
      /which is an addon/
    )
    await writeFile(
      join(root, 'packages/app/pikku.config.json'),
      '{"addons":[]}'
    )
    await assert.rejects(
      resolveBasePackage(file, root, 'packages/app', []),
      /sets addons or base itself/
    )
    await assert.rejects(
      resolveBasePackage(file, root, '.', []),
      /own directory/
    )
  })

  test('refuses a base outside the config directory: `..`, absolute, or a symlink out', async () => {
    const root = await project({ 'inner/placeholder': { name: 'x' } })
    const outside = await project({ app: { name: 'app' } })
    await writeFile(join(outside, 'app/pikku.config.json'), '{}')
    await symlink(join(outside, 'app'), join(root, 'inner/linked'))
    const inner = join(root, 'inner')
    for (const entry of [
      relative(inner, join(outside, 'app')),
      join(outside, 'app'),
      'linked',
    ]) {
      await assert.rejects(
        resolveBasePackage(file, inner, entry, []),
        /outside the config directory.*must live inside the config directory/,
        entry
      )
    }
  })

  test('refuses a directory that is also an addon', async () => {
    const root = await project({ 'packages/app': { name: 'app' } })
    await writeFile(join(root, 'packages/app/pikku.config.json'), '{}')
    const addons = [
      {
        entry: 'packages/app',
        dir: join(root, 'packages/app'),
        name: 'app',
        namespace: 'app',
        dependsOn: [],
      },
    ]
    await assert.rejects(
      resolveBasePackage(file, root, 'packages/app', addons),
      /also listed in addons/
    )
  })
})

describe('checkAddonsWired', () => {
  const tools = {
    entry: 'packages/tools',
    name: '@x/tools',
    namespace: 'tools',
  }
  const file = '/p/pikku.config.json'
  const call = (name: string, pkg: string, path = '/p/packages/app/src/a.ts') =>
    new Map([[name, { package: pkg, file: path }]])

  test('accepts an addon the base wires under its namespace', () => {
    assert.deepEqual(
      checkAddonsWired(
        file,
        [tools],
        call('tools', '@x/tools'),
        '/p/packages/app'
      ),
      []
    )
  })

  test('a call naming the addon package under another name is an error showing both names', () => {
    assert.throws(
      () =>
        checkAddonsWired(
          file,
          [tools],
          call('tols', '@x/tools'),
          '/p/packages/app'
        ),
      /"@x\/tools" "tols".*"tools" \(addons in \/p\/pikku.config.json\)/
    )
  })

  test('an addon no call points at is a warning naming it and the expected namespace', () => {
    const warnings = checkAddonsWired(
      file,
      [tools],
      call('other', '@x/other'),
      '/p/packages/app'
    )
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /\/p\/pikku.config.json lists "packages\/tools"/)
    assert.match(warnings[0]!, /name: 'tools', package: '@x\/tools'/)
  })

  test('only a call in the base source counts', () => {
    const elsewhere = call('tools', '@x/tools', '/p/src/other.ts')
    assert.equal(
      checkAddonsWired(file, [tools], elsewhere, '/p/packages/app').length,
      1
    )
    assert.deepEqual(checkAddonsWired(file, [tools], elsewhere, '/p'), [])
    // A misnamed call outside the base is not read either.
    assert.equal(
      checkAddonsWired(
        file,
        [tools],
        call('tols', '@x/tools', '/p/src/other.ts'),
        '/p/packages/app'
      ).length,
      1
    )
  })
})

describe('project files', () => {
  test('a project inspects its own directory, plus its base', () => {
    assert.deepEqual(projectSourceDirs({}), ['.'])
    assert.deepEqual(projectSourceDirs({ base: 'packages/a' }), [
      '.',
      'packages/a',
    ])
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
