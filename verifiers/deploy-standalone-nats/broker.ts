/**
 * A nats-server config with one stream and one user per stage, and
 * the exact permission lists those users need. The lists are what the broker operator
 * would generate; the tests prove they are enough to run a stage and not enough to
 * touch another.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { RetentionPolicy } from '@nats-io/jetstream'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * One stage of one project: a broker user and the stream it owns. The broker
 * operator creates both up front; the app only ever attaches to them.
 */
export type Stage = {
  project: string
  stage: string
  user: string
  password: string
}

export const prefixOf = (s: Stage) => `pikku.${s.project}.${s.stage}`

/** The stage's own stream, `pikku_<project>_<stage>` (what the contributor derives). */
export const streamOf = (s: Stage) => `pikku_${s.project}_${s.stage}`

/**
 * The stream the broker operator creates for a stage. The app never creates or changes it:
 * workqueue so an acked job leaves, schedules on so cron and delays work, and
 * only the stage's own subjects so a schedule cannot name another stage.
 */
export const streamConfig = (s: Stage) => ({
  name: streamOf(s),
  subjects: [`${prefixOf(s)}.>`],
  retention: RetentionPolicy.Workqueue,
  allow_msg_schedules: true,
})

/**
 * What a stage's user may do. Everything is scoped by the stage's own stream
 * name or subject prefix, so the list does not depend on the app's queues.
 * Not granted: creating, updating or deleting any stream, deleting a consumer,
 * `$JS.API.INFO`, listing streams, and anything on another stream.
 */
export const stagePermissions = (s: Stage) => {
  const stream = streamOf(s)
  const prefix = prefixOf(s)
  return {
    publish: {
      allow: [
        `${prefix}.>`,
        // Boot check, and the listing of its own schedules.
        `$JS.API.STREAM.INFO.${stream}`,
        // Prune an orphaned schedule, read one back: only its own stream.
        `$JS.API.STREAM.PURGE.${stream}`,
        `$JS.API.STREAM.MSG.GET.${stream}`,
        `$JS.API.CONSUMER.CREATE.${stream}.>`,
        `$JS.API.CONSUMER.INFO.${stream}.>`,
        `$JS.API.CONSUMER.MSG.NEXT.${stream}.>`,
        `$JS.ACK.${stream}.>`,
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
