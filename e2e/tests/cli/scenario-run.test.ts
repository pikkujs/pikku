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
import { existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startBackend } from '../../bin/backend-harness.js'

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Where `pikku scenario run` files a run's artifacts, one folder per run. */
const CAPTURE_ROOT = join(PROJECT_DIR, '.pikku', 'scenario-runs')

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

  /**
   * The failure mode this exists to prevent: a run that skips every scenario it
   * was asked for and still reports success. Being held back for a `skip` is the
   * project's decision and stays green; having no binding for the run surface is
   * nobody's decision, so it has to fail loudly enough that nobody reads the run
   * as coverage it never provided.
   */
  test('a scenario that cannot run on the surface fails the run', async () => {
    const { code, output } = await runScenario('codeEditorConsoleScenario')
    assert.notEqual(
      code,
      0,
      `a run that could not run what it was asked for must not exit zero:\n${output}`
    )
    assert.match(
      output,
      /^SKIP codeEditorConsoleScenario \(no default or default binding: /m,
      `expected the scenario to name the missing surface:\n${output}`
    )
    assert.match(
      output,
      /could not run on 'default'.*--run browser/s,
      `expected the run to say how to run it:\n${output}`
    )
  })

  test('a browser step drives the console as its actor', async () => {
    assertAllPassed(
      await runScenario('codeEditorConsoleScenario', ['--run', 'browser'])
    )
  })

  /**
   * Captures, end to end.
   *
   * `@pikku/playwright` unit-tests the naming and the ffmpeg fallback, but
   * nothing there proves `--screenshots` survives the trip from the CLI flag
   * through the driver to the actor session and onto disk. That is only
   * answerable by running it.
   *
   * The assertion is exact rather than "some png exists": every part of the
   * filename is derived — the index from call order, the stem from the
   * description the scenario passes, the suffix from the actor — so a run that
   * captured the right number of images under the wrong names is a regression,
   * not a variation. The run directory is a uuid, so it is read back from the
   * line the CLI prints rather than guessed.
   */
  test('--screenshots writes the run’s images under names it chose', async () => {
    const run = await runScenario('captureScenario', [
      '--screenshots',
      '--run',
      'browser',
    ])
    assertAllPassed(run)

    const reported = run.output.match(/Captures → (.+)$/m)
    assert.ok(
      reported,
      `expected the run to report its capture dir:\n${run.output}`
    )

    // The scenario's folder is its run label — "<feature> › <scenario>" — made
    // filename-safe, which is what `beginScenario` stamps onto every capture.
    const scenarioDir = join(
      reported[1]!.trim(),
      'run-captures-capturescenario'
    )
    assert.ok(
      existsSync(scenarioDir),
      `expected captures under ${scenarioDir}:\n${run.output}`
    )
    assert.deepEqual(readdirSync(scenarioDir).sort(), [
      '01-addons-gallery-admin.png',
      '02-functions-list-admin.png',
    ])
  })

  /**
   * The flag is opt-in, so a scenario that photographs the page has to survive
   * being run without it — `browser.screenshot()` returns the bytes and writes
   * nothing. Without this, taking a picture would silently become a dependency
   * on a flag, and every plain run of the suite would fail.
   */
  test('the same scenario passes with capture off, writing nothing', async () => {
    const before = existsSync(CAPTURE_ROOT)
      ? readdirSync(CAPTURE_ROOT).length
      : 0
    assertAllPassed(await runScenario('captureScenario', ['--run', 'browser']))
    const after = existsSync(CAPTURE_ROOT)
      ? readdirSync(CAPTURE_ROOT).length
      : 0
    assert.equal(
      after,
      before,
      'a run without --screenshots must write no captures'
    )
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
      // The surface these are written for. Without it they are held back before
      // a provider is ever looked for, and the assertion below passes by never
      // reaching the thing it is about.
      '--run',
      'browser',
    ])
    assert.doesNotMatch(
      output,
      /no browser provider is registered/,
      `--tags must not strip the step functions out of the project:\n${output}`
    )
  })
})
