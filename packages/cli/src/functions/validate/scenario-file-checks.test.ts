import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { runScenarioFileChecks } from './scenario-file-checks.js'

const makeTmp = async () => mkdtemp(join(tmpdir(), 'pikku-scenario-files-'))

const srcDirs = ['packages/functions/src']

const write = async (
  root: string,
  rel: string,
  contents: string
): Promise<void> => {
  const path = join(root, 'packages', 'functions', 'src', rel)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

const ids = (findings: { id: string }[]): string[] => findings.map((f) => f.id)

const SCENARIO = "pikkuScenario('signs in', {})\n"
const STEP = "pikkuScenarioStep('clicks', { browser: async () => {} })\n"
const FEATURE = "pikkuFeature('billing', {})\n"
const PERSONAS = "definePersonas({ founder: { name: 'Anna' } })\n"

describe('scenario and virtual-user file placement', () => {
  test('a scenario in a *.scenarios.ts file is fine', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'scenarios/auth.scenarios.ts', SCENARIO)
      await write(tmp, 'scenarios/browser.steps.ts', STEP)
      await write(tmp, 'scenarios/billing.scenario.ts', FEATURE)
      assert.deepStrictEqual(ids(await runScenarioFileChecks(tmp, srcDirs)), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a scenario mixed into a function file is an error', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'functions/company.ts',
        `export const createCompany = () => {}\n${SCENARIO}`
      )
      const findings = await runScenarioFileChecks(tmp, srcDirs)
      assert.deepStrictEqual(ids(findings), [
        'scenario-declared-outside-scenario-file',
      ])
      assert.strictEqual(findings[0]!.severity, 'error')
      assert.match(findings[0]!.message, /pikkuScenario/)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a step mixed into a wiring file is an error, and names the declaration', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'wirings/company.http.ts', STEP)
      const findings = await runScenarioFileChecks(tmp, srcDirs)
      assert.deepStrictEqual(ids(findings), [
        'scenario-declared-outside-scenario-file',
      ])
      assert.match(findings[0]!.message, /pikkuScenarioStep/)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('the name in a comment or a string is not a declaration', async () => {
    const tmp = await makeTmp()
    try {
      await write(
        tmp,
        'functions/company.ts',
        "// pikkuScenario is declared elsewhere\nconst doc = 'see pikkuFeature'\n"
      )
      assert.deepStrictEqual(ids(await runScenarioFileChecks(tmp, srcDirs)), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('generated files are never flagged', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'scaffold/console.gen.ts', SCENARIO)
      assert.deepStrictEqual(ids(await runScenarioFileChecks(tmp, srcDirs)), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('personas outside a *.virtual-user.ts file are an error', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'scenarios/personas.ts', PERSONAS)
      const findings = await runScenarioFileChecks(tmp, srcDirs)
      assert.deepStrictEqual(ids(findings), [
        'virtual-user-declared-outside-virtual-user-file',
      ])
      assert.strictEqual(findings[0]!.severity, 'error')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('*.virtual-user.ts and *.vu.ts both satisfy the rule', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'scenarios/personas.virtual-user.ts', PERSONAS)
      await write(tmp, 'scenarios/load.vu.ts', 'await runVirtualUser({})\n')
      assert.deepStrictEqual(ids(await runScenarioFileChecks(tmp, srcDirs)), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a scenario file is still not allowed to hold the personas', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'scenarios/auth.scenarios.ts', SCENARIO + PERSONAS)
      assert.deepStrictEqual(ids(await runScenarioFileChecks(tmp, srcDirs)), [
        'virtual-user-declared-outside-virtual-user-file',
      ])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
