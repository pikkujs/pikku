import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'
import * as httpLib from '../lib/http.js'

/**
 * The log is read on request and cut to its tail: a build log can be thousands
 * of lines, and dumping it by default buries the line that says why it failed.
 */
const realConfig = { ...configLib }
const realHttp = { ...httpLib }
let override = true

let token: string | null
let log: string | null
const invoked: { name: string; data: unknown }[] = []

await mock.module('../lib/config.js', () => ({
  ...realConfig,
  resolveApiContext: async (opts?: any) =>
    override
      ? { apiUrl: 'https://fabric.test', token, projectId: null }
      : realConfig.resolveApiContext(opts),
}))

await mock.module('../lib/http.js', () => ({
  ...realHttp,
  getFabricRPC: (opts: any) =>
    override
      ? {
          invoke: async (name: string, data: unknown) => {
            invoked.push({ name, data })
            return { log }
          },
        }
      : realHttp.getFabricRPC(opts),
}))

after(() => {
  override = false
})

const { FabricDeployLogs, renderDeployLogs } =
  await import('./deploy-logs.function.js')

const run = (data: Record<string, unknown>) =>
  FabricDeployLogs.func(
    {} as any,
    { deploymentId: 'dep-1', full: false, ...data } as any,
    {} as any
  )

const printed = (result: unknown): string => {
  const lines: string[] = []
  const out = console.log
  console.log = (...args: unknown[]) => lines.push(args.join(' '))
  try {
    renderDeployLogs(null, result as any)
  } finally {
    console.log = out
  }
  return lines.join('\n')
}

const numbered = (n: number) =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')

describe('deploy logs', () => {
  beforeEach(() => {
    token = 'tok'
    log = numbered(300)
    invoked.length = 0
  })

  test('shows only the last 100 lines unless asked for more', async () => {
    const result = await run({})
    assert.equal(result.totalLines, 300)
    assert.equal(result.shownLines, 100)
    assert.match(result.log!, /line 300/)
    assert.doesNotMatch(result.log!, /line 200\b/)
    assert.match(printed(result), /200 earlier line\(s\)/)
  })

  test('--tail narrows it and --full lifts the cut', async () => {
    assert.equal((await run({ tail: 5 })).shownLines, 5)
    const full = await run({ full: true })
    assert.equal(full.shownLines, 300)
    assert.doesNotMatch(printed(full), /earlier line/)
  })

  test('asks for exactly the deployment named', async () => {
    await run({ deploymentId: 'dep-9' })
    assert.deepEqual(invoked, [
      { name: 'getDeploymentBuildLog', data: { deploymentId: 'dep-9' } },
    ])
  })

  test('says so when no build ever produced a log', async () => {
    log = null
    const out = printed(await run({}))
    assert.match(out, /No build log recorded for dep-1/)
  })

  test('refuses without a login', async () => {
    token = null
    await assert.rejects(run({}), /Not logged in/)
  })
})
