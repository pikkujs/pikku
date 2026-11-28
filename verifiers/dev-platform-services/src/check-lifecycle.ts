// Drives real `pikku dev` and `pikku serve` processes against scenarios/lifecycle
// and reads back what the app's serverLifecycle saw, with and without a host's
// platform services. Every lifecycle hook appends a line to PIKKU_HOOK_LOG.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocalVariablesService } from '@pikku/core/services'
import { createScriptContent, getText, hasKey } from './script-content.js'

const here = dirname(fileURLToPath(import.meta.url))
const scenario = resolve(here, '../scenarios/lifecycle')
const pikku = resolve(here, '../../../packages/cli/dist/bin/pikku.js')
const scratch = resolve(here, '../.tmp')
mkdirSync(scratch, { recursive: true })
const logFile = join(scratch, `pikku-hook-log-${process.pid}.log`)
const stopLogFile = join(scratch, `pikku-host-stop-${process.pid}.log`)
const stopLogKey = basename(stopLogFile)
// The hooks write through the content service, into
// `<scratch>/private/hooks/<basename>`; read it back the same way.
const logStore = createScriptContent(dirname(logFile))
const logKey = basename(logFile)
const clear = async (key: string) => {
  if (await hasKey(logStore, 'hooks', key))
    await logStore.deleteFile({ bucket: 'hooks', key })
}
const clearLog = () => clear(logKey)
const clearStopLog = () => clear(stopLogKey)

interface Run {
  lines: string[]
  output: string
  code: number | null
}

/**
 * Starts the command and, once it prints its ready line, interrupts it the way
 * a user would.
 */
const run = async (
  command: 'dev' | 'serve',
  options: {
    env?: Record<string, string>
    config?: string
    platformServices?: string
  } = {}
): Promise<Run> => {
  await clearLog()
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      'node',
      [
        pikku,
        command,
        '--port',
        '0',
        ...(options.config ? ['-c', options.config] : []),
        ...(options.platformServices
          ? ['--platform-services', options.platformServices]
          : []),
      ],
      {
        cwd: scenario,
        env: {
          ...new LocalVariablesService().getAll(),
          PIKKU_HOOK_LOG: logFile,
          ...options.env,
        },
        stdio: 'pipe',
        // Its own process group, so Ctrl-C can be sent the way a terminal sends it:
        // the CLI re-execs under bun and relies on the group, not a forward.
        detached: true,
      }
    )
    let output = ''
    let ready = false
    let interrupted = false
    const timer = setTimeout(() => {
      process.kill(-child.pid!, 'SIGKILL')
      reject(new Error(`pikku ${command} timed out:\n${output.slice(-3000)}`))
    }, 120_000)
    const collect = (chunk: Buffer) => {
      output += chunk.toString()
      if (!ready && /pikku: ready on /.test(output)) {
        ready = true
        // Give the post-start work a moment to settle before interrupting.
        setTimeout(() => {
          interrupted = true
          process.kill(-child.pid!, 'SIGINT')
        }, 500)
      }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (!interrupted) {
        reject(
          new Error(
            `pikku ${command} exited (${code}) before becoming ready:\n${output.slice(-3000)}`
          )
        )
        return
      }
      void (async () => {
        resolvePromise({
          lines: (await hasKey(logStore, 'hooks', logKey))
            ? (await getText(logStore, 'hooks', logKey))
                .trim()
                .split('\n')
                .filter(Boolean)
            : [],
          output,
          code,
        })
      })()
    })
  })
}

const appLines = (hostTag: string) => [
  `app:beforeStart hostTag=${hostTag}`,
  'app:afterStart',
  'app:beforeStop',
  'app:afterStop',
]

for (const command of ['dev', 'serve'] as const) {
  console.log(`--- pikku ${command}: the app lifecycle runs in order ---`)
  const plain = await run(command)
  assert.deepEqual(plain.lines, appLines('missing'), plain.output.slice(-2000))

  console.log(
    `--- pikku ${command}: --platform-services supplies a service and stops it ---`
  )
  await clearStopLog()
  const hosted = await run(command, {
    platformServices: './host/platform-services.ts',
    env: { PIKKU_HOST_TAG: 'from-host', PIKKU_HOST_STOP_LOG: stopLogFile },
  })
  assert.deepEqual(
    hosted.lines,
    appLines('from-host'),
    `${command}: the app got the host's service. Output:\n${hosted.output.slice(-2000)}`
  )
  assert.equal(
    await getText(logStore, 'hooks', stopLogKey),
    'host:stop',
    `${command}: the host service's stop() ran at shutdown`
  )
}

for (const command of ['dev', 'serve'] as const) {
  console.log(
    `--- pikku ${command}: an app with no server lifecycle starts ---`
  )
  const bare = await run(command, {
    config: join(scenario, 'pikku.no-lifecycle.config.json'),
  })
  assert.deepEqual(bare.lines, [], bare.output.slice(-2000))
  assert.doesNotMatch(bare.output, /TypeError/)
}

await clearLog()
await clearStopLog()
console.log('lifecycle: all checks passed')
