import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import * as assert from 'node:assert'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runValidate } from '@pikku/cli/validate'
import { newOxlintConfig } from '../../packages/cli/dist/src/functions/validate/oxlint-enable.js'

const root = process.cwd()
const configPath = join(root, 'pikku.config.json')

const coreImports = async (): Promise<string[]> => {
  const { findings } = await runValidate(root)
  return findings
    .filter((finding) => finding.id === 'core-import')
    .map((finding) => `${finding.severity} ${finding.fixHint}`)
}

/**
 * Restores the config whatever the assertions do, so a failure does not leave
 * the verifier's own project with a lint rule switched off.
 */
const withConfig = async (patch: unknown, body: () => Promise<void>) => {
  const original = await readFile(configPath, 'utf8')
  await writeFile(configPath, JSON.stringify(patch, null, 2))
  try {
    await body()
  } finally {
    await writeFile(configPath, original)
  }
}

test('app code reaching past #pikku into @pikku/core is reported', async () => {
  assert.deepStrictEqual(await coreImports(), [
    "error Import the same names from '#pikku/error'",
    "error Nothing in '#pikku' carries these names yet — that is a gap in " +
      'what the CLI emits, so please open an issue naming them. ' +
      "'@pikku/core/services' is the one subpath an app may name, for the " +
      'service implementations it picks in bootstrap. To keep the import ' +
      'meanwhile, set "lint": { "coreImport": "off" } in pikku.config.json',
  ])
})

test('pikku validate exits non-zero when it reports an error', () => {
  const run = spawnSync(
    'node',
    [join(root, '../../packages/cli/dist/bin/pikku.js'), 'validate'],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  )
  assert.strictEqual(run.status, 1, `${run.stdout}\n${run.stderr}`)
})

test('the service implementations bootstrap picks are not reported', async () => {
  const services = await readFile(join(root, 'src', 'services.ts'), 'utf8')
  assert.ok(services.includes("from '@pikku/core/services'"))

  const { findings } = await runValidate(root)
  assert.deepStrictEqual(
    findings.filter((finding) => finding.path.endsWith('services.ts')),
    []
  )
})

test('the lint key lowers the severity', async () => {
  await withConfig(
    {
      tsconfig: './tsconfig.json',
      srcDirectories: ['src'],
      outDir: '.pikku',
      lint: { coreImport: 'warn' },
    },
    async () => {
      const findings = await coreImports()
      assert.equal(findings.length, 2)
      assert.ok(findings.every((finding) => finding.startsWith('warn ')))
    }
  )
})

const oxlintConfigPath = join(root, '.oxlintrc.json')
const swallowingPath = join(root, 'src', 'functions', 'swallows-a-failure.ts')

/**
 * Written for the test and removed after it: committed, the empty catch would
 * fail the repository's own `bun run lint`, which lints `verifiers/`.
 */
const withEmptyCatch = async (noEmpty: unknown, body: () => Promise<void>) => {
  await writeFile(
    oxlintConfigPath,
    JSON.stringify({
      options: { typeAware: true },
      rules: {
        'typescript/no-misused-promises': 'error',
        'typescript/no-floating-promises': 'error',
        'no-empty': noEmpty,
      },
    })
  )
  await writeFile(
    swallowingPath,
    'export const parse = (raw: string): unknown => {\n' +
      '  try {\n' +
      '    return JSON.parse(raw)\n' +
      '  } catch {}\n' +
      '  return null\n' +
      '}\n'
  )
  try {
    await body()
  } finally {
    await rm(oxlintConfigPath, { force: true })
    await rm(swallowingPath, { force: true })
  }
}

test('an empty catch fails validate through the app oxlint', async () => {
  await withEmptyCatch('error', async () => {
    const { findings } = await runValidate(root)
    assert.deepStrictEqual(
      findings
        .filter((finding) => finding.id === 'oxlint-eslint-no-empty')
        .map((finding) => [finding.severity, finding.path]),
      [['error', swallowingPath]]
    )
  })
})

test('allowEmptyCatch is refused as a way to keep no-empty on', async () => {
  await withEmptyCatch(['error', { allowEmptyCatch: true }], async () => {
    const { findings } = await runValidate(root)
    const missing = findings.filter(
      (finding) => finding.id === 'oxlint-rule-missing'
    )
    assert.equal(missing.length, 1)
    assert.match(missing[0]!.message, /"allowEmptyCatch" is true/)
    assert.deepStrictEqual(
      findings.filter((finding) => finding.id === 'oxlint-eslint-no-empty'),
      []
    )
  })
})

test('the lint key switches the rule off', async () => {
  await withConfig(
    {
      tsconfig: './tsconfig.json',
      srcDirectories: ['src'],
      outDir: '.pikku',
      lint: { coreImport: 'off' },
    },
    async () => {
      assert.deepStrictEqual(await coreImports(), [])
    }
  )
})

/**
 * A service file that breaks every code-policy key: it starts a process, uses
 * the disk, reads the environment and parses argv. The last two reads carry a
 * plain oxlint comment, the only exemption that exists for a single line.
 */
const POLICY_VIOLATIONS = `import { execFileSync } from 'node:child_process'
import { cp, readFileSync, rename, writeFileSync } from 'node:fs'

export const run = () => {
  execFileSync('ps', ['-ax'])
  const text = readFileSync('/tmp/a', 'utf8')
  writeFileSync('/tmp/b', text)
  cp('/tmp/b', '/tmp/c', () => {})
  rename('/tmp/c', '/tmp/d', () => {})
  const token = process.env.API_TOKEN
  const copy = { ...process.env }
  const [repo, home, mode = 'ci'] = process.argv.slice(2)
  // oxlint-disable-next-line no-restricted-properties -- bootstrap value read before services exist
  const exempt = process.env.EXEMPT
  return [token, copy, repo, home, mode, exempt]
}
`

const servicePath = join(root, 'src', 'services', 'addon-service.ts')
const startPath = join(root, 'src', 'start.ts')

/** The `.oxlintrc.json` `pikku enable oxlint` writes, plus the two fixture files. */
const withPolicyApp = async (config: unknown, body: () => Promise<void>) => {
  await mkdir(join(root, 'src', 'services'), { recursive: true })
  await writeFile(oxlintConfigPath, JSON.stringify(config))
  await writeFile(servicePath, POLICY_VIOLATIONS)
  await writeFile(startPath, POLICY_VIOLATIONS)
  try {
    await body()
  } finally {
    await rm(oxlintConfigPath, { force: true })
    await rm(join(root, 'src', 'services'), { recursive: true, force: true })
    await rm(startPath, { force: true })
  }
}

const policyHits = async (file: string): Promise<string[]> => {
  const { findings } = await runValidate(root)
  return findings
    .filter(
      (finding) =>
        finding.path === file &&
        /^oxlint-(eslint-no-restricted|typescript-no-require)/.test(finding.id)
    )
    .map((finding) => {
      const line = /:(\d+):\d+/.exec(finding.message)?.[1]
      return `${finding.id.replace('oxlint-', '')}@${line}`
    })
    .sort()
}

test('a service that spawns, reads the disk, the env and argv is reported line by line', async () => {
  await withPolicyApp(newOxlintConfig(), async () => {
    assert.deepStrictEqual(await policyHits(servicePath), [
      'eslint-no-restricted-imports@1',
      'eslint-no-restricted-imports@2',
      'eslint-no-restricted-properties@10',
      'eslint-no-restricted-properties@11',
      'eslint-no-restricted-properties@12',
    ])
  })
})

test('the bootstrap override exempts start.ts, which has the same violations', async () => {
  await withPolicyApp(newOxlintConfig(), async () => {
    assert.deepStrictEqual(await policyHits(startPath), [])
  })
})

test('a config that only has the old node/no-process-env rule is refused for every key, and fs-extra is now required too', async () => {
  const legacy = {
    plugins: ['typescript', 'node'],
    options: { typeAware: true },
    rules: {
      'typescript/no-misused-promises': 'error',
      'typescript/no-floating-promises': 'error',
      'no-empty': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: ['fs', 'node:fs', 'fs/promises', 'node:fs/promises'].map(
            (name) => ({ name, allowTypeImports: true })
          ),
        },
      ],
      'typescript/no-require-imports': 'error',
      'node/no-process-env': 'error',
    },
  }
  await withPolicyApp(legacy, async () => {
    const { findings } = await runValidate(root)
    assert.deepStrictEqual(
      findings
        .filter((finding) => finding.id.startsWith('oxlint-enforce-'))
        .map((finding) => finding.id)
        .sort(),
      [
        'oxlint-enforce-cli-commands',
        'oxlint-enforce-content-service',
        'oxlint-enforce-supervisor',
        'oxlint-enforce-variables-service',
      ]
    )
  })
})

test('turning a key off stops requiring and reporting its rules', async () => {
  await withConfig(
    {
      tsconfig: './tsconfig.json',
      srcDirectories: ['src'],
      outDir: '.pikku',
      lint: {
        enforceContentService: 'off',
        enforceVariablesService: 'off',
        enforceSupervisor: 'off',
        enforceCliCommands: 'off',
      },
    },
    async () => {
      await withPolicyApp(
        { options: { typeAware: true }, rules: {} },
        async () => {
          const { findings } = await runValidate(root)
          assert.deepStrictEqual(
            findings.filter((finding) =>
              finding.id.startsWith('oxlint-enforce-')
            ),
            []
          )
        }
      )
    }
  )
})
