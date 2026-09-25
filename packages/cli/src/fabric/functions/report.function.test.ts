import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FabricReport } from './report.function.js'
import { parseAnswer, readConsent } from '../lib/report.js'
import { readHeld, runIdFor } from '../lib/held-findings.js'

const received: { body: any; authorization?: string }[] = []
let status = 200
let server: Server
let dir: string
const cwd = process.cwd()
const tty = process.stdin.isTTY
const env = { ...process.env }

const finding = (title: string) => ({
  title,
  kind: 'product',
  model: 'claude-opus-5',
  expected: 'the scaffold to boot',
  actual: 'it failed on a missing agent schema',
  workaround: 'added the schema by hand',
  unresolved: false,
})

const run = (data: Record<string, unknown> = {}) =>
  FabricReport.func({} as any, { unresolved: false, ...data } as any, {} as any)

const heldNow = async () => (await readHeld(await runIdFor())).length

before(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      received.push({
        body: JSON.parse(raw),
        authorization: req.headers.authorization,
      })
      res.writeHead(status).end()
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
})

after(() => server.close())

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pikku-report-'))
  await mkdir(join(dir, 'app'))
  await writeFile(join(dir, 'app', 'pikku.config.json'), '{}')
  process.chdir(join(dir, 'app'))
  const { port } = server.address() as AddressInfo
  process.env.FABRIC_API_URL = `http://127.0.0.1:${port}`
  process.env.FABRIC_FINDINGS_DIR = join(dir, 'findings')
  process.env.FABRIC_REPORT_CONSENT_FILE = join(dir, 'consent.json')
  delete process.env.PIKKU_REPORT
  ;(process.stdin as any).isTTY = false
  received.length = 0
  status = 200
})

afterEach(async () => {
  process.chdir(cwd)
  process.env = { ...env }
  ;(process.stdin as any).isTTY = tty
  await rm(dir, { recursive: true, force: true })
})

describe('fabric report, with no saved answer', () => {
  test('a finding is held, not sent', async () => {
    const result = await run(finding('Scaffold does not boot'))
    assert.deepEqual(result, { sent: 0, held: 1, needsConsent: false })
    assert.equal(received.length, 0)
  })

  test('at hand-over it lists what is held and asks for an answer', async () => {
    await run(finding('Scaffold does not boot'))
    await run(finding('Test accounts get no roles'))
    const result = await run()
    assert.deepEqual(result, { sent: 0, held: 2, needsConsent: true })
    assert.equal(received.length, 0)
  })

  test('yes sends every held finding, tied by one run id, anonymously', async () => {
    await run(finding('Scaffold does not boot'))
    await run(finding('Test accounts get no roles'))
    const result = await run({ consent: 'yes' })
    assert.deepEqual(result, { sent: 2, held: 0, needsConsent: false })
    assert.equal(received.length, 2)
    const [first, second] = received.map((r) => r.body.finding)
    assert.equal(first.title, 'Scaffold does not boot')
    assert.equal(first.runId, second.runId)
    assert.equal(received[0]!.authorization, undefined)
    assert.deepEqual(Object.keys(received[0]!.body), ['finding'])
    assert.equal(await readConsent(), null)
  })

  test('no discards them and saves nothing, so the next build asks again', async () => {
    await run(finding('Scaffold does not boot'))
    assert.equal((await run({ consent: 'no' })).reason, 'no')
    assert.equal(await heldNow(), 0)
    await run(finding('Another one'))
    assert.equal((await run()).needsConsent, true)
  })

  test('nothing held means nothing to ask', async () => {
    assert.deepEqual(await run(), { sent: 0, held: 0, needsConsent: false })
  })

  test('a failed send keeps what was not sent', async () => {
    await run(finding('Scaffold does not boot'))
    status = 503
    const result = await run({ consent: 'yes' })
    assert.equal(result.sent, 0)
    assert.equal(result.held, 1)
    assert.equal(await heldNow(), 1)
  })
})

describe('fabric report, always', () => {
  test('sends each finding the moment it is filed', async () => {
    await run(finding('Scaffold does not boot'))
    await run({ consent: 'always' })
    const result = await run(finding('Test accounts get no roles'))
    assert.deepEqual(result, { sent: 1, held: 0, needsConsent: false })
    assert.equal(received.length, 2)
    assert.equal(await readConsent(), 'always')
  })
})

describe('fabric report, never', () => {
  test('does nothing at all afterwards, not even check the finding', async () => {
    await run(finding('Scaffold does not boot'))
    await run({ consent: 'never' })
    assert.equal(await heldNow(), 0)
    const result = await run({ title: 'half a finding' })
    assert.deepEqual(result, {
      sent: 0,
      held: 0,
      needsConsent: false,
      reason: 'never',
    })
    assert.equal(received.length, 0)
  })

  test('an explicit answer replaces it', async () => {
    await run({ consent: 'never' })
    await run({ consent: 'always' })
    assert.equal((await run(finding('Back on'))).sent, 1)
  })
})

describe('fabric report, on a machine with nobody to ask', () => {
  test('PIKKU_REPORT answers without saving', async () => {
    process.env.PIKKU_REPORT = 'always'
    assert.equal((await run(finding('Sent'))).sent, 1)
    process.env.PIKKU_REPORT = 'never'
    assert.equal((await run(finding('Dropped'))).reason, 'never')
    assert.equal(existsSync(join(dir, 'consent.json')), false)
  })
})

describe('fabric report, run ids', () => {
  test('one per checkout, found from any directory inside it', async () => {
    const id = await runIdFor()
    await mkdir(join(dir, 'app', 'packages'))
    process.chdir(join(dir, 'app', 'packages'))
    assert.equal(await runIdFor(), id)
    await mkdir(join(dir, 'other'))
    process.chdir(join(dir, 'other'))
    assert.notEqual(await runIdFor(), id)
  })
})

describe('fabric report, refusals', () => {
  test('an unknown answer and a malformed finding are refused', async () => {
    await assert.rejects(run({ consent: 'maybe' }), /--consent is one of/)
    await assert.rejects(run({ title: 'half a finding' }), /kind/)
    await assert.rejects(
      run({ ...finding('No workaround'), workaround: undefined }),
      /--workaround/
    )
  })
})

describe('parseAnswer', () => {
  test('takes the words and the prompt letters', () => {
    assert.equal(parseAnswer('Y'), 'yes')
    assert.equal(parseAnswer(' always '), 'always')
    assert.equal(parseAnswer('v'), 'never')
    assert.equal(parseAnswer('sure'), null)
  })
})
