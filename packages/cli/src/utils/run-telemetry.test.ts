import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startRunTelemetry } from './run-telemetry.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'run-telemetry-'))
  delete process.env.PIKKU_TELEMETRY
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const lines = () => {
  const dir = join(root, '.pikku', 'runs')
  const [file] = readdirSync(dir)
  return {
    file,
    records: readFileSync(join(dir, file!), 'utf8').trim().split('\n').map((l) => JSON.parse(l)),
  }
}

describe('run telemetry', () => {
  test('writes process samples and Fabric-shaped invocation records next to the runs', async () => {
    const telemetry = startRunTelemetry({ rootDir: root, command: 'dev' })
    const wire = {
      traceId: 't-1',
      http: { request: { method: () => 'GET', path: () => '/todos' }, response: { statusCode: 200 } },
      session: { userId: 'u1' },
    }
    await telemetry.middleware!({} as any, wire as any, async () => {})
    await assert.rejects(
      telemetry.middleware!({} as any, wire as any, async () => {
        throw new Error('nope')
      })
    )
    telemetry.stop()
    const { file, records } = lines()
    assert.match(file!, new RegExp(`^${telemetry.runId}\\.dev\\.jsonl$`))
    assert.ok(records.every((r) => r.__pikku_telemetry === true))
    const sample = records.find((r) => r.type === 'process')
    assert.equal(sample.command, 'dev')
    assert.ok(sample.memmb > 0 && sample.cpuusageusec >= 0 && sample.heapmb > 0)
    const calls = records.filter((r) => r.type === 'telemetry')
    assert.deepEqual(
      calls.map((c) => [c.wiretype, c.wireid, c.traceid, c.outcome, c.httpstatus, c.tenantuserid]),
      [
        ['http', 'GET:/todos', 't-1', 'ok', 200, 'u1'],
        ['http', 'GET:/todos', 't-1', 'error', 200, 'u1'],
      ]
    )
    assert.equal(calls[1].errorMessage, 'nope')
  })

  test('PIKKU_TELEMETRY=0 writes nothing', () => {
    process.env.PIKKU_TELEMETRY = '0'
    const telemetry = startRunTelemetry({ rootDir: root, command: 'serve' })
    telemetry.stop()
    assert.equal(telemetry.runId, null)
    assert.throws(() => readdirSync(join(root, '.pikku', 'runs')))
  })
})
