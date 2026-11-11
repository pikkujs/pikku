/**
 * A nats-server config for a shared stream with one user per tenant stage, and
 * the exact permission lists those users need. The lists are what Studio would
 * generate; the tests prove they are enough to run a stage and not enough to
 * touch another.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const STREAM = 'PIKKU'

/**
 * Queues the framework registers beside the app's own: recurring cron fires and
 * one-off scheduled RPCs. The app's own come from its build (see `appQueues`).
 */
export const FRAMEWORK_QUEUES = [
  'pikku-recurring-scheduled-task',
  'pikku-mesh-rpc',
]

/**
 * Every queue the built app consumes: its wired queue workers (workflow
 * orchestrators among them, one per workflow) plus the framework's. A stage's
 * permissions list one consumer per entry, so this is what Studio would read
 * from the build to generate them.
 */
export const appQueues = (projectDir: string): string[] => [
  ...Object.keys(
    JSON.parse(
      readFileSync(
        join(
          projectDir,
          '.pikku',
          'queue',
          'pikku-queue-workers-wirings-meta.gen.json'
        ),
        'utf-8'
      )
    )
  ),
  ...FRAMEWORK_QUEUES,
]

export type Stage = {
  project: string
  stage: string
  user: string
  password: string
  queues?: string[]
}

export const queueToken = (queue: string) => queue.replace(/[.*>\s]/g, '_')
export const consumerName = (s: Stage, queue: string) =>
  `${s.project}_${s.stage}_${queueToken(queue)}`
export const prefixOf = (s: Stage) => `pikku.${s.project}.${s.stage}`

export const stagePermissions = (s: Stage) => {
  const prefix = prefixOf(s)
  const consumers = (s.queues ?? []).map((q) => consumerName(s, q))
  return {
    publish: {
      allow: [
        // Its own jobs, and the schedule messages that live beside them.
        `${prefix}.>`,
        // Read-only: the boot check that the shared stream is there and set up.
        `$JS.API.STREAM.INFO.${STREAM}`,
        ...consumers.flatMap((c) => [
          // Create or update the consumer, filtered to this stage's subjects.
          `$JS.API.CONSUMER.CREATE.${STREAM}.${c}.${prefix}.>`,
          `$JS.API.CONSUMER.INFO.${STREAM}.${c}`,
          `$JS.API.CONSUMER.MSG.NEXT.${STREAM}.${c}`,
          `$JS.ACK.${STREAM}.${c}.>`,
        ]),
      ],
    },
    subscribe: { allow: [`_INBOX.${s.project}.${s.stage}.>`] },
  }
}

export const brokerConfig = (opts: {
  port: number
  monitorPort: number
  storeDir: string
  admin: { user: string; password: string }
  stages: Stage[]
}) =>
  `port: ${opts.port}
http: 127.0.0.1:${opts.monitorPort}
server_name: verifier
jetstream { store_dir: "${opts.storeDir}" }
authorization {
  users = [
    { user: "${opts.admin.user}", password: "${opts.admin.password}",
      permissions: { publish: ">", subscribe: ">" } }
${opts.stages
  .map(
    (s) =>
      `    { user: "${s.user}", password: "${s.password}", permissions: ${JSON.stringify(stagePermissions(s))} }`
  )
  .join('\n')}
  ]
}
`

export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })

export const until = async (
  what: string,
  ok: () => boolean | Promise<boolean>,
  ms = 20_000
) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await ok()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timed out waiting for ${what}`)
}

export type Broker = {
  url: string
  port: number
  monitorPort: number
  confPath: string
  proc: ChildProcess
  rewrite(stages: Stage[]): void
  reload(): void
  stop(): void
}

export const startBroker = async (
  bin: string,
  admin: { user: string; password: string },
  stages: Stage[]
): Promise<Broker> => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-nats-verifier-'))
  const port = await freePort()
  const monitorPort = await freePort()
  const confPath = join(dir, 'nats.conf')
  const write = (list: Stage[]) =>
    writeFileSync(
      confPath,
      brokerConfig({
        port,
        monitorPort,
        storeDir: join(dir, 'js'),
        admin,
        stages: list,
      })
    )
  write(stages)
  const proc = spawn(bin, ['-c', confPath], { stdio: 'ignore' })
  await until('nats-server', async () => {
    try {
      return (await fetch(`http://127.0.0.1:${monitorPort}/healthz`)).ok
    } catch {
      return false
    }
  })
  return {
    url: `nats://127.0.0.1:${port}`,
    port,
    monitorPort,
    confPath,
    proc,
    rewrite: write,
    reload: () => {
      proc.kill('SIGHUP')
    },
    stop: () => {
      proc.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
