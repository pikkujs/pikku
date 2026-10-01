/**
 * `pikku fabric changes`, run as the built binary against a stand-in fabric-api.
 *
 * The unit tests drive these commands with a mocked rpc and a fake clock, which
 * is exactly what cannot catch a subcommand left unregistered, an argv that
 * parses differently from the input schema, or an event stream that connects
 * but never wakes anything. So this spawns the real CLI and gives it a real
 * HTTP server: `/rpc/<name>` for the calls, `/events/changes:<projectId>` as a
 * live SSE stream. The stand-in is only as clever as the assertions need.
 */
import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ID = 'proj-e2e'
const TOKEN = 'e2e-fabric-token'

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The workspace's built CLI, the same binary `npx pikku` runs from the project. */
const CLI = join(PROJECT_DIR, 'node_modules/@pikku/cli/dist/bin/pikku.js')

interface StubChange {
  changeId: string
  shortId: string
  title: string
  status: 'open' | 'claimed'
  heldUntil: Date | null
}

interface RpcCall {
  name: string
  data: Record<string, unknown>
}

/** The rows `listChanges` serves, the calls it saw, and the open streams. */
const fabric = {
  changes: [] as StubChange[],
  calls: [] as RpcCall[],
  streams: new Set<ServerResponse>(),
  /** When false, `/events/...` answers 404 as a fabric without the route would. */
  eventsRoute: true,
}

const row = (change: StubChange) => ({
  changeId: change.changeId,
  shortId: change.shortId,
  projectId: PROJECT_ID,
  stageId: 'stage-e2e',
  groupId: null,
  title: change.title,
  body: null,
  status: change.status,
  source: 'panel',
  requestedBranch: null,
  route: '/checkout',
  gitSha: null,
  deploymentId: null,
  locale: null,
  viewport: null,
  capture: null,
  screenshotKey: null,
  branch: null,
  headCommit: null,
  resolvedAt: null,
  acknowledgedAt: null,
  resolvedBySandboxId: null,
  resolvedBySandboxSlug: null,
  createdAt: new Date(Date.now() - 120_000),
  // Held is fabric's call, made from the same clock as heldUntil.
  held: !!change.heldUntil && change.heldUntil.getTime() > Date.now(),
  heldUntil: change.heldUntil,
  screenshotUrl: null,
})

const rpc: Record<string, (data: Record<string, unknown>) => unknown> = {
  listChanges: () => ({ changes: fabric.changes.map(row), groups: [] }),
  askChangeQuestion: (data) => threadMessage(data, String(data.question)),
  replyToChange: (data) => threadMessage(data, String(data.body)),
}

const threadMessage = (data: Record<string, unknown>, body: string) => ({
  message: {
    messageId: randomUUID(),
    changeId: String(data.changeId),
    authorKind: 'agent',
    authorName: data.authorName ?? null,
    body,
    attachments: [],
    chosenOption: null,
    createdAt: new Date(),
  },
})

const readBody = async (req: IncomingMessage): Promise<string> => {
  let body = ''
  for await (const chunk of req) body += chunk
  return body
}

const handle = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end()
    return
  }
  const url = new URL(req.url ?? '/', 'http://stub')

  if (
    url.pathname === `/events/${encodeURIComponent(`changes:${PROJECT_ID}`)}`
  ) {
    if (!fabric.eventsRoute) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(': connected\n\n')
    fabric.streams.add(res)
    req.on('close', () => fabric.streams.delete(res))
    return
  }

  const name = url.pathname.match(/^\/rpc\/(\w+)$/)?.[1]
  if (req.method !== 'POST' || !name) {
    res.writeHead(404).end()
    return
  }
  const { data } = JSON.parse(await readBody(req)) as {
    data: Record<string, unknown>
  }
  // Recorded before dispatch, so a call the stand-in cannot answer still counts.
  fabric.calls.push({ name, data })
  const handler = rpc[name]
  if (!handler) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(handler(data)))
}

/** What fabric publishes on `changes:<projectId>` when an item is filed. */
const publish = () => {
  for (const stream of fabric.streams)
    stream.write(`data: ${JSON.stringify({ type: 'filed' })}\n\n`)
}

const until = async (condition: () => boolean, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition never held')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

let server: Server
let apiUrl: string
let home: string

interface CliRun {
  code: number | null
  stdout: string
  stderr: string
  /** Wall-clock time from spawn to exit. */
  ms: number
}

const cli = (args: string[]) => {
  const started = Date.now()
  const child = spawn(process.execPath, [CLI, 'fabric', 'changes', ...args], {
    // A directory that is no git checkout, so nothing links but the env.
    cwd: home,
    env: {
      ...process.env,
      HOME: home,
      FABRIC_API_URL: apiUrl,
      FABRIC_PROJECT_ID: PROJECT_ID,
      NO_COLOR: '1',
    },
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
  const done = new Promise<CliRun>((resolve) =>
    child.on('close', (code) =>
      resolve({ code, stdout, stderr, ms: Date.now() - started })
    )
  )
  return { done, stderr: () => stderr }
}

const run = (args: string[]) => cli(args).done

const file = (shortId: string, heldUntil: Date | null = null): StubChange => {
  const change: StubChange = {
    changeId: randomUUID(),
    shortId,
    title: `Item ${shortId}`,
    status: 'open',
    heldUntil,
  }
  fabric.changes.push(change)
  return change
}

describe('pikku fabric changes, against fabric-api over HTTP', () => {
  before(async () => {
    server = createServer((req, res) => {
      handle(req, res).catch((error) => {
        res.writeHead(500).end(String(error))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    home = await mkdtemp(join(tmpdir(), 'pikku-fabric-changes-'))
    await mkdir(join(home, '.fabric'))
    await writeFile(
      join(home, '.fabric', 'auth.json'),
      JSON.stringify({ tokens: { [apiUrl]: TOKEN } })
    )
  })

  beforeEach(() => {
    fabric.changes = []
    fabric.calls = []
    fabric.eventsRoute = true
  })

  after(async () => {
    for (const stream of fabric.streams) stream.end()
    server?.closeAllConnections()
    await new Promise((resolve) => server?.close(resolve))
    if (home) await rm(home, { recursive: true, force: true })
  })

  test('reply posts on the thread and leaves the item as it was', async () => {
    const change = file('7')

    const result = await run([
      'reply',
      change.changeId,
      '--message',
      'Not doing this: the copy is set by legal.',
      '--author-name',
      'claude-code',
    ])

    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Replied — the item keeps its status\./)
    assert.match(result.stdout, /the copy is set by legal/)
    const replies = fabric.calls.filter((c) => c.name === 'replyToChange')
    assert.equal(replies.length, 1)
    assert.equal(replies[0]!.data.changeId, change.changeId)
    assert.equal(
      replies[0]!.data.body,
      'Not doing this: the copy is set by legal.'
    )
    assert.equal(replies[0]!.data.authorName, 'claude-code')
    assert.equal(
      replies[0]!.data.projectId,
      undefined,
      'a uuid names the change alone, so it works from any directory'
    )
  })

  test('a short id is sent for fabric to look up inside the linked project', async () => {
    file('7')

    const result = await run([
      'reply',
      '#7',
      '--message',
      'Blocked on the pricing API.',
    ])

    assert.equal(result.code, 0, result.stderr)
    const [reply] = fabric.calls.filter((c) => c.name === 'replyToChange')
    assert.equal(reply!.data.changeId, '#7')
    assert.equal(reply!.data.projectId, PROJECT_ID)
    assert.equal(
      fabric.calls.filter((c) => c.name === 'listChanges').length,
      0,
      'the CLI no longer lists the project to resolve a short id'
    )
  })

  test('a reply is sent without the whitespace around it', async () => {
    const change = file('8')

    const result = await run([
      'reply',
      change.changeId,
      '--message',
      '  Blocked on the pricing API.  ',
    ])

    assert.equal(result.code, 0, result.stderr)
    const [reply] = fabric.calls.filter((c) => c.name === 'replyToChange')
    assert.equal(reply!.data.body, 'Blocked on the pricing API.')
  })

  // The input schemas reach the CLI as JSON schema, which keeps a pattern but
  // not a zod transform: `.trim().min(1)` let "   " through as three characters.
  for (const [command, args] of [
    ['reply', ['--message', '   ']],
    ['ask', ['--question', '   ']],
  ] as const) {
    test(`a blank ${command} is refused before anything is sent`, async () => {
      const change = file('8')
      const ref =
        command === 'reply'
          ? [change.changeId]
          : ['--change-id', change.changeId]

      const result = await run([command, ...ref, ...args])

      assert.notEqual(
        result.code,
        0,
        `${command} accepted a blank:\n${result.stdout}`
      )
      assert.deepEqual(fabric.calls, [], 'nothing reached fabric')
    })
  }

  test('list says when a held item becomes claimable', async () => {
    const at = new Date(Date.now() + 10 * 60_000)
    file('9', at)

    const result = await run(['list'])

    assert.equal(result.code, 0, result.stderr)
    const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    assert.match(result.stdout, new RegExp(`claimable at ${clock}`))
  })

  test('next is woken by a change event, not by its poll interval', async () => {
    const next = cli(['next', '--interval', '60', '--timeout', '45'])
    await until(
      () =>
        fabric.streams.size > 0 &&
        fabric.calls.some((c) => c.name === 'listChanges')
    )
    const listsBefore = fabric.calls.filter(
      (c) => c.name === 'listChanges'
    ).length

    const filedAt = Date.now()
    file('12')
    publish()
    const result = await next.done

    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Ready to claim \(1\)/)
    assert.match(result.stdout, /#12 {2}Item 12/)
    assert.ok(
      Date.now() - filedAt < 10_000,
      `next took ${Date.now() - filedAt}ms after the event; the poll interval is 60s`
    )
    assert.equal(
      fabric.calls.filter((c) => c.name === 'listChanges').length,
      listsBefore + 1,
      'one event, one re-read of the list'
    )
  })

  test('next sleeps until a held item is claimable, with no event', async () => {
    file('13', new Date(Date.now() + 3_000))

    const result = await run(['next', '--interval', '60', '--timeout', '45'])

    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /#13 {2}Item 13/)
    assert.ok(
      result.ms < 20_000,
      `next took ${result.ms}ms for a 3s hold; it should not wait out the 60s interval`
    )
  })

  test('without an events route, next says so and falls back to its interval', async () => {
    fabric.eventsRoute = false
    const next = cli(['next', '--interval', '5', '--timeout', '45'])
    await until(() => /polling instead/.test(next.stderr()))

    file('14')
    const result = await next.done

    assert.equal(result.code, 0, result.stderr)
    assert.match(
      result.stderr,
      /fabric has no change events for this session \(404\)/
    )
    assert.match(result.stdout, /#14 {2}Item 14/)
  })

  test('next --timeout exits 2 when nothing arrives', async () => {
    const result = await run(['next', '--interval', '60', '--timeout', '2'])

    assert.equal(result.code, 2, result.stderr)
    assert.match(result.stdout, /Nothing to pick up\./)
  })
})
