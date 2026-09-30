import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  lockedVersions,
  runDeployReadinessChecks,
  runParaglideCompileChecks,
} from './deploy-readiness-checks.js'

const write = async (root: string, rel: string, content: string) => {
  const file = join(root, rel)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

const project = async (pkg: Record<string, unknown> = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-deploy-'))
  await write(root, 'package.json', JSON.stringify(pkg))
  return root
}

const ids = (findings: { id: string }[]) => findings.map((f) => f.id)

describe('deploy readiness checks', () => {
  test('flags an override pinning @pikku/core below the declared spec', async () => {
    const root = await project({
      dependencies: { '@pikku/core': '0.12.118' },
      overrides: { '@pikku/core': '0.12.115' },
    })

    const findings = await runDeployReadinessChecks(root)
    assert.deepEqual(ids(findings), ['pikku-override-skew--pikku-core'])
    assert.match(findings[0].message, /older/)
  })

  test('accepts an override that agrees with the declared spec', async () => {
    const root = await project({
      dependencies: { '@pikku/core': '^0.12.118' },
      overrides: { '@pikku/core': '0.12.118' },
    })

    assert.deepEqual(await runDeployReadinessChecks(root), [])
  })

  test('flags two locked majors of a hoist-sensitive package', async () => {
    const root = await project()
    await write(
      root,
      'bun.lock',
      [
        '{',
        '  "packages": {',
        '    "@ai-sdk/provider-utils": ["@ai-sdk/provider-utils@5.0.36", "", {}, "sha512-x"],',
        '    "foo/@ai-sdk/provider-utils": ["@ai-sdk/provider-utils@4.0.0", "", {}, "sha512-y"],',
        '  }',
        '}',
      ].join('\n')
    )

    const findings = await runDeployReadinessChecks(root)
    assert.deepEqual(ids(findings), ['dup-locked-major--ai-sdk-provider-utils'])
    assert.equal(findings[0].severity, 'warn')
    assert.match(findings[0].message, /4\.0\.0, 5\.0\.36/)
  })

  test('accepts two versions inside one major', async () => {
    // Ordinary in every lockfile in the estate, including the projects that
    // deploy cleanly — only a major boundary changes what an import resolves to.
    const root = await project()
    await write(
      root,
      'bun.lock',
      [
        '{',
        '  "packages": {',
        '    "@ai-sdk/provider-utils": ["@ai-sdk/provider-utils@5.0.37", "", {}, "sha512-x"],',
        '    "foo/@ai-sdk/provider-utils": ["@ai-sdk/provider-utils@5.0.29", "", {}, "sha512-y"],',
        '  }',
        '}',
      ].join('\n')
    )

    assert.deepEqual(await runDeployReadinessChecks(root), [])
  })

  test('accepts one locked version', async () => {
    const root = await project()
    await write(
      root,
      'bun.lock',
      [
        '{',
        '  "packages": {',
        '    "@ai-sdk/provider-utils": ["@ai-sdk/provider-utils@5.0.36", "", {}, "sha512-x"],',
        '    "foo/@ai-sdk/provider-utils": ["@ai-sdk/provider-utils@5.0.36", "", {}, "sha512-x"],',
        '  }',
        '}',
      ].join('\n')
    )

    assert.deepEqual(await runDeployReadinessChecks(root), [])
  })
})

describe('locked versions', () => {
  test('reads the name and version out of each entry', async () => {
    const versions = lockedVersions(
      [
        '    "ai": ["ai@7.0.91", "", { "dependencies": { "zod": "^4.0.0" } }, "sha512-x"],',
        '    "zod": ["zod@4.1.0", "", {}, "sha512-y"],',
      ].join('\n')
    )

    // The nested "dependencies" ranges on the same line are not resolutions and
    // must not be mistaken for them.
    assert.deepEqual([...(versions.get('ai') ?? [])], ['7.0.91'])
    assert.deepEqual([...(versions.get('zod') ?? [])], ['4.1.0'])
  })
})

describe('paraglide compile checks', () => {
  const app = async (
    root: string,
    name: string,
    pkg: Record<string, unknown>,
    viteConfig: string
  ) => {
    await write(root, `apps/${name}/package.json`, JSON.stringify(pkg))
    await write(root, `apps/${name}/project.inlang/settings.json`, '{}')
    await write(root, `apps/${name}/vite.config.ts`, viteConfig)
  }

  const paraglideDep = { devDependencies: { '@inlang/paraglide-js': '^2.0.0' } }

  test('flags a layout option with no i18n:compile script', async () => {
    const root = await project()
    await app(
      root,
      'app',
      paraglideDep,
      `paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide', outputStructure: 'locale-modules' })`
    )

    const findings = await runParaglideCompileChecks(root)
    assert.deepEqual(ids(findings), ['paraglide-compile-script-missing-app'])
    assert.equal(findings[0].severity, 'error')
  })

  test('accepts a layout option when the script records it', async () => {
    const root = await project()
    await app(
      root,
      'app',
      {
        ...paraglideDep,
        scripts: {
          'i18n:compile':
            'paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --outputStructure locale-modules',
        },
      },
      `paraglideVitePlugin({ project: './project.inlang', outputStructure: 'locale-modules' })`
    )

    assert.deepEqual(await runParaglideCompileChecks(root), [])
  })

  test('warns rather than errors when only outdir is configured', async () => {
    // `outdir` is the one option the container's own invocation also passes.
    const root = await project()
    await app(
      root,
      'app',
      paraglideDep,
      `paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide' })`
    )

    const findings = await runParaglideCompileChecks(root)
    assert.deepEqual(ids(findings), ['paraglide-compile-script-missing-app'])
    assert.equal(findings[0].severity, 'warn')
  })

  test('ignores an app with no paraglide dependency', async () => {
    const root = await project()
    await app(root, 'app', {}, `paraglideVitePlugin({ outputStructure: 'x' })`)

    assert.deepEqual(await runParaglideCompileChecks(root), [])
  })
})
