import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

interface ScenarioRunResult {
  code: number | null
  output: string
}

let lastRun: ScenarioRunResult | undefined

const runScenario = (
  environment: string,
  flow: string
): Promise<ScenarioRunResult> =>
  new Promise((resolvePromise) => {
    const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const child = spawn(
      'npx',
      ['pikku', 'scenario', 'run', environment, '--flows', flow],
      { cwd: projectDir, env: { ...process.env } }
    )
    let output = ''
    child.stdout.on('data', (d: Buffer) => {
      output += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      output += d.toString()
    })
    child.on('close', (code) => resolvePromise({ code, output }))
  })

When(
  'I run the {string} scenario against the {string} environment',
  async function (flow: string, environment: string) {
    lastRun = await runScenario(environment, flow)
  }
)

Then('the scenario run reports all flows passed', function () {
  assert.ok(lastRun, 'no scenario run recorded')
  assert.equal(
    lastRun.code,
    0,
    `pikku scenario run exited ${lastRun.code}:\n${lastRun.output}`
  )
  assert.doesNotMatch(
    lastRun.output,
    /^FAIL /m,
    `a flow failed:\n${lastRun.output}`
  )
  assert.match(
    lastRun.output,
    /\b(\d+)\/\1 scenarios passed\b/,
    `expected every flow to pass:\n${lastRun.output}`
  )
})

Then('the scenario run exits non-zero', function () {
  assert.ok(lastRun, 'no scenario run recorded')
  assert.notEqual(
    lastRun.code,
    0,
    `expected a non-zero exit code on failure:\n${lastRun.output}`
  )
})
