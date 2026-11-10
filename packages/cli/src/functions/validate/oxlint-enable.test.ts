import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import {
  fixLintScript,
  installArgs,
  lineDiff,
  mergeOxlintConfig,
  newOxlintConfig,
  runEnableOxlint,
  type InstallFn,
} from './oxlint-enable.js'
import {
  OXLINT_STRICT_RULES,
  strictOverrides,
  type OxlintExec,
} from './oxlint-checks.js'

const write = async (root: string, rel: string, contents: string) => {
  const path = join(root, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

const makeApp = async (
  opts: {
    lockfile?: string
    scripts?: Record<string, string>
    devDependencies?: Record<string, string>
    config?: [string, string]
  } = {}
) => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-enable-oxlint-'))
  await write(
    root,
    'pikku.config.json',
    JSON.stringify({ srcDirectories: ['src'] })
  )
  await write(
    root,
    'package.json',
    JSON.stringify({
      name: 'app',
      scripts: opts.scripts ?? {},
      devDependencies: opts.devDependencies ?? {},
    })
  )
  if (opts.lockfile !== '') await write(root, opts.lockfile ?? 'bun.lock', '')
  await write(root, 'src/index.ts', 'export {}\n')
  if (opts.config) await write(root, opts.config[0], opts.config[1])
  return root
}

/** Pretend the install ran: what a real package manager leaves behind. */
const fakeInstall = (
  root: string
): { install: InstallFn; calls: Array<{ cmd: string; args: string[] }> } => {
  const calls: Array<{ cmd: string; args: string[] }> = []
  return {
    calls,
    install: async (cmd, args) => {
      calls.push({ cmd, args })
      const pkg = await json(root, 'package.json')
      for (const a of args.filter((x) => x.startsWith('oxlint'))) {
        pkg.devDependencies[a.replace(/@\^.*$/, '')] = a.replace(/^.*@/, '')
      }
      await write(root, 'package.json', JSON.stringify(pkg, null, 2) + '\n')
      await write(root, 'node_modules/.bin/oxlint', '')
      await write(root, 'node_modules/oxlint-tsgolint/package.json', '{}')
      return 0
    },
  }
}

/** `oxlint --print-config` answered from the config file; a run finds nothing. */
const execFromFile =
  (root: string): OxlintExec =>
  async (_f, args) => {
    if (args[0] === '--print-config') {
      const cfg = JSON.parse(
        await readFile(join(root, '.oxlintrc.json'), 'utf8')
      )
      return {
        code: 0,
        timedOut: false,
        stderr: '',
        stdout: JSON.stringify({
          plugins: cfg.plugins ?? ['typescript', 'unicorn', 'oxc'],
          rules: cfg.rules,
          options: cfg.options,
          overrides: cfg.overrides ?? [],
        }),
      }
    }
    return {
      code: 0,
      timedOut: false,
      stderr: '',
      stdout: JSON.stringify({ diagnostics: [], number_of_files: 3 }),
    }
  }

const cleanup = (root: string) => rm(root, { recursive: true, force: true })
const json = async (root: string, rel: string) =>
  JSON.parse(await readFile(join(root, rel), 'utf8'))

const NO_POLICIES = {
  enforceContentService: 'off',
  enforceVariablesService: 'off',
  enforceSupervisor: 'off',
  enforceCliCommands: 'off',
} as const

describe('mergeOxlintConfig', () => {
  test('keeps the user rules, plugins and overrides', () => {
    const before = JSON.stringify({
      plugins: ['react'],
      rules: { 'no-console': 'warn', 'typescript/no-misused-promises': 'warn' },
      overrides: [{ files: ['*.test.ts'], rules: { 'no-console': 'off' } }],
      ignorePatterns: ['dist'],
    })
    const merged = mergeOxlintConfig(before, NO_POLICIES)
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    const out = JSON.parse(merged.text)
    assert.deepEqual(out.plugins, ['react', 'typescript'])
    assert.equal(out.rules['no-console'], 'warn')
    assert.equal(out.rules['typescript/no-misused-promises'], 'error')
    assert.equal(out.rules['typescript/no-floating-promises'], 'error')
    assert.equal(out.options.typeAware, true)
    assert.deepEqual(out.overrides, [
      { files: ['*.test.ts'], rules: { 'no-console': 'off' } },
    ])
    assert.deepEqual(out.ignorePatterns, ['dist'])
  })

  test('does not invent a plugins list when the defaults apply', () => {
    const merged = mergeOxlintConfig('{}', NO_POLICIES)
    assert.equal(merged.kind, 'merged')
    if (merged.kind === 'merged') {
      assert.equal('plugins' in JSON.parse(merged.text), false)
    }
  })

  test('adds the policy rules and an exemption for tests and bootstrap files', () => {
    const merged = mergeOxlintConfig('{}')
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    const out = JSON.parse(merged.text)
    assert.equal('node/no-process-env' in out.rules, false)
    assert.equal(out.rules['typescript/no-require-imports'], 'error')
    assert.deepEqual(
      out.rules['no-restricted-imports'][1].paths.map(
        (p: { name: string }) => p.name
      ),
      [
        'fs',
        'node:fs',
        'fs/promises',
        'node:fs/promises',
        'fs-extra',
        'graceful-fs',
        'child_process',
        'node:child_process',
        'execa',
        'cross-spawn',
        'shelljs',
        'commander',
        'yargs',
        'minimist',
        'node:util',
        'util',
      ]
    )
    assert.deepEqual(
      out.rules['no-restricted-properties']
        .slice(1)
        .map(
          (p: { object: string; property: string }) =>
            `${p.object}.${p.property}`
        ),
      [
        'process.env',
        'globalThis.process',
        'global.process',
        'self.process',
        'Bun.spawn',
        'Bun.spawnSync',
        'Bun.$',
        'globalThis.Bun',
        'global.Bun',
        'self.Bun',
        'process.argv',
        'Bun.argv',
        'Deno.args',
        'globalThis.Deno',
        'global.Deno',
        'self.Deno',
      ]
    )
    assert.deepEqual(out.overrides, [
      {
        files: [
          '**/start.ts',
          '**/server.ts',
          '**/bin/**',
          '**/scripts/**',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.spec.ts',
          '**/*.spec.tsx',
        ],
        rules: {
          'no-restricted-imports': 'off',
          'typescript/no-require-imports': 'off',
          'no-restricted-properties': 'off',
        },
      },
    ])
    const again = mergeOxlintConfig(merged.text)
    assert.equal(again.kind === 'merged' && again.changed, false)
  })

  test('a key set to off adds none of its rules and no exemption for them', () => {
    const merged = mergeOxlintConfig('{}', {
      ...NO_POLICIES,
      enforceCliCommands: 'error',
    })
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    const out = JSON.parse(merged.text)
    assert.deepEqual(
      out.rules['no-restricted-imports'][1].paths.map(
        (p: { name: string }) => p.name
      ),
      ['commander', 'yargs', 'minimist', 'node:util', 'util']
    )
    assert.equal('typescript/no-require-imports' in out.rules, false)
    assert.deepEqual(out.overrides[0].rules, {
      'no-restricted-imports': 'off',
      'no-restricted-properties': 'off',
    })
  })

  test('upgrading: node/no-process-env is replaced, the new rules and exemption are added, user entries stay', () => {
    const merged = mergeOxlintConfig(
      JSON.stringify({
        plugins: ['typescript', 'node'],
        rules: {
          'node/no-process-env': 'error',
          'no-restricted-properties': [
            'error',
            { object: 'window', property: 'name' },
          ],
          'no-restricted-imports': [
            'error',
            {
              paths: ['fs', 'node:fs', 'fs/promises', 'node:fs/promises'].map(
                (name) => ({ name })
              ),
            },
          ],
        },
        overrides: [
          {
            files: ['**/*.test.ts'],
            rules: { 'node/no-process-env': 'off' },
          },
        ],
      })
    )
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    const out = JSON.parse(merged.text)
    assert.equal('node/no-process-env' in out.rules, false)
    assert.deepEqual(out.rules['no-restricted-properties'][1], {
      object: 'window',
      property: 'name',
    })
    assert.equal(out.rules['no-restricted-properties'].length, 1 + 1 + 16)
    assert.ok(
      out.rules['no-restricted-imports'][1].paths.some(
        (p: { name: string }) => p.name === 'execa'
      )
    )
    assert.equal(out.overrides.length, 2)
    assert.equal(out.overrides[1].files.includes('**/start.ts'), true)
    const again = mergeOxlintConfig(merged.text)
    assert.equal(again.kind === 'merged' && again.changed, false)
  })

  test('a user node:util path restricted for other names gets parseArgs added as its own entry', () => {
    const merged = mergeOxlintConfig(
      JSON.stringify({
        rules: {
          'no-restricted-imports': [
            'error',
            { paths: [{ name: 'node:util', importNames: ['promisify'] }] },
          ],
        },
      }),
      { ...NO_POLICIES, enforceCliCommands: 'error' }
    )
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    const paths = JSON.parse(merged.text).rules['no-restricted-imports'][1]
      .paths as Array<{ name: string; importNames?: string[] }>
    assert.deepEqual(
      paths.filter((p) => p.name === 'node:util').map((p) => p.importNames),
      [['promisify'], ['parseArgs']]
    )
  })

  test('fills in the fs modules an existing no-restricted-imports leaves out', () => {
    const merged = mergeOxlintConfig(
      JSON.stringify({
        rules: {
          'no-restricted-imports': [
            'error',
            { paths: ['lodash', { name: 'fs', message: 'mine' }] },
          ],
        },
      }),
      { ...NO_POLICIES, enforceContentService: 'error' }
    )
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    const paths = JSON.parse(merged.text).rules['no-restricted-imports'][1]
      .paths as Array<string | { name: string; message?: string }>
    assert.deepEqual(
      paths.map((p) => (typeof p === 'string' ? p : p.name)),
      [
        'lodash',
        'fs',
        'node:fs',
        'fs/promises',
        'node:fs/promises',
        'fs-extra',
        'graceful-fs',
      ]
    )
    assert.equal((paths[1] as { message: string }).message, 'mine')
  })

  test('keeps rule options but raises the level and drops checksConditionals:false', () => {
    const merged = mergeOxlintConfig(
      JSON.stringify({
        rules: {
          'typescript/no-misused-promises': [
            'warn',
            { checksConditionals: false, checksVoidReturn: false },
          ],
        },
      })
    )
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    assert.deepEqual(
      JSON.parse(merged.text).rules['typescript/no-misused-promises'],
      ['error', { checksVoidReturn: false }]
    )
  })

  test('raises no-empty to error and drops allowEmptyCatch:true', () => {
    const merged = mergeOxlintConfig(
      JSON.stringify({
        rules: { 'no-empty': ['warn', { allowEmptyCatch: true }] },
      })
    )
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    assert.deepEqual(JSON.parse(merged.text).rules['no-empty'], ['error', {}])
  })

  test('a second run changes nothing, byte for byte', () => {
    const first = mergeOxlintConfig('{"rules":{"no-console":"warn"}}')
    assert.equal(first.kind, 'merged')
    if (first.kind !== 'merged') return
    assert.equal(first.changed, true)
    const second = mergeOxlintConfig(first.text)
    assert.equal(second.kind, 'merged')
    if (second.kind !== 'merged') return
    assert.equal(second.changed, false)
    assert.equal(second.text, first.text)
  })

  test('an override that lowers a rule is reported, not rewritten', () => {
    const merged = mergeOxlintConfig(
      JSON.stringify({
        overrides: [
          {
            files: ['src/legacy/**'],
            rules: { 'typescript/no-floating-promises': 'off' },
          },
        ],
      })
    )
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    assert.match(merged.warnings[0]!, /no-floating-promises/)
    assert.equal(
      JSON.parse(merged.text).overrides[0].rules[
        'typescript/no-floating-promises'
      ],
      'off'
    )
  })

  test('jsonc-style text is unsafe, never rewritten', () => {
    const merged = mergeOxlintConfig('{\n  // mine\n  "rules": {}\n}')
    assert.equal(merged.kind, 'unsafe')
  })
})

describe('helpers', () => {
  test('lint script: add, fix, leave alone', () => {
    assert.equal(fixLintScript(undefined, true), 'oxlint --type-aware')
    assert.equal(fixLintScript('oxlint src', false), 'oxlint --type-aware src')
    assert.equal(fixLintScript('oxlint src', true), undefined)
    assert.equal(fixLintScript('oxlint --type-aware', false), undefined)
    assert.equal(fixLintScript('eslint .', false), undefined)
  })

  test('install args per package manager', () => {
    const names = ['oxlint@^1']
    assert.deepEqual(installArgs('bun', '/x', names), [
      'add',
      '-d',
      'oxlint@^1',
    ])
    assert.deepEqual(installArgs('yarn', '/x', names), [
      'add',
      '-D',
      'oxlint@^1',
    ])
    assert.deepEqual(installArgs('npm', '/x', names), [
      'install',
      '-D',
      'oxlint@^1',
    ])
    assert.deepEqual(installArgs('pnpm', '/x', []), ['install'])
  })

  test('lineDiff marks added and removed lines', () => {
    assert.equal(lineDiff('a\nb', 'a\nc'), '- b\n+ c')
  })
})

describe('runEnableOxlint', () => {
  test('--dry-run writes and installs nothing, and shows the plan', async () => {
    const root = await makeApp({ lockfile: 'pnpm-lock.yaml' })
    try {
      const { install, calls } = fakeInstall(root)
      const before = await readFile(join(root, 'package.json'), 'utf8')
      const out = await runEnableOxlint(root, { dryRun: true, install })
      assert.equal(calls.length, 0)
      assert.equal(out.packageManager, 'pnpm')
      assert.equal(await readFile(join(root, 'package.json'), 'utf8'), before)
      await assert.rejects(readFile(join(root, '.oxlintrc.json')))
      assert.ok(out.actions.some((a) => a.includes('create .oxlintrc.json')))
      assert.ok(out.diffs.some((d) => d.file === '.oxlintrc.json'))
      assert.ok(
        out.diffs
          .find((d) => d.file === 'package.json')!
          .diff.includes('oxlint --type-aware')
      )
    } finally {
      await cleanup(root)
    }
  })

  test('sets a bare app up, then a second run is a no-op', async () => {
    const root = await makeApp({ lockfile: 'yarn.lock' })
    try {
      const { install, calls } = fakeInstall(root)
      const exec = execFromFile(root)
      const first = await runEnableOxlint(root, { install, exec })
      assert.equal(first.ok, true, JSON.stringify(first))
      assert.equal(calls.length, 1)
      assert.equal(calls[0]!.cmd, 'yarn')
      assert.deepEqual(calls[0]!.args.slice(0, 2), ['add', '-D'])
      assert.ok(calls[0]!.args.some((a) => a.startsWith('oxlint@')))
      assert.ok(calls[0]!.args.some((a) => a.startsWith('oxlint-tsgolint@')))
      assert.equal(
        (await json(root, 'package.json')).scripts.lint,
        'oxlint --type-aware'
      )
      const config = await json(root, '.oxlintrc.json')
      assert.equal(config.rules['typescript/no-misused-promises'], 'error')
      assert.equal(first.lintFindings, 0)

      const pkgText = await readFile(join(root, 'package.json'), 'utf8')
      const cfgText = await readFile(join(root, '.oxlintrc.json'), 'utf8')
      const second = await runEnableOxlint(root, { install, exec })
      assert.equal(second.ok, true)
      assert.equal(calls.length, 1, 'no second install')
      assert.equal(await readFile(join(root, 'package.json'), 'utf8'), pkgText)
      assert.equal(
        await readFile(join(root, '.oxlintrc.json'), 'utf8'),
        cfgText
      )
    } finally {
      await cleanup(root)
    }
  })

  test('merges into an existing config without dropping rules', async () => {
    const root = await makeApp({
      config: [
        '.oxlintrc.json',
        JSON.stringify({
          rules: { 'no-console': 'warn' },
          ignorePatterns: ['dist'],
        }),
      ],
      scripts: { lint: 'oxlint src' },
    })
    try {
      const { install } = fakeInstall(root)
      const out = await runEnableOxlint(root, {
        install,
        exec: execFromFile(root),
      })
      assert.equal(out.ok, true, JSON.stringify(out))
      const config = await json(root, '.oxlintrc.json')
      assert.equal(config.rules['no-console'], 'warn')
      assert.deepEqual(config.ignorePatterns, ['dist'])
      // typeAware is in the config now, so the user's script stays as written
      assert.equal(
        (await json(root, 'package.json')).scripts.lint,
        'oxlint src'
      )
    } finally {
      await cleanup(root)
    }
  })

  test('an .oxlintrc.jsonc is not edited: snippet, non-zero, script fixed', async () => {
    const original = '{\n  // mine\n  "rules": {}\n}\n'
    const root = await makeApp({
      config: ['.oxlintrc.jsonc', original],
      scripts: { lint: 'oxlint src' },
    })
    try {
      const { install } = fakeInstall(root)
      const out = await runEnableOxlint(root, {
        install,
        exec: async () => ({
          code: 1,
          stdout: '',
          stderr: 'unused',
          timedOut: false,
        }),
      })
      assert.equal(out.ok, false)
      assert.match(out.manual[0]!, /typescript\/no-misused-promises/)
      assert.match(out.manual[0]!, /\.oxlintrc\.jsonc/)
      assert.equal(
        await readFile(join(root, '.oxlintrc.jsonc'), 'utf8'),
        original
      )
      assert.equal(
        (await json(root, 'package.json')).scripts.lint,
        'oxlint --type-aware src'
      )
    } finally {
      await cleanup(root)
    }
  })

  test('installs only what is missing; declared-but-absent gets a plain install', async () => {
    const root = await makeApp({
      devDependencies: { oxlint: '^1.86.0', 'oxlint-tsgolint': '^7.0.2003' },
      config: ['.oxlintrc.json', '{}'],
    })
    try {
      const { install, calls } = fakeInstall(root)
      await runEnableOxlint(root, { install, exec: execFromFile(root) })
      assert.deepEqual(calls[0]!.args, ['install'])
    } finally {
      await cleanup(root)
    }
  })

  test('a failed install is reported and exits non-zero', async () => {
    const root = await makeApp()
    try {
      const out = await runEnableOxlint(root, {
        install: async () => 1,
        exec: execFromFile(root),
      })
      assert.equal(out.ok, false)
      assert.match(out.manual[0]!, /install failed/)
    } finally {
      await cleanup(root)
    }
  })
})

describe('strict preset', () => {
  test('a new config carries every preset rule, the import plugin and both overrides', () => {
    const c = newOxlintConfig(undefined, true) as {
      plugins: string[]
      rules: Record<string, string>
      overrides: Array<{ files: string[]; rules: Record<string, string> }>
    }
    assert.deepEqual(c.plugins, ['typescript', 'unicorn', 'oxc', 'import'])
    for (const [rule, level] of Object.entries(OXLINT_STRICT_RULES)) {
      assert.equal(c.rules[rule], level, rule)
    }
    assert.equal(c.overrides.length, 1 + strictOverrides().length)
    assert.ok(
      c.overrides.some(
        (o) =>
          o.files.includes('**/*.workflow.ts') &&
          o.rules['no-await-in-loop'] === 'off'
      )
    )
    assert.ok(
      c.overrides.some(
        (o) =>
          o.files.includes('**/*.assert.ts') &&
          o.rules['typescript/no-floating-promises'] === 'off'
      )
    )
  })

  test('a config without --strict is unchanged by the preset', () => {
    const c = newOxlintConfig() as {
      plugins: string[]
      rules: Record<string, string>
    }
    assert.ok(!c.plugins.includes('import'))
    assert.equal(c.rules['no-await-in-loop'], undefined)
  })

  test('merge keeps stricter and user-tuned entries, raises weaker ones, adds the rest', () => {
    const before = JSON.stringify({
      rules: {
        'no-console': 'error',
        'no-await-in-loop': 'off',
        'typescript/no-explicit-any': ['warn', { ignoreRestArgs: true }],
        'no-shadow': 'off',
        'require-await': 'error',
      },
    })
    const merged = mergeOxlintConfig(before, NO_POLICIES, true)
    assert.equal(merged.kind, 'merged')
    if (merged.kind !== 'merged') return
    const out = JSON.parse(merged.text)
    assert.equal(out.rules['no-console'], 'error')
    assert.equal(out.rules['no-await-in-loop'], 'warn')
    assert.deepEqual(out.rules['typescript/no-explicit-any'], [
      'warn',
      { ignoreRestArgs: true },
    ])
    assert.equal(out.rules['no-shadow'], 'warn')
    assert.equal(out.rules['eqeqeq'], 'error')
    assert.equal(
      out.rules['require-await'],
      'error',
      'an off entry never replaces the user rule'
    )
    assert.equal(out.rules['import/no-default-export'], 'off')
    assert.deepEqual(out.plugins, ['typescript', 'unicorn', 'oxc', 'import'])
    assert.equal(out.overrides.length, 2)
  })

  test('merging twice is a no-op, and an existing plugins list gains only what is missing', () => {
    const first = mergeOxlintConfig(
      JSON.stringify({ plugins: ['react'] }),
      NO_POLICIES,
      true
    )
    assert.equal(first.kind, 'merged')
    if (first.kind !== 'merged') return
    assert.deepEqual(JSON.parse(first.text).plugins, [
      'react',
      'typescript',
      'unicorn',
      'import',
    ])
    const second = mergeOxlintConfig(first.text, NO_POLICIES, true)
    assert.equal(second.kind === 'merged' && second.changed, false)
  })

  test('without the flag the preset is not merged', () => {
    const merged = mergeOxlintConfig('{}', NO_POLICIES)
    assert.equal(
      merged.kind === 'merged' && !merged.text.includes('no-await-in-loop'),
      true
    )
  })

  test('the test-file override does not draw a warning about a lowered required rule', () => {
    const merged = mergeOxlintConfig('{}', NO_POLICIES, true)
    assert.equal(merged.kind === 'merged' && merged.warnings.length, 0)
  })

  test('runEnableOxlint --strict writes the preset and lint.strict, and validate is then clean', async () => {
    const root = await makeApp({ config: ['.oxlintrc.json', '{}'] })
    try {
      const { install } = fakeInstall(root)
      const out = await runEnableOxlint(root, {
        strict: true,
        install,
        exec: execFromFile(root),
      })
      assert.deepEqual(out.remaining, [])
      assert.equal(out.ok, true)
      assert.deepEqual((await json(root, 'pikku.config.json')).lint, {
        strict: true,
      })
      assert.equal(
        (await json(root, '.oxlintrc.json')).rules['import/no-cycle'],
        'error'
      )
    } finally {
      await cleanup(root)
    }
  })

  test('--dry-run --strict shows the pikku.config.json diff and writes nothing', async () => {
    const root = await makeApp({ config: ['.oxlintrc.json', '{}'] })
    try {
      const out = await runEnableOxlint(root, { strict: true, dryRun: true })
      assert.ok(
        out.diffs.some(
          (d) =>
            d.file === 'pikku.config.json' && d.diff.includes('"strict": true')
        )
      )
      assert.equal((await json(root, 'pikku.config.json')).lint, undefined)
    } finally {
      await cleanup(root)
    }
  })
})
