import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

interface UserFlowRunResult {
  code: number | null
  output: string
}

let lastRun: UserFlowRunResult | undefined

const runUserFlow = (
  environment: string,
  flow: string
): Promise<UserFlowRunResult> =>
  new Promise((resolvePromise) => {
    const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const child = spawn(
      'npx',
      ['pikku', 'userflow', 'run', environment, '--flows', flow],
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
  'I run the {string} user flow against the {string} environment',
  async function (flow: string, environment: string) {
    lastRun = await runUserFlow(environment, flow)
  }
)

Then('the user flow run reports all flows passed', function () {
  assert.ok(lastRun, 'no user flow run recorded')
  assert.equal(
    lastRun.code,
    0,
    `pikku userflow run exited ${lastRun.code}:\n${lastRun.output}`
  )
  assert.doesNotMatch(
    lastRun.output,
    /^FAIL /m,
    `a flow failed:\n${lastRun.output}`
  )
  assert.match(
    lastRun.output,
    /\b(\d+)\/\1 user flows passed\b/,
    `expected every flow to pass:\n${lastRun.output}`
  )
})

Then('the user flow run exits non-zero', function () {
  assert.ok(lastRun, 'no user flow run recorded')
  assert.notEqual(
    lastRun.code,
    0,
    `expected a non-zero exit code on failure:\n${lastRun.output}`
  )
})
