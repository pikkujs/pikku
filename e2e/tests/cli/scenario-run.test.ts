/**
 * `pikku scenario run` itself, tested as the CLI it is.
 *
 * This was a cucumber feature until the rest of the suite moved onto
 * `pikkuScenario`, and it is the one file that could not follow: it spawns
 * `pikku scenario run` and asserts on its stdout, so written as a scenario it
 * would invoke itself. Exit codes, the step ladder, the skip report and the
 * coverage attribution are all *output*, and output is a CLI's contract — so
 * this is a CLI test, run under `node:test` against a backend it starts itself.
 *
 * Each case spawns a fresh run rather than sharing one: the exit code is half
 * of what is being asserted, and a shared run has only one.
 */
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startBackend } from '../../bin/backend-harness.js'

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

interface ScenarioRunResult {
  code: number | null
  output: string
}

/** The server this file started, which the spawned CLI has to be pointed at. */
let apiUrl: string

const run = (args: string[]): Promise<ScenarioRunResult> =>
  new Promise((resolvePromise) => {
    // The `local` environment in pikku.config.json names a fixed port. Without
    // these the run targets that port whatever this file actually started on —
    // which passes against someone else's server and fails against nothing.
    const child = spawn(
      'npx',
      [
        'pikku',
        'scenario',
        'run',
        'local',
        '--api-url',
        apiUrl,
        '--app-url',
        apiUrl,
        ...args,
      ],
      {
        cwd: PROJECT_DIR,
        env: { ...process.env },
      }
    )
    let output = ''
    child.stdout.on('data', (d: Buffer) => {
      output += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      output += d.toString()
    })
    child.on('error', (error) => {
      output += `\nspawn error: ${error.message}`
      resolvePromise({ code: null, output })
    })
    child.on('close', (code) => resolvePromise({ code, output }))
  })

const runScenario = (flow: string, extraArgs: string[] = []) =>
  run(['--flows', flow, ...extraArgs])

const assertAllPassed = ({ code, output }: ScenarioRunResult) => {
  assert.equal(code, 0, `pikku scenario run exited ${code}:\n${output}`)
  assert.doesNotMatch(output, /^FAIL /m, `a flow failed:\n${output}`)
  assert.match(
    output,
    /\b(\d+)\/\1 scenarios passed\b/,
    `expected every flow to pass:\n${output}`
  )
}

describe('pikku scenario run', () => {
  let stop: (() => void) | undefined

  before(async () => {
    const server = await startBackend()
    stop = server.stop
    apiUrl = server.apiUrl
    await server.waitUntilReady()
  })

  after(() => stop?.())

  test('a passing scenario drives signed-in actors and exits zero', async () => {
    assertAllPassed(await runScenario('orderSupportScenario'))
  })

  test('a failing scenario surfaces a non-zero exit code', async () => {
    const { code, output } = await runScenario('failingScenario')
    assert.notEqual(code, 0, `expected a non-zero exit code:\n${output}`)
  })

  test('coverage is attributed per scenario and written out', async () => {
    const run = await runScenario('orderSupportScenario', ['--coverage'])
    assertAllPassed(run)
    assert.match(
      run.output,
      /coverage: [1-9]\d*\/\d+ functions exercised by 'orderSupportScenario'/,
      `expected per-scenario coverage attribution:\n${run.output}`
    )
    assert.match(
      run.output,
      /Scenario coverage → .*scenario-coverage\.json/,
      `expected scenario-coverage.json to be written:\n${run.output}`
    )
  })

  test('stubbed service calls and per-actor fault injection hold', async () => {
    assertAllPassed(await runScenario('notificationScenario'))
  })

  test('declared steps render a readable ladder', async () => {
    const run = await runScenario('codeEditorScenario')
    assertAllPassed(run)
    assert.match(
      run.output,
      /^\s*When\s+the admin reads a function definition in the console\s+✓/m,
      `expected the step ladder to render the declared prose:\n${run.output}`
    )
  })

  test('a browser scenario is skipped, not failed, without a browser', async () => {
    const { code, output } = await runScenario('codeEditorConsoleScenario', [
      '--no-browser',
    ])
    assert.equal(
      code,
      0,
      `skipping a browser scenario must not fail the run:\n${output}`
    )
    assert.match(
      output,
      /^SKIP codeEditorConsoleScenario \(browser steps, --no-browser\)/m,
      `expected the scenario to be reported as skipped:\n${output}`
    )
    assert.match(
      output,
      /1 skipped/,
      `expected the summary to count the skip:\n${output}`
    )
  })

  test('a browser step drives the console as its actor', async () => {
    assertAllPassed(await runScenario('codeEditorConsoleScenario'))
  })

  /**
   * `--tags` selects which scenarios to RUN. It is not the inspector's tag
   * filter, which selects which code to GENERATE — and a run that narrowed the
   * inspector state would lose the step functions it is about to call, leaving
   * every browser scenario unable to find a browser provider.
   */
  test('--tags selects scenarios without narrowing the project', async () => {
    const { output } = await run([
      '--tags',
      'console',
      '--features',
      'addonsFeature',
    ])
    assert.doesNotMatch(
      output,
      /no browser provider is registered/,
      `--tags must not strip the step functions out of the project:\n${output}`
    )
  })
})
