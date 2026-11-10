import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { newOxlintConfig } from './oxlint-enable.js'
import {
  OXLINT_MAX_FINDINGS,
  activePolicyRules,
  missingPolicyEntries,
  policyLevels,
  oxlintRunArgs,
  runOxlintRun,
  runOxlintSetupChecks,
  type ExecResult,
  type OxlintExec,
} from './oxlint-checks.js'

const write = async (root: string, rel: string, contents: string) => {
  const path = join(root, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

type AppOptions = {
  installed?: boolean
  tsgolint?: boolean
  declared?: string[]
  config?: boolean
  scripts?: Record<string, string>
  pikkuConfig?: Record<string, unknown>
  lockfile?: string
}

/** An app project: pikku.config.json, a root package.json, optionally oxlint. */
const makeApp = async (opts: AppOptions = {}) => {
  const {
    installed = true,
    tsgolint = true,
    declared = ['oxlint', 'oxlint-tsgolint'],
    config = true,
    scripts = {},
    pikkuConfig = {},
    lockfile = 'bun.lock',
  } = opts
  const root = await mkdtemp(join(tmpdir(), 'pikku-oxlint-'))
  await write(
    root,
    'pikku.config.json',
    JSON.stringify({
      srcDirectories: ['packages/functions/src'],
      ...pikkuConfig,
    })
  )
  await write(
    root,
    'package.json',
    JSON.stringify({
      name: 'app',
      scripts,
      devDependencies: Object.fromEntries(declared.map((d) => [d, '*'])),
    })
  )
  await write(root, lockfile, '')
  await write(root, 'packages/functions/src/index.ts', 'export {}\n')
  if (installed) await write(root, 'node_modules/.bin/oxlint', '')
  if (tsgolint)
    await write(root, 'node_modules/oxlint-tsgolint/package.json', '{}')
  if (config) await write(root, '.oxlintrc.json', '{}')
  return root
}

/** What `--print-config` prints for a rule: `deny`, with the options one level down. */
const printed = (value: unknown): unknown =>
  Array.isArray(value) ? ['deny', value.slice(1)] : 'deny'

const RESOLVED_POLICY_RULES: Record<string, unknown> = Object.fromEntries(
  Object.entries(activePolicyRules(policyLevels(undefined))).map(
    ([rule, value]) => [rule, printed(value)]
  )
)

/**
 * The `--print-config` of a compliant app. `rules` and `plugins` given in
 * `over` replace the required ones while the policy rules stay, so a test about one rule set is not also failing the other.
 */
const resolvedConfig = (over: Record<string, unknown> = {}) => {
  const { rules, plugins, ...rest } = over as {
    rules?: Record<string, unknown>
    plugins?: string[]
  }
  return {
    plugins: plugins ?? ['unicorn', 'typescript', 'oxc'],
    rules: {
      ...RESOLVED_POLICY_RULES,
      ...(rules ?? {
        'typescript/no-misused-promises': 'deny',
        'typescript/no-floating-promises': 'deny',
        'no-empty': 'deny',
      }),
    },
    options: { typeAware: true },
    overrides: [],
    ...rest,
  }
}

const reply = (
  stdout: unknown,
  extra: Partial<ExecResult> = {}
): ExecResult => ({
  code: 0,
  stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
  stderr: '',
  timedOut: false,
  ...extra,
})

type Call = { file: string; args: string[]; cwd: string; timeoutMs: number }
const fakeExec = (
  handler: (call: Call) => ExecResult
): { exec: OxlintExec; calls: Call[] } => {
  const calls: Call[] = []
  return {
    calls,
    exec: async (file, args, opts) => {
      const call = { file, args, ...opts }
      calls.push(call)
      return handler(call)
    },
  }
}

const cleanup = (root: string) => rm(root, { recursive: true, force: true })
const ids = (findings: Array<{ id: string }>) => findings.map((f) => f.id)

describe('oxlint setup checks', () => {
  test('a configured, type-aware app is clean', async () => {
    const root = await makeApp()
    try {
      const { exec, calls } = fakeExec(() => reply(resolvedConfig()))
      assert.deepEqual(await runOxlintSetupChecks(root, exec), [])
      // The app's own oxlint, run from the directory holding the config.
      assert.equal(calls[0]!.file, join(root, 'node_modules/.bin/oxlint'))
      assert.deepEqual(calls[0]!.args, ['--print-config'])
      assert.equal(calls[0]!.cwd, root)
    } finally {
      await cleanup(root)
    }
  })

  test('nothing installed or declared reports both packages', async () => {
    const root = await makeApp({
      installed: false,
      tsgolint: false,
      declared: [],
      config: false,
    })
    try {
      const { exec } = fakeExec(() => reply(resolvedConfig()))
      const findings = await runOxlintSetupChecks(root, exec)
      const f = findings.find((x) => x.id === 'oxlint-not-installed')!
      assert.equal(f.severity, 'error')
      assert.match(f.message, /oxlint is not in dependencies/)
      assert.match(f.message, /oxlint-tsgolint is not in dependencies/)
      assert.match(f.fixHint, /bun add -d oxlint oxlint-tsgolint/)
      assert.equal(f.path, join(root, 'package.json'))
      assert.ok(ids(findings).includes('oxlint-config-missing'))
    } finally {
      await cleanup(root)
    }
  })

  test('declared but not installed says to run the install', async () => {
    const root = await makeApp({ installed: false, tsgolint: false })
    try {
      const { exec } = fakeExec(() => reply(resolvedConfig()))
      const findings = await runOxlintSetupChecks(root, exec)
      const f = findings.find((x) => x.id === 'oxlint-not-installed')!
      assert.match(f.message, /oxlint is declared but not installed/)
      assert.match(f.message, /oxlint-tsgolint is declared but not installed/)
    } finally {
      await cleanup(root)
    }
  })

  test('only oxlint-tsgolint missing names only that package', async () => {
    const root = await makeApp({
      tsgolint: false,
      declared: ['oxlint'],
      lockfile: 'yarn.lock',
    })
    try {
      const { exec } = fakeExec(() => reply(resolvedConfig()))
      const findings = await runOxlintSetupChecks(root, exec)
      const f = findings.find((x) => x.id === 'oxlint-not-installed')!
      assert.doesNotMatch(f.message, /[(;] oxlint is /)
      assert.match(f.fixHint, /yarn add -D oxlint-tsgolint$/m)
    } finally {
      await cleanup(root)
    }
  })

  test('no config file reports oxlint-config-missing with the snippet', async () => {
    const root = await makeApp({ config: false })
    try {
      const { exec, calls } = fakeExec(() => reply(resolvedConfig()))
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-config-missing'])
      assert.match(
        findings[0]!.fixHint,
        /"typescript\/no-misused-promises": "error"/
      )
      assert.match(findings[0]!.fixHint, /"typeAware": true/)
      assert.equal(calls.length, 0)
    } finally {
      await cleanup(root)
    }
  })

  test('a rule at warn, or absent, is oxlint-rule-missing', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedConfig({
            rules: { 'typescript/no-floating-promises': 'warn' },
          })
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-rule-missing'])
      const f = findings[0]!
      assert.match(f.message, /no-floating-promises: set to "warn"/)
      assert.match(f.message, /no-misused-promises: not enabled/)
      assert.equal(f.path, join(root, '.oxlintrc.json'))
    } finally {
      await cleanup(root)
    }
  })

  test('the typescript plugin being off makes the rules missing', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(resolvedConfig({ plugins: ['react'] }))
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-rule-missing'])
      assert.match(
        findings[0]!.message,
        /"typescript" plugin is not in "plugins"/
      )
    } finally {
      await cleanup(root)
    }
  })

  test('an override that weakens a rule is reported', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedConfig({
            overrides: [
              {
                files: ['**/*.test.ts'],
                rules: { 'typescript/no-floating-promises': 'allow' },
              },
            ],
          })
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-rule-missing'])
      assert.match(
        findings[0]!.message,
        /override for \["\*\*\/\*\.test\.ts"\]/
      )
    } finally {
      await cleanup(root)
    }
  })

  test('checksConditionals: false defeats no-misused-promises', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedConfig({
            rules: {
              'typescript/no-misused-promises': [
                'deny',
                { checksConditionals: false },
              ],
              'typescript/no-floating-promises': 'deny',
            },
          })
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-rule-missing'])
      assert.match(findings[0]!.message, /checksConditionals/)
    } finally {
      await cleanup(root)
    }
  })

  test('options nested the way --print-config prints them are still read', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedConfig({
            rules: {
              'typescript/no-misused-promises': [
                'deny',
                [{ checksConditionals: false }],
              ],
              'typescript/no-floating-promises': 'deny',
              'no-empty': 'deny',
            },
          })
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-rule-missing'])
      assert.match(findings[0]!.message, /checksConditionals/)
    } finally {
      await cleanup(root)
    }
  })

  test('allowEmptyCatch: true defeats no-empty', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedConfig({
            rules: {
              'typescript/no-misused-promises': 'deny',
              'typescript/no-floating-promises': 'deny',
              'no-empty': ['deny', [{ allowEmptyCatch: true }]],
            },
          })
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-rule-missing'])
      assert.match(
        findings[0]!.message,
        /no-empty: "allowEmptyCatch" is true, so an empty `catch \{\}` is not reported/
      )
    } finally {
      await cleanup(root)
    }
  })

  test('no-empty off is reported without blaming the typescript plugin', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedConfig({
            plugins: ['react'],
            rules: {
              'typescript/no-misused-promises': 'deny',
              'typescript/no-floating-promises': 'deny',
            },
          })
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-rule-missing'])
      assert.match(findings[0]!.message, /no-empty: not enabled/)
      assert.doesNotMatch(
        findings[0]!.message,
        /no-empty: the "typescript" plugin/
      )
    } finally {
      await cleanup(root)
    }
  })

  test('lint keys decide which policy rules are required', async () => {
    const bare = {
      plugins: ['unicorn', 'typescript', 'oxc'],
      rules: {
        'typescript/no-misused-promises': 'deny',
        'typescript/no-floating-promises': 'deny',
        'no-empty': 'deny',
      },
      options: { typeAware: true },
      overrides: [],
    }
    const enforced = await makeApp()
    const warned = await makeApp({
      pikkuConfig: {
        lint: {
          enforceContentService: 'warn',
          enforceVariablesService: 'off',
          enforceSupervisor: 'off',
          enforceCliCommands: 'off',
        },
      },
    })
    try {
      const findings = await runOxlintSetupChecks(
        enforced,
        fakeExec(() => reply(bare)).exec
      )
      assert.deepEqual(
        findings.map((f) => [f.id, f.severity]),
        [
          ['oxlint-enforce-content-service', 'error'],
          ['oxlint-enforce-variables-service', 'error'],
          ['oxlint-enforce-supervisor', 'error'],
          ['oxlint-enforce-cli-commands', 'error'],
        ]
      )
      assert.match(findings[0]!.fixHint, /"enforceContentService": "off"/)
      assert.match(findings[3]!.fixHint, /"enforceCliCommands": "off"/)

      const relaxed = await runOxlintSetupChecks(
        warned,
        fakeExec(() => reply(bare)).exec
      )
      assert.deepEqual(
        relaxed.map((f) => [f.id, f.severity]),
        [['oxlint-enforce-content-service', 'warn']]
      )
    } finally {
      await cleanup(enforced)
      await cleanup(warned)
    }
  })

  const resolvedWith = (policy: Record<string, unknown>) =>
    resolvedConfig({
      rules: {
        'typescript/no-misused-promises': 'deny',
        'typescript/no-floating-promises': 'deny',
        'no-empty': 'deny',
        ...policy,
      },
    })
  const policyRules = (drop: string[], over: Record<string, unknown> = {}) => ({
    ...Object.fromEntries(
      Object.entries(RESOLVED_POLICY_RULES).filter(([r]) => !drop.includes(r))
    ),
    ...over,
  })

  test('no-restricted-imports must name every fs module', async () => {
    const root = await makeApp({
      pikkuConfig: {
        lint: { enforceSupervisor: 'off', enforceCliCommands: 'off' },
      },
    })
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedWith(
            policyRules([], {
              'no-restricted-imports': ['deny', [{ paths: ['fs'] }]],
            })
          )
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-enforce-content-service'])
      assert.match(
        findings[0]!.message,
        /does not restrict node:fs, fs\/promises, node:fs\/promises, fs-extra, graceful-fs/
      )
    } finally {
      await cleanup(root)
    }
  })

  test('the legacy node/no-process-env alone no longer satisfies the variables key', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedConfig({
            plugins: ['typescript', 'node'],
            rules: {
              'typescript/no-misused-promises': 'deny',
              'typescript/no-floating-promises': 'deny',
              'no-empty': 'deny',
              'no-restricted-properties': undefined,
              'node/no-process-env': 'deny',
            },
          })
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), [
        'oxlint-enforce-variables-service',
        'oxlint-enforce-supervisor',
        'oxlint-enforce-cli-commands',
      ])
      assert.match(
        findings[0]!.message,
        /no-restricted-properties: not enabled/
      )
    } finally {
      await cleanup(root)
    }
  })

  test('no-restricted-properties must name every property of its keys', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedWith(
            policyRules([], {
              'no-restricted-properties': [
                'deny',
                [
                  { object: 'process', property: 'argv' },
                  { object: 'Bun', property: 'spawn' },
                ],
              ],
            })
          )
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(
        findings.map((f) => [
          f.id,
          f.message.match(/does not restrict (.*?)(?:; |\. Code)/)![1],
        ]),
        [
          [
            'oxlint-enforce-variables-service',
            'process.env, globalThis.process',
          ],
          ['oxlint-enforce-supervisor', 'Bun.spawnSync, Bun.$, globalThis.Bun'],
          [
            'oxlint-enforce-cli-commands',
            'Bun.argv, Deno.args, globalThis.process, globalThis.Bun, globalThis.Deno',
          ],
        ]
      )
    } finally {
      await cleanup(root)
    }
  })

  test('globalThis.process, Bun and Deno must be restricted too', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedWith(
            policyRules([], {
              'no-restricted-properties': [
                'deny',
                [
                  { object: 'process', property: 'env' },
                  { object: 'process', property: 'argv' },
                  { object: 'Bun', property: 'spawn' },
                  { object: 'Bun', property: 'spawnSync' },
                  { object: 'Bun', property: '$' },
                  { object: 'Bun', property: 'argv' },
                  { object: 'Deno', property: 'args' },
                ],
              ],
            })
          )
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(
        findings.map((f) => [
          f.id,
          f.message.match(/does not restrict (.*?)(?:; |\. Code)/)![1],
        ]),
        [
          ['oxlint-enforce-variables-service', 'globalThis.process'],
          ['oxlint-enforce-supervisor', 'globalThis.Bun'],
          [
            'oxlint-enforce-cli-commands',
            'globalThis.process, globalThis.Bun, globalThis.Deno',
          ],
        ]
      )
    } finally {
      await cleanup(root)
    }
  })

  test('supervisor and cli-commands name their modules', async () => {
    const root = await makeApp({
      pikkuConfig: {
        lint: { enforceContentService: 'off', enforceVariablesService: 'off' },
      },
    })
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedWith(
            policyRules(['no-restricted-imports'], {
              'no-restricted-imports': [
                'deny',
                [
                  {
                    paths: ['child_process', 'node:child_process', 'commander'],
                  },
                ],
              ],
            })
          )
        )
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(
        findings.map((f) => [
          f.id,
          f.message.match(/does not restrict (.*?)(?:; |\. Code)/)![1],
        ]),
        [
          ['oxlint-enforce-supervisor', 'execa, cross-spawn, shelljs'],
          [
            'oxlint-enforce-cli-commands',
            'yargs, minimist, node:util (parseArgs), util (parseArgs)',
          ],
        ]
      )
    } finally {
      await cleanup(root)
    }
  })

  test('importNames: restricting other names of node:util is not parseArgs, restricting the module is', () => {
    const wanted = activePolicyRules(policyLevels(undefined))[
      'no-restricted-imports'
    ]
    const only = (paths: unknown[]) => ['deny', [{ paths }]]
    const missing = (paths: unknown[]) =>
      missingPolicyEntries('no-restricted-imports', only(paths), wanted).filter(
        (m) => m.startsWith('node:util')
      )
    assert.deepEqual(
      missing([{ name: 'node:util', importNames: ['promisify'] }]),
      ['node:util (parseArgs)']
    )
    assert.deepEqual(missing(['node:util']), [])
    assert.deepEqual(
      missing([{ name: 'node:util', importNames: ['parseArgs', 'promisify'] }]),
      []
    )
  })

  test('shared rules are merged across keys, strictest level wins, off keys add nothing', () => {
    const all = activePolicyRules(policyLevels(undefined)) as Record<
      string,
      unknown[]
    >
    const names = (
      all['no-restricted-imports']![1] as {
        paths: Array<{ name: string }>
      }
    ).paths.map((p) => p.name)
    assert.ok(['fs-extra', 'execa', 'yargs'].every((n) => names.includes(n)))
    assert.equal(all['no-restricted-properties']!.length, 1 + 10)
    assert.equal(all['no-restricted-imports']![0], 'error')

    const mixed = activePolicyRules(
      policyLevels({
        enforceContentService: 'warn',
        enforceVariablesService: 'off',
        enforceSupervisor: 'warn',
        enforceCliCommands: 'off',
      })
    ) as Record<string, unknown>
    assert.equal((mixed['no-restricted-imports'] as unknown[])[0], 'warn')
    assert.equal(mixed['typescript/no-require-imports'], 'warn')
    assert.equal((mixed['no-restricted-properties'] as unknown[]).length, 1 + 4)
    assert.deepEqual(
      activePolicyRules(
        policyLevels({
          enforceContentService: 'off',
          enforceVariablesService: 'off',
          enforceSupervisor: 'off',
          enforceCliCommands: 'off',
        })
      ),
      {}
    )
  })

  test('an override exempting files from a policy rule is accepted', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply(
          resolvedConfig({
            overrides: [
              {
                files: ['src/bootstrap.ts'],
                rules: { 'no-restricted-properties': 'allow' },
              },
            ],
          })
        )
      )
      assert.deepEqual(await runOxlintSetupChecks(root, exec), [])
    } finally {
      await cleanup(root)
    }
  })

  test('not type-aware is reported unless the lint script passes --type-aware', async () => {
    const withoutOption = resolvedConfig({ options: null })
    const off = await makeApp({ scripts: { lint: 'oxlint apps packages' } })
    const on = await makeApp({
      scripts: { lint: 'oxlint --type-aware apps packages' },
    })
    try {
      const { exec } = fakeExec(() => reply(withoutOption))
      const findings = await runOxlintSetupChecks(off, exec)
      assert.deepEqual(ids(findings), ['oxlint-type-aware-off'])
      assert.match(findings[0]!.fixHint, /"typeAware": true/)
      assert.match(findings[0]!.fixHint, /--type-aware/)
      assert.deepEqual(await runOxlintSetupChecks(on, exec), [])
    } finally {
      await cleanup(off)
      await cleanup(on)
    }
  })

  test('a config oxlint cannot resolve is reported, not passed', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply('', {
          code: 1,
          stderr:
            "Failed to parse oxlint configuration file.\n  x Both '.oxlintrc.json' and '.oxlintrc.jsonc' found",
        })
      )
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-rule-missing'])
      assert.match(findings[0]!.message, /Failed to parse oxlint configuration/)
    } finally {
      await cleanup(root)
    }
  })

  test('validate.rules overrides severity or turns a finding off', async () => {
    const root = await makeApp({
      installed: false,
      tsgolint: false,
      config: false,
      pikkuConfig: {
        validate: {
          rules: {
            'oxlint-not-installed': 'warn',
            'oxlint-config-missing': 'off',
          },
        },
      },
    })
    try {
      const { exec } = fakeExec(() => reply(resolvedConfig()))
      const findings = await runOxlintSetupChecks(root, exec)
      assert.deepEqual(
        findings.map((f) => [f.id, f.severity]),
        [['oxlint-not-installed', 'warn']]
      )
    } finally {
      await cleanup(root)
    }
  })

  test('oxlint hoisted to a workspace root is found from a member', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-oxlint-ws-'))
    try {
      await write(
        root,
        'package.json',
        JSON.stringify({
          workspaces: ['apps/*'],
          devDependencies: { oxlint: '*', 'oxlint-tsgolint': '*' },
        })
      )
      await write(root, 'node_modules/.bin/oxlint', '')
      await write(root, 'node_modules/oxlint-tsgolint/package.json', '{}')
      await write(root, '.oxlintrc.json', '{}')
      await write(root, 'apps/site/package.json', '{"name":"site"}')
      await write(
        root,
        'apps/site/pikku.config.json',
        JSON.stringify({ srcDirectories: ['src'] })
      )
      const { exec, calls } = fakeExec(() => reply(resolvedConfig()))
      assert.deepEqual(
        await runOxlintSetupChecks(join(root, 'apps/site'), exec),
        []
      )
      // The config lives at the workspace root, so that is where oxlint runs.
      assert.equal(calls[0]!.cwd, root)
    } finally {
      await cleanup(root)
    }
  })
})

const diagnostic = (
  code: string,
  file: string,
  line: number,
  severity = 'error',
  message = 'Expected non-Promise value in a boolean conditional.'
) => ({
  message,
  code,
  severity,
  url: `https://oxc.rs/docs/${code}`,
  filename: file,
  labels: [{ span: { offset: 1, length: 2, line, column: 7 } }],
})

describe('oxlint run', () => {
  test('is skipped with a note when oxlint is not installed', async () => {
    const root = await makeApp({ installed: false, tsgolint: false })
    try {
      const { exec, calls } = fakeExec(() => reply({ diagnostics: [] }))
      const findings = await runOxlintRun(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-run-skipped'])
      assert.equal(findings[0]!.severity, 'info')
      assert.match(
        findings[0]!.message,
        /oxlint and oxlint-tsgolint not installed/
      )
      assert.equal(calls.length, 0)
    } finally {
      await cleanup(root)
    }
  })

  test('a clean run reports nothing', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply({ diagnostics: [], number_of_files: 3 })
      )
      assert.deepEqual(await runOxlintRun(root, exec), [])
    } finally {
      await cleanup(root)
    }
  })

  test('diagnostics become findings with file:line, rule and mapped severity', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply({
          number_of_files: 2,
          diagnostics: [
            diagnostic(
              'eslint(no-unused-vars)',
              'packages/functions/src/b.ts',
              9,
              'warning',
              'Variable is unused.'
            ),
            diagnostic(
              'typescript(no-misused-promises)',
              'packages/functions/src/webhook.ts',
              12
            ),
            diagnostic(
              'typescript(no-floating-promises)',
              'packages/functions/src/webhook.ts',
              20,
              'error',
              'Promises must be awaited, add void operator to ignore.'
            ),
          ],
        })
      )
      const findings = await runOxlintRun(root, exec)
      assert.deepEqual(
        findings.map((f) => [f.id, f.severity]),
        [
          ['oxlint-typescript-no-misused-promises', 'error'],
          ['oxlint-typescript-no-floating-promises', 'error'],
          ['oxlint-eslint-no-unused-vars', 'warn'],
        ]
      )
      const misused = findings[0]!
      assert.match(
        misused.message,
        /^packages\/functions\/src\/webhook\.ts:12:7 .*\(typescript\/no-misused-promises\)$/
      )
      assert.equal(
        misused.path,
        join(root, 'packages/functions/src/webhook.ts')
      )
      assert.match(misused.fixHint, /await/)
      // `void` silences the rule and leaves the bug; the finding says so.
      assert.match(findings[1]!.fixHint, /Do NOT .*void/)
    } finally {
      await cleanup(root)
    }
  })

  test('an empty catch is a required finding, ranked ahead of other errors', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply({
          number_of_files: 2,
          diagnostics: [
            diagnostic(
              'eslint(no-unused-vars)',
              'packages/functions/src/b.ts',
              9,
              'warning',
              'Variable is unused.'
            ),
            diagnostic(
              'eslint(no-debugger)',
              'packages/functions/src/b.ts',
              3,
              'error',
              '`debugger` statement is not allowed'
            ),
            diagnostic(
              'eslint(no-empty)',
              'packages/functions/src/c.ts',
              5,
              'error',
              'Unexpected empty block statements'
            ),
          ],
        })
      )
      const findings = await runOxlintRun(root, exec)
      assert.deepEqual(
        findings.map((f) => [f.id, f.severity]),
        [
          ['oxlint-eslint-no-empty', 'error'],
          ['oxlint-eslint-no-debugger', 'error'],
          ['oxlint-eslint-no-unused-vars', 'warn'],
        ]
      )
      assert.match(findings[0]!.fixHint, /Rethrow it, log it with context/)
    } finally {
      await cleanup(root)
    }
  })

  test('runs read-only, type-aware, JSON, over srcDirectories minus generated output', async () => {
    const root = await makeApp({
      pikkuConfig: {
        srcDirectories: ['packages/functions/src', 'packages/functions/test'],
        outDir: 'packages/functions/.pikku',
        scaffold: { pikkuDir: 'packages/functions/src/scaffold' },
      },
    })
    await mkdir(join(root, 'packages/functions/test'), { recursive: true })
    try {
      const { exec, calls } = fakeExec(() =>
        reply({ diagnostics: [], number_of_files: 1 })
      )
      await runOxlintRun(root, exec)
      const call = calls[0]!
      assert.equal(call.file, join(root, 'node_modules/.bin/oxlint'))
      assert.equal(call.cwd, root)
      assert.ok(call.args.includes('--type-aware'))
      assert.deepEqual(call.args.slice(1, 3), ['--format', 'json'])
      assert.ok(
        !call.args.some((a) => a.startsWith('--fix')),
        'oxlint is never run with a --fix flag'
      )
      const patterns = call.args.flatMap((a, i) =>
        call.args[i - 1] === '--ignore-pattern' ? [a] : []
      )
      for (const p of [
        '**/*.gen.ts',
        '**/.pikku/**',
        '**/node_modules/**',
        '**/dist/**',
        'packages/functions/src/scaffold/**',
        'packages/functions/.pikku/**',
      ]) {
        assert.ok(patterns.includes(p), `ignores ${p}`)
      }
      assert.deepEqual(call.args.slice(-2), [
        'packages/functions/src',
        'packages/functions/test',
      ])
    } finally {
      await cleanup(root)
    }
  })

  test('oxlintRunArgs never contains a --fix flag, whatever the project', () => {
    const args = oxlintRunArgs(
      {
        srcDirs: ['/a/src'],
        scaffoldDir: '/a/src/scaffold',
        outDir: '/a/.pikku',
      },
      '/a'
    )
    assert.deepEqual(
      args.filter((a) => /fix/i.test(a)),
      []
    )
  })

  test('output is capped: 50 findings plus one summary, errors first', async () => {
    const root = await makeApp()
    try {
      const diagnostics = [
        ...Array.from({ length: 40 }, (_, i) =>
          diagnostic(
            'eslint(no-unused-vars)',
            'packages/functions/src/w.ts',
            i + 1,
            'warning'
          )
        ),
        ...Array.from({ length: 30 }, (_, i) =>
          diagnostic(
            'typescript(no-misused-promises)',
            'packages/functions/src/e.ts',
            i + 1
          )
        ),
      ]
      const { exec } = fakeExec(() =>
        reply({ diagnostics, number_of_files: 2 })
      )
      const findings = await runOxlintRun(root, exec)
      assert.equal(findings.length, OXLINT_MAX_FINDINGS + 1)
      assert.equal(
        findings.slice(0, 30).every((f) => f.severity === 'error'),
        true
      )
      const summary = findings.at(-1)!
      assert.equal(summary.id, 'oxlint-more-findings')
      assert.match(summary.message, /^20 more oxlint findings not shown/)
    } finally {
      await cleanup(root)
    }
  })

  test('a crash without JSON is one finding carrying stderr', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply('', {
          code: 2,
          stderr: 'oxlint-tsgolint: no tsconfig found\nmore',
        })
      )
      const findings = await runOxlintRun(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-run-failed'])
      assert.equal(findings[0]!.severity, 'error')
      assert.match(findings[0]!.message, /exit 2.*no tsconfig found/)
    } finally {
      await cleanup(root)
    }
  })

  test('a timeout is reported and the configured timeout is used', async () => {
    const root = await makeApp({
      pikkuConfig: { validate: { oxlint: { timeoutSeconds: 7 } } },
    })
    try {
      const { exec, calls } = fakeExec(() =>
        reply('', { code: null, timedOut: true })
      )
      const findings = await runOxlintRun(root, exec)
      assert.equal(calls[0]!.timeoutMs, 7000)
      assert.deepEqual(ids(findings), ['oxlint-run-failed'])
      assert.match(findings[0]!.message, /did not finish within 7s/)
      assert.match(findings[0]!.fixHint, /timeoutSeconds/)
    } finally {
      await cleanup(root)
    }
  })

  test('the default timeout applies when none is configured', async () => {
    const root = await makeApp()
    try {
      const { exec, calls } = fakeExec(() =>
        reply({ diagnostics: [], number_of_files: 1 })
      )
      await runOxlintRun(root, exec)
      assert.equal(calls[0]!.timeoutMs, 300_000)
    } finally {
      await cleanup(root)
    }
  })

  test("validate.rules['oxlint-run'] = 'off' skips the run", async () => {
    const root = await makeApp({
      pikkuConfig: { validate: { rules: { 'oxlint-run': 'off' } } },
    })
    try {
      const { exec, calls } = fakeExec(() => reply({ diagnostics: [] }))
      assert.deepEqual(await runOxlintRun(root, exec), [])
      assert.equal(calls.length, 0)
    } finally {
      await cleanup(root)
    }
  })

  test('validate.rules applies to an individual diagnostic id', async () => {
    const root = await makeApp({
      pikkuConfig: {
        validate: {
          rules: {
            'oxlint-eslint-no-unused-vars': 'off',
            'oxlint-typescript-no-misused-promises': 'warn',
          },
        },
      },
    })
    try {
      const { exec } = fakeExec(() =>
        reply({
          number_of_files: 1,
          diagnostics: [
            diagnostic(
              'eslint(no-unused-vars)',
              'packages/functions/src/a.ts',
              1,
              'warning'
            ),
            diagnostic(
              'typescript(no-misused-promises)',
              'packages/functions/src/a.ts',
              2
            ),
          ],
        })
      )
      const findings = await runOxlintRun(root, exec)
      assert.deepEqual(
        findings.map((f) => [f.id, f.severity]),
        [['oxlint-typescript-no-misused-promises', 'warn']]
      )
    } finally {
      await cleanup(root)
    }
  })

  test('linting zero files is flagged', async () => {
    const root = await makeApp()
    try {
      const { exec } = fakeExec(() =>
        reply({ diagnostics: [], number_of_files: 0 })
      )
      const findings = await runOxlintRun(root, exec)
      assert.deepEqual(ids(findings), ['oxlint-no-files-linted'])
      assert.equal(findings[0]!.severity, 'warn')
    } finally {
      await cleanup(root)
    }
  })

  test('a monorepo lints from the config directory with absolute source paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-oxlint-ws-'))
    try {
      await write(
        root,
        'package.json',
        JSON.stringify({
          workspaces: ['apps/*'],
          devDependencies: { oxlint: '*', 'oxlint-tsgolint': '*' },
        })
      )
      await write(root, 'node_modules/.bin/oxlint', '')
      await write(root, 'node_modules/oxlint-tsgolint/package.json', '{}')
      await write(root, '.oxlintrc.json', '{}')
      await write(root, 'apps/site/package.json', '{"name":"site"}')
      await write(root, 'apps/site/src/a.ts', 'export {}\n')
      await write(
        root,
        'apps/site/pikku.config.json',
        JSON.stringify({ srcDirectories: ['src'] })
      )
      const { exec, calls } = fakeExec(() =>
        reply({
          number_of_files: 1,
          diagnostics: [
            diagnostic(
              'typescript(no-misused-promises)',
              'apps/site/src/a.ts',
              3
            ),
          ],
        })
      )
      const findings = await runOxlintRun(join(root, 'apps/site'), exec)
      assert.equal(calls[0]!.cwd, root)
      assert.equal(calls[0]!.args.at(-1), 'apps/site/src')
      assert.equal(findings[0]!.path, join(root, 'apps/site/src/a.ts'))
      assert.match(findings[0]!.message, /^src\/a\.ts:3:7 /)
    } finally {
      await cleanup(root)
    }
  })
})

/**
 * The real thing: needs an install with oxlint and oxlint-tsgolint, which this
 * repo does not carry. Point PIKKU_TEST_OXLINT_DIR at a directory whose
 * node_modules has both (it is skipped otherwise).
 */
const findRealInstall = (): string | undefined => {
  const candidates = [
    process.env.PIKKU_TEST_OXLINT_DIR,
    resolve(import.meta.dirname, '../../../../..'),
  ]
  return candidates.find(
    (dir): dir is string =>
      !!dir &&
      existsSync(join(dir, 'node_modules/.bin/oxlint')) &&
      existsSync(join(dir, 'node_modules/oxlint-tsgolint/package.json'))
  )
}
const realInstall = findRealInstall()

describe('oxlint run against the real oxlint', { skip: !realInstall }, () => {
  const buildApp = async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-oxlint-real-'))
    await symlink(
      join(realInstall!, 'node_modules'),
      join(root, 'node_modules')
    )
    await write(
      root,
      'package.json',
      JSON.stringify({
        name: 'app',
        devDependencies: { oxlint: '*', 'oxlint-tsgolint': '*' },
      })
    )
    await write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
          noEmit: true,
        },
        include: ['src'],
      })
    )
    await write(
      root,
      'pikku.config.json',
      JSON.stringify({ srcDirectories: ['src'] })
    )
    await write(root, '.oxlintrc.json', JSON.stringify(newOxlintConfig()))
    await write(
      root,
      'src/webhook.ts',
      [
        'declare function verify(sig: string): Promise<boolean>',
        'export async function handle(sig: string) {',
        "  if (!verify(sig)) return 'rejected'",
        '  verify(sig)',
        "  return 'ok'",
        '}',
        '',
      ].join('\n')
    )
    // Generated output must not be reported.
    await write(
      root,
      'src/scaffold/x.gen.ts',
      'declare function v(): Promise<boolean>\nexport async function g() { if (!v()) return }\n'
    )
    return root
  }

  test('setup passes and `if (!verify(sig))` is a no-misused-promises finding', async () => {
    const root = await buildApp()
    try {
      assert.deepEqual(await runOxlintSetupChecks(root), [])
      const findings = await runOxlintRun(root)
      assert.deepEqual(findings.map((f) => f.id).sort(), [
        'oxlint-typescript-no-floating-promises',
        'oxlint-typescript-no-misused-promises',
      ])
      const misused = findings.find(
        (f) => f.id === 'oxlint-typescript-no-misused-promises'
      )!
      assert.equal(misused.severity, 'error')
      assert.match(misused.message, /^src\/webhook\.ts:3:/)
      assert.ok(findings.every((f) => !f.path.includes('.gen.')))
    } finally {
      await cleanup(root)
    }
  })

  test('fs and process.env are findings outside tests and allowed inside them', async () => {
    const root = await buildApp()
    try {
      const source = [
        "import type { Stats } from 'node:fs'",
        "import { readFile } from 'node:fs/promises'",
        'export type S = Stats',
        'export const port = process.env.PORT',
        "export const read = () => readFile('x')",
        '',
      ].join('\n')
      await write(root, 'src/reads.ts', source)
      await write(root, 'src/reads.test.ts', source)
      assert.deepEqual(await runOxlintSetupChecks(root), [])
      const findings = (await runOxlintRun(root)).filter((f) =>
        f.path.includes('reads')
      )
      assert.deepEqual(findings.map((f) => f.message.split(' ')[0]).sort(), [
        'src/reads.ts:2:1',
        'src/reads.ts:4:21',
      ])
    } finally {
      await cleanup(root)
    }
  })

  test('a repo with the rules off fails setup', async () => {
    const root = await buildApp()
    try {
      await write(root, '.oxlintrc.json', '{}')
      const findings = await runOxlintSetupChecks(root)
      assert.ok(findings.some((f) => f.id === 'oxlint-rule-missing'))
      assert.ok(findings.some((f) => f.id === 'oxlint-type-aware-off'))
    } finally {
      await cleanup(root)
    }
  })
})
