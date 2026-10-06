import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getPikkuCLIConfig } from '../../utils/pikku-cli-config.js'
import {
  runScaffoldDuplicateChecks,
  SCAFFOLD_OUTPUTS,
} from './scaffold-duplicate-checks.js'

const write = async (root: string, rel: string, content: string) => {
  const file = join(root, rel)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

const CONSOLE_WIRING = `
// not @pikku/addon-admin: that one is wired elsewhere
import { wireAddon } from '#pikku/addon'
wireAddon({
  name: 'console',
  package: '@pikku/addon-console',
  scopes: ['pikku:console'],
})
`

const project = async (scaffold: Record<string, unknown> = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-scaffold-dupes-'))
  await write(
    root,
    'pikku.config.json',
    JSON.stringify({
      srcDirectories: ['packages/functions/src'],
      outDir: 'packages/functions/.pikku',
      scaffold: {
        pikkuDir: 'packages/functions/src/scaffold',
        console: true,
        rpc: true,
        ...scaffold,
      },
    })
  )
  await write(
    root,
    'packages/functions/src/scaffold/console/console.gen.ts',
    CONSOLE_WIRING
  )
  await write(
    root,
    'packages/functions/src/scaffold/rpc/rpc-public.gen.ts',
    'export {}\n'
  )
  return root
}

describe('scaffold duplicate checks', () => {
  test('a clean app passes', async () => {
    const root = await project()
    await write(root, 'packages/functions/src/todo.function.ts', 'export {}\n')
    assert.deepEqual(await runScaffoldDuplicateChecks(root), [])
  })

  test('errors on a stale scaffold copy outside the scaffold dir', async () => {
    const root = await project()
    await write(
      root,
      'packages/functions/src/pikku/console/console.gen.ts',
      CONSOLE_WIRING
    )

    const findings = await runScaffoldDuplicateChecks(root)
    const stray = findings.filter(
      (f) => f.id === 'scaffold-output-outside-scaffold-dir'
    )
    assert.equal(stray.length, 1)
    assert.equal(stray[0]!.severity, 'error')
    assert.match(stray[0]!.message, /src\/pikku\/console\/console\.gen\.ts/)
    assert.match(stray[0]!.message, /src\/scaffold\/console\/console\.gen\.ts/)
    assert.match(stray[0]!.fixHint, /pikku all/)
  })

  test('errors on a stale copy of a feature that is no longer enabled', async () => {
    const root = await project({ virtualUser: false })
    await write(
      root,
      'packages/functions/src/old/virtual-user/virtual-user.gen.ts',
      'export {}\n'
    )
    const findings = await runScaffoldDuplicateChecks(root)
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.id, 'scaffold-output-outside-scaffold-dir')
  })

  test('errors on a hand-written wireAddon the scaffold already wires', async () => {
    const root = await project()
    await write(
      root,
      'packages/functions/src/wiring.ts',
      `import { wireAddon } from '#pikku/addon'\nwireAddon({ name: 'console', package: '@pikku/addon-console' })\n`
    )

    const findings = await runScaffoldDuplicateChecks(root)
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.id, 'scaffold-addon-declared-twice')
    assert.equal(findings[0]!.severity, 'error')
    assert.match(findings[0]!.message, /wiring\.ts/)
    assert.match(findings[0]!.message, /scaffold\/console\/console\.gen\.ts/)
  })

  test('errors on a hand-written wireAddon even before the scaffold is generated', async () => {
    const root = await project()
    await mkdir(join(root, 'packages/functions/src/scaffold'), {
      recursive: true,
    })
    await write(
      root,
      'packages/functions/src/scaffold/console/console.gen.ts',
      'export {}\n'
    )
    await write(
      root,
      'packages/functions/src/wiring.ts',
      `wireAddon({ name: 'console', package: '@pikku/addon-console' })\n`
    )
    const findings = await runScaffoldDuplicateChecks(root)
    assert.deepEqual(
      findings.map((f) => f.id),
      ['scaffold-addon-declared-twice']
    )
  })

  test('a role grant of the addon scope is not a duplicate', async () => {
    const root = await project()
    await write(
      root,
      'packages/functions/src/roles.ts',
      `import { defineRoles } from '#pikku/roles'\n` +
        `defineRoles({ operator: { grants: ['pikku:console'] } })\n` +
        `// wireAddon({ name: 'console', package: '@pikku/addon-console' })\n`
    )
    assert.deepEqual(await runScaffoldDuplicateChecks(root), [])
  })

  test('a different addon wired by hand is not a duplicate', async () => {
    const root = await project()
    await write(
      root,
      'packages/functions/src/wiring.ts',
      `wireAddon({ name: 'admin', package: '@pikku/addon-admin' })\n`
    )
    assert.deepEqual(await runScaffoldDuplicateChecks(root), [])
  })

  test('honours an explicit scaffold path override', async () => {
    const root = await project({
      console: { path: 'packages/functions/src/custom/console.gen.ts' },
    })
    await write(
      root,
      'packages/functions/src/custom/console.gen.ts',
      CONSOLE_WIRING
    )
    // the default location is now the stray copy
    const findings = await runScaffoldDuplicateChecks(root)
    assert.deepEqual(
      findings.map((f) => f.id),
      ['scaffold-output-outside-scaffold-dir']
    )
    assert.match(findings[0]!.message, /scaffold\/console\/console\.gen\.ts/)
  })

  test('errors by default when the scaffold dir is not <srcDirectory>/scaffold', async () => {
    const root = await project({ pikkuDir: 'packages/functions/src/pikku' })
    const findings = await runScaffoldDuplicateChecks(root)
    const f = findings.find((x) => x.id === 'scaffold-dir-noncanonical')
    assert.equal(f?.severity, 'error')
    assert.match(f!.message, /src\/pikku/)
    assert.match(f!.message, /src\/scaffold/)
    assert.match(f!.fixHint, /pikku all/)
  })

  test('an explicit pikkuDir equal to the default passes', async () => {
    const root = await project({ pikkuDir: 'packages/functions/src/scaffold' })
    assert.deepEqual(await runScaffoldDuplicateChecks(root), [])
  })

  test("validate.rules 'warn' downgrades and 'off' suppresses", async () => {
    const root = await project({ pikkuDir: 'packages/functions/src/pikku' })
    const setRules = async (rules: Record<string, string>) => {
      const cfg = JSON.parse(
        await readFile(join(root, 'pikku.config.json'), 'utf8')
      )
      await write(
        root,
        'pikku.config.json',
        JSON.stringify({ ...cfg, validate: { rules } })
      )
    }
    const noncanonical = async () =>
      (await runScaffoldDuplicateChecks(root)).filter(
        (f) => f.id === 'scaffold-dir-noncanonical'
      )
    await setRules({ 'scaffold-dir-noncanonical': 'warn' })
    assert.equal((await noncanonical())[0]!.severity, 'warn')
    await setRules({ 'scaffold-dir-noncanonical': 'off' })
    assert.deepEqual(await noncanonical(), [])
  })

  test('validate.rules applies to the other scaffold-duplicates rules', async () => {
    const root = await project()
    await write(
      root,
      'packages/functions/src/pikku/console/console.gen.ts',
      CONSOLE_WIRING
    )
    await write(
      root,
      'pikku.config.json',
      JSON.stringify({
        srcDirectories: ['packages/functions/src'],
        scaffold: {
          pikkuDir: 'packages/functions/src/scaffold',
          console: true,
        },
        validate: { rules: { 'scaffold-output-outside-scaffold-dir': 'off' } },
      })
    )
    assert.deepEqual(await runScaffoldDuplicateChecks(root), [])
  })

  test('ignores generated output under .pikku and node_modules', async () => {
    const root = await project()
    await write(
      root,
      'packages/functions/src/.pikku/console/console.gen.ts',
      'x'
    )
    await write(
      root,
      'packages/functions/src/node_modules/x/console/console.gen.ts',
      'x'
    )
    assert.deepEqual(await runScaffoldDuplicateChecks(root), [])
  })
})

describe('SCAFFOLD_OUTPUTS', () => {
  test('matches the paths pikku-cli-config derives under the scaffold dir', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-scaffold-table-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await write(
      root,
      'pikku.config.json',
      JSON.stringify({
        rootDir: '.',
        srcDirectories: ['src'],
        packageMappings: {},
        outDir: '.pikku',
        tsconfig: 'tsconfig.json',
        filters: {},
        scaffold: Object.fromEntries(
          [...new Set(SCAFFOLD_OUTPUTS.map((o) => o.feature))]
            .filter((f) => f !== 'auth')
            .map((f) => [f, true])
        ),
      })
    )
    const config = (await getPikkuCLIConfig(
      { error() {}, warn() {}, info() {} } as never,
      join(root, 'pikku.config.json'),
      []
    )) as unknown as Record<string, string>

    for (const o of SCAFFOLD_OUTPUTS.filter((o) => o.field)) {
      assert.equal(
        config[o.field],
        join(root, 'src', 'scaffold', o.dir, o.file),
        o.field
      )
    }
  })
})
