// Drives real `pikku dev` and `pikku serve` processes against scenarios/lifecycle
// and reads back the order in which contributor hooks and the app's own
// serverLifecycle ran. Every hook appends a line to PIKKU_HOOK_LOG.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scenario = resolve(here, '../scenarios/lifecycle')
const pikku = resolve(here, '../../../packages/cli/dist/bin/pikku.js')
const logFile = join(tmpdir(), `pikku-hook-log-${process.pid}.log`)

interface Run {
  lines: string[]
  output: string
  code: number | null
}

/**
 * Starts the command and, once it prints its ready line, interrupts it the way
 * a user would. With `expectStartFailure` the process must instead exit by
 * itself before ever becoming ready.
 */
const run = (
  command: 'dev' | 'serve',
  options: {
    env?: Record<string, string>
    config?: string
    expectStartFailure?: boolean
  } = {}
): Promise<Run> =>
  new Promise((resolvePromise, reject) => {
    rmSync(logFile, { force: true })
    const child = spawn(
      'node',
      [
        pikku,
        command,
        '--port',
        '0',
        ...(options.config ? ['-c', options.config] : []),
      ],
      {
        cwd: scenario,
        env: {
          ...process.env,
          PIKKU_HOOK_LOG: logFile,
          PIKKU_HOOK_FAIL: '',
          ...options.env,
        },
        stdio: 'pipe',
      }
    )
    let output = ''
    let ready = false
    let interrupted = false
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`pikku ${command} timed out:\n${output.slice(-3000)}`))
    }, 120_000)
    const collect = (chunk: Buffer) => {
      output += chunk.toString()
      if (!ready && /pikku: ready on /.test(output)) {
        ready = true
        if (options.expectStartFailure) {
          child.kill('SIGKILL')
          reject(
            new Error(`pikku ${command} became ready:\n${output.slice(-3000)}`)
          )
          return
        }
        // Give the post-start work a moment to settle before interrupting.
        setTimeout(() => {
          interrupted = true
          child.kill('SIGINT')
        }, 500)
      }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (!options.expectStartFailure && !interrupted) {
        reject(
          new Error(
            `pikku ${command} exited (${code}) before becoming ready:\n${output.slice(-3000)}`
          )
        )
        return
      }
      resolvePromise({
        lines: existsSync(logFile)
          ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)
          : [],
        output,
        code,
      })
    })
  })

const contributors = ['hook-a', 'hook-b', 'hook-c']
const started = contributors.map((n) => `start:${n}`)
const stopped = [...contributors].reverse().map((n) => `stop:${n}`)
const withContributors = [
  ...started,
  'app:beforeStart hookC=a>b>c',
  'app:afterStart',
  'app:beforeStop',
  'app:afterStop',
  ...stopped,
]

for (const command of ['dev', 'serve'] as const) {
  console.log(
    `--- pikku ${command}: contributor hooks bracket the app lifecycle ---`
  )
  const ok = await run(command)
  assert.deepEqual(
    ok.lines,
    withContributors,
    `${command}: start hooks in needs order, then the app's beforeStart ` +
      `(which sees the contributor-provided service); the app's stops, then ` +
      `stop hooks in reverse. Output:\n${ok.output.slice(-2000)}`
  )

  console.log(
    `--- pikku ${command}: a failing onServerStart aborts startup ---`
  )
  const failedStart = await run(command, {
    env: { PIKKU_HOOK_FAIL: 'start:hook-b' },
    expectStartFailure: true,
  })
  assert.notEqual(failedStart.code, 0, `${command} must exit non-zero`)
  assert.match(
    failedStart.output,
    /Contributor 'hook-b' failed in onServerStart: hook-b start exploded/
  )
  assert.deepEqual(
    failedStart.lines,
    ['start:hook-a', 'start:hook-b'],
    `${command}: nothing after the failing hook ran, the app's beforeStart included`
  )

  console.log(`--- pikku ${command}: every onServerStop is attempted ---`)
  const failedStop = await run(command, {
    env: { PIKKU_HOOK_FAIL: 'stop:hook-c,stop:hook-a' },
  })
  assert.deepEqual(
    failedStop.lines.slice(-3),
    stopped,
    `${command}: stop hooks after the failing one still ran`
  )
  assert.match(
    failedStop.output,
    /contributor 'hook-c' onServerStop: hook-c stop exploded/
  )
  assert.match(
    failedStop.output,
    /contributor 'hook-a' onServerStop: hook-a stop exploded/
  )
}

console.log(
  '--- pikku serve: NODE_ENV=production loads no platform services, as dev does not ---'
)
const production = await run('serve', { env: { NODE_ENV: 'production' } })
assert.deepEqual(production.lines, [
  'app:beforeStart hookC=missing',
  'app:afterStart',
  'app:beforeStop',
  'app:afterStop',
])

console.log('--- a project with no contributors behaves exactly as before ---')
for (const command of ['dev', 'serve'] as const) {
  const plain = await run(command, {
    config: join(scenario, 'pikku.off.config.json'),
  })
  assert.deepEqual(plain.lines, [
    'app:beforeStart hookC=missing',
    'app:afterStart',
    'app:beforeStop',
    'app:afterStop',
  ])
}

rmSync(logFile, { force: true })
console.log('lifecycle: all checks passed')
