import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SPOOL_LIMIT,
  clearSpool,
  flushSpool,
  readSpool,
  spoolFinding,
} from './finding-spool.js'
import type { FindingPayload } from './finding.js'
import type { ReportEnvironment } from './report-environment.js'

const environment: ReportEnvironment = {
  packages: [{ name: '@pikku/cli', version: '0.12.113', linked: false }],
  versionSkew: false,
  linkedFramework: false,
  node: 'v22.0.0',
  packageManager: 'yarn@4.1.0',
  platform: 'darwin-arm64',
}

/** A valid ISO instant `i` minutes after the hour the fixtures use. */
const minutesIn = (i: number): string =>
  new Date(Date.UTC(2026, 7, 29, 14, 0) + i * 60_000).toISOString()

const payload = (overrides: Partial<FindingPayload> = {}): FindingPayload => ({
  title: 'Scaffold never produced a pikku.config.json',
  kind: 'product',
  model: 'claude-opus-5',
  expected: 'create to write a config',
  actual: 'it wrote none',
  workaround: 'wrote one by hand',
  environment,
  reportedAt: '2026-08-29T14:02:11.000Z',
  ...overrides,
})

let dir: string
const previous = process.env.FABRIC_FINDINGS_DIR

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pikku-fabric-spool-'))
  process.env.FABRIC_FINDINGS_DIR = dir
})

afterEach(async () => {
  if (previous === undefined) delete process.env.FABRIC_FINDINGS_DIR
  else process.env.FABRIC_FINDINGS_DIR = previous
  await rm(dir, { recursive: true, force: true })
})

describe('spoolFinding', () => {
  test('holds a finding filed before the repo was ever linked', async () => {
    await spoolFinding({
      payload: payload(),
      reason: 'not-linked',
      projectId: null,
    })

    const spooled = await readSpool()
    assert.equal(spooled.length, 1)
    assert.equal(spooled[0].reason, 'not-linked')
    assert.equal(spooled[0].projectId, null)
    assert.equal(
      spooled[0].payload.title,
      'Scaffold never produced a pikku.config.json'
    )
  })

  test('reads back in the order the findings were filed', async () => {
    for (const reportedAt of [
      '2026-08-29T14:02:11.000Z',
      '2026-08-27T09:00:00.000Z',
      '2026-08-28T22:15:00.000Z',
    ]) {
      await spoolFinding({
        payload: payload({ reportedAt, title: reportedAt }),
        reason: 'not-logged-in',
        projectId: null,
      })
    }

    assert.deepEqual(
      (await readSpool()).map((s) => s.payload.title),
      [
        '2026-08-27T09:00:00.000Z',
        '2026-08-28T22:15:00.000Z',
        '2026-08-29T14:02:11.000Z',
      ]
    )
  })

  test('drops the oldest past the cap so a logged-out machine stays bounded', async () => {
    for (let i = 0; i < SPOOL_LIMIT + 5; i++) {
      await spoolFinding({
        payload: payload({
          reportedAt: minutesIn(i),
          title: `finding ${i}`,
        }),
        reason: 'not-logged-in',
        projectId: null,
      })
    }

    const spooled = await readSpool()
    assert.equal(spooled.length, SPOOL_LIMIT)
    assert.equal(spooled[0].payload.title, 'finding 5')
  })

  test('skips a corrupt entry rather than losing the rest', async () => {
    await spoolFinding({
      payload: payload(),
      reason: 'not-linked',
      projectId: null,
    })
    await writeFile(join(dir, '2026-01-01T00-00-00-000Z-beef.json'), '{ not', 'utf8')

    assert.equal((await readSpool()).length, 1)
  })
})

describe('clearSpool', () => {
  test('empties the queue and says how many it dropped', async () => {
    for (let i = 0; i < 3; i++) {
      await spoolFinding({
        payload: payload({ reportedAt: `2026-08-2${i}T00:00:00.000Z` }),
        reason: 'not-linked',
        projectId: null,
      })
    }

    assert.equal(await clearSpool(), 3)
    assert.deepEqual(await readdir(dir), [])
  })
})

describe('flushSpool', () => {
  test('sends every entry and empties the queue', async () => {
    const seen: string[] = []
    await withServer(
      (body) => {
        seen.push(JSON.parse(body).finding.title)
        return { status: 202 }
      },
      async (apiUrl) => {
        for (const [index, title] of ['first', 'second'].entries()) {
          await spoolFinding({
            payload: payload({ title, reportedAt: minutesIn(index) }),
            reason: 'unreachable',
            projectId: null,
          })
        }

        const result = await flushSpool({
          apiUrl,
          token: 'tok',
          projectId: 'prj_now',
        })

        assert.deepEqual(result, { sent: 2, remaining: 0 })
        assert.deepEqual(await readSpool(), [])
      }
    )
    assert.deepEqual(seen, ['first', 'second'])
  })

  test('keeps the project a finding was filed against, and adopts the current one only when it had none', async () => {
    const projects: string[] = []
    await withServer(
      (body) => {
        projects.push(JSON.parse(body).projectId)
        return { status: 200 }
      },
      async (apiUrl) => {
        await spoolFinding({
          payload: payload({ reportedAt: '2026-08-29T14:00:00.000Z' }),
          reason: 'unreachable',
          projectId: 'prj_then',
        })
        await spoolFinding({
          payload: payload({ reportedAt: '2026-08-29T14:01:00.000Z' }),
          reason: 'not-linked',
          projectId: null,
        })

        await flushSpool({ apiUrl, token: 'tok', projectId: 'prj_now' })
      }
    )
    assert.deepEqual(projects, ['prj_then', 'prj_now'])
  })

  test('stops at the first refusal and leaves the rest queued', async () => {
    let calls = 0
    await withServer(
      () => ({ status: ++calls === 1 ? 200 : 503 }),
      async (apiUrl) => {
        for (const [index, title] of ['first', 'second', 'third'].entries()) {
          await spoolFinding({
            payload: payload({ title, reportedAt: minutesIn(index) }),
            reason: 'unreachable',
            projectId: 'prj_1',
          })
        }

        const result = await flushSpool({
          apiUrl,
          token: 'tok',
          projectId: 'prj_1',
        })

        assert.equal(result.sent, 1)
        assert.equal(result.remaining, 2)
        assert.match(result.reason!, /503/)
        assert.equal((await readSpool()).length, 2)
      }
    )
  })

  test('sends a finding filed from a checkout that never linked a project', async () => {
    let seen: unknown = 'unset'
    await withServer(
      (body) => {
        seen = JSON.parse(body).projectId
        return { status: 202 }
      },
      async (apiUrl) => {
        await spoolFinding({
          payload: payload(),
          reason: 'not-linked',
          projectId: null,
        })

        const result = await flushSpool({
          apiUrl,
          token: 'tok',
          projectId: null,
        })

        assert.deepEqual(result, { sent: 1, remaining: 0 })
        assert.deepEqual(await readSpool(), [])
      }
    )
    assert.equal(seen, null)
  })
})

async function withServer(
  handler: (body: string) => { status: number },
  run: (url: string) => Promise<void>
): Promise<void> {
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      res.writeHead(handler(Buffer.concat(chunks).toString('utf8')).status)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address() as AddressInfo
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
