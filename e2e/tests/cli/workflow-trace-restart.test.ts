/**
 * `kill -9` mid-sleep and restart on the same database: the run still holds the
 * trace its first step ran on, which is what every later hop continues. It needs a process to kill, which is why this is not
 * a scenario, and a file database, because `:memory:` dies with it.
 */
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { startBackend } from '../../bin/backend-harness.js'

const dir = mkdtempSync(join(tmpdir(), 'pikku-trace-restart-'))
process.env.SQLITE_PATH = join(dir, 'runs.sqlite')
process.env.CHAOS_LEDGER_DIR = dir

let server: Awaited<ReturnType<typeof startBackend>> | undefined

after(() => {
  server?.stop('SIGKILL')
  rmSync(dir, { recursive: true, force: true })
})

const effects = (): Array<{
  key: string
  traceId?: string
  spanId?: string
}> => {
  try {
    return readFileSync(join(dir, 'chaos-ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

const waitFor = async (check: () => boolean, what: string) => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail(`Timed out waiting for ${what}: ${JSON.stringify(effects())}`)
}

const post = async (apiUrl: string, path: string, body: unknown) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  assert.ok(response.ok, `${path}: ${response.status} ${text}`)
  return text ? JSON.parse(text) : undefined
}

test('a run killed in a sleep still holds its trace after a restart', async () => {
  const tag = 'restart'
  server = await startBackend()
  await server.waitUntilReady({ timeoutMs: 120_000 })
  const { apiUrl } = server

  const { runId } = await post(apiUrl, '/workflow/chaosRestartWorkflow/start', {
    data: { tag, sleepFor: '3s' },
  })
  await waitFor(
    () => effects().some(({ key }) => key === `phase1:${tag}`),
    'phase one'
  )
  await new Promise((resolve) => setTimeout(resolve, 300))

  server.stop('SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 500))

  server = await startBackend({ apiUrl })
  await server.waitUntilReady({ timeoutMs: 120_000 })
  assert.equal(effects().length, 1, 'the kill landed before phase two')

  const { traceparent } = await post(apiUrl, '/rpc/chaosRunTrace', {
    data: { runId },
  })
  assert.equal(traceparent?.split('-')[1], effects()[0]?.traceId)
})
