import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FabricReport } from './report.function.js'
import { parseAnswer, readConsent } from '../lib/report.js'

const received: { body: any; authorization?: string }[] = []
let status = 200
let server: Server
let dir: string
const cwd = process.cwd()
const tty = process.stdin.isTTY
const env = { ...process.env }

const run = (data: { file?: string; consent?: string } = {}) =>
  FabricReport.func({} as any, data as any, {} as any)

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
  process.chdir(dir)
  const { port } = server.address() as AddressInfo
  process.env.FABRIC_API_URL = `http://127.0.0.1:${port}`
  process.env.FABRIC_REPORT_CONSENT_FILE = join(dir, 'consent.json')
  delete process.env.PIKKU_REPORT
  ;(process.stdin as any).isTTY = false
  received.length = 0
  status = 200
  await writeFile(
    join(dir, 'BUILD-REPORT.md'),
    '# Build report\n\n## Scaffold does not boot\nwhat happened\n'
  )
})

afterEach(async () => {
  process.chdir(cwd)
  process.env = { ...env }
  ;(process.stdin as any).isTTY = tty
  await rm(dir, { recursive: true, force: true })
})

describe('fabric report', () => {
  test('with no saved answer and nobody at the terminal, it sends nothing and asks for one', async () => {
    const result = await run()
    assert.deepEqual(result, {
      sent: false,
      reason: 'unanswered',
      needsConsent: true,
    })
    assert.equal(received.length, 0)
    assert.equal(await readConsent(), null)
  })

  test('yes sends the document anonymously and saves nothing', async () => {
    const result = await run({ consent: 'yes' })
    assert.equal(result.sent, true)
    assert.equal(received.length, 1)
    assert.equal(received[0]!.authorization, undefined)
    assert.match(received[0]!.body.report, /Scaffold does not boot/)
    assert.equal(received[0]!.body.projectId, undefined)
    assert.ok(received[0]!.body.environment.platform)
    assert.equal(await readConsent(), null)
  })

  test('no sends nothing and saves nothing, so the next report asks again', async () => {
    await run({ consent: 'no' })
    assert.equal(received.length, 0)
    assert.equal((await run()).needsConsent, true)
  })

  test('always sends, and every later report goes without asking', async () => {
    await run({ consent: 'always' })
    const later = await run()
    assert.equal(later.sent, true)
    assert.equal(received.length, 2)
  })

  test('never sends nothing, and every later report does nothing at all', async () => {
    await run({ consent: 'never' })
    await rm(join(dir, 'BUILD-REPORT.md'))
    const later = await run()
    assert.deepEqual(later, {
      sent: false,
      reason: 'never',
      needsConsent: false,
    })
    assert.equal(received.length, 0)
  })

  test('an explicit answer replaces a saved never', async () => {
    await run({ consent: 'never' })
    assert.equal((await run({ consent: 'always' })).sent, true)
    assert.equal(await readConsent(), 'always')
  })

  test('PIKKU_REPORT answers for a machine with nobody to ask', async () => {
    process.env.PIKKU_REPORT = 'never'
    assert.equal((await run()).reason, 'never')
    process.env.PIKKU_REPORT = 'always'
    assert.equal((await run()).sent, true)
    assert.equal(existsSync(join(dir, 'consent.json')), false)
  })

  test('an empty report is not sent and not asked about', async () => {
    await writeFile(join(dir, 'BUILD-REPORT.md'), '\n')
    assert.deepEqual(await run(), {
      sent: false,
      reason: 'empty',
      needsConsent: false,
    })
  })

  test('another file can be named', async () => {
    await writeFile(join(dir, 'notes.md'), 'something else broke\n')
    await run({ file: 'notes.md', consent: 'yes' })
    assert.equal(received[0]!.body.report, 'something else broke\n')
  })

  test('a failed send is reported, not thrown', async () => {
    status = 503
    const result = await run({ consent: 'yes' })
    assert.deepEqual(result, {
      sent: false,
      reason: 'fabric answered 503',
      needsConsent: false,
    })
  })

  test('an unknown answer, a missing file and an oversized report are refused', async () => {
    await assert.rejects(run({ consent: 'maybe' }), /--consent is one of/)
    await assert.rejects(run({ file: 'nope.md', consent: 'yes' }), /No report/)
    await writeFile(join(dir, 'BUILD-REPORT.md'), 'x'.repeat(200_001))
    await assert.rejects(run({ consent: 'yes' }), /over 200 KB/)
  })

  test('the saved answer is readable json on the machine', async () => {
    await run({ consent: 'always' })
    const saved = JSON.parse(await readFile(join(dir, 'consent.json'), 'utf8'))
    assert.equal(saved.consent, 'always')
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
