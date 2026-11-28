/**
 * `pikku scenario mutate`, tested as the CLI it is.
 *
 * The command generates mutants of a source file with StrykerJS, splices each
 * into the project, and runs codegen, tsc and a real `scenario run --spawn`
 * against it. Only a real project proves that chain, so this spawns the CLI
 * against the e2e project and asserts on what it prints, on its exit code, and
 * on the source it must leave untouched.
 *
 * The target is `doubleValue` and `formatMessage` in workflow-steps.functions.ts,
 * driven by `orderSupportScenario`. That scenario never asserts on the doubled
 * value, so `value * 2` → `value / 2` survives, while a mutant that strips the
 * function's wiring is caught. One run covers both outcomes.
 *
 * The command boots its own server per mutant, so this file does not start one;
 * it only has to hand the run a port nobody holds.
 */
import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyTestEnvDefaults } from '../../bin/backend-harness.js'

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TARGET = 'packages/functions/src/functions/workflow-steps.functions.ts'

interface CliResult {
  code: number | null
  output: string
}

const freePort = (): Promise<number> =>
  new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (typeof address === 'string' || address === null) {
        probe.close(() => reject(new Error('no free port')))
        return
      }
      probe.close(() => resolvePort(address.port))
    })
  })

const run = (args: string[]): Promise<CliResult> =>
  new Promise((resolvePromise) => {
    const child = spawn('npx', ['pikku', ...args], {
      cwd: PROJECT_DIR,
      env: { ...process.env },
    })
    let output = ''
    child.stdout.on('data', (d: Buffer) => (output += d.toString()))
    child.stderr.on('data', (d: Buffer) => (output += d.toString()))
    child.on('error', (error) => {
      output += `\nspawn error: ${error.message}`
      resolvePromise({ code: null, output })
    })
    child.on('close', (code) => resolvePromise({ code, output }))
  })

describe('pikku scenario mutate', () => {
  before(() => applyTestEnvDefaults())

  test('refuses to run without the scenarios that must catch the mutants', async () => {
    const { code, output } = await run([
      'scenario',
      'mutate',
      'local',
      '--files',
      TARGET,
    ])
    assert.notEqual(code, 0, output)
    assert.match(output, /--flows is required/, output)
  })

  test('kills a mutant the scenario notices, reports one it does not, and leaves the source as it found it', async () => {
    const before = readFileSync(join(PROJECT_DIR, TARGET), 'utf8')
    const apiUrl = `http://localhost:${await freePort()}`

    const { code, output } = await run([
      'scenario',
      'mutate',
      'local',
      '--files',
      TARGET,
      '--flows',
      'orderSupportScenario',
      '--max-mutants',
      '3',
      '--min-score',
      '100',
      '--api-url',
      apiUrl,
    ])

    assert.match(
      output,
      /ObjectLiteral → killed/,
      `a mutant that strips the function's wiring must be killed:\n${output}`
    )
    assert.match(
      output,
      /ArithmeticOperator → survived/,
      `value * 2 → value / 2 is not asserted on by the scenario:\n${output}`
    )
    assert.match(
      output,
      new RegExp(`${TARGET}:\\d+\\s+ArithmeticOperator → value / 2`),
      `the survivor is listed by file, line and mutator:\n${output}`
    )
    assert.match(output, /Mutation score\s+66\.7%/, output)
    assert.match(output, /Gate\s+FAILED \(min 100%\)/, output)
    assert.notEqual(code, 0, `--min-score 100 must fail the run:\n${output}`)

    assert.equal(
      readFileSync(join(PROJECT_DIR, TARGET), 'utf8'),
      before,
      'the mutated file must be restored'
    )
  })
})
