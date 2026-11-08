import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as findingLib from '../lib/finding.js'
import { parseAnswer, readConsent } from '../lib/report.js'
import {
  checkoutRoot,
  heldDir,
  readHeld,
  runIdFor,
} from '../lib/held-findings.js'

const invoked: { name: string; data: any }[] = []
let status = 200
let tokenUsed: string | undefined

await mock.module('../lib/finding.js', () => ({
  ...findingLib,
  findingRPC: (_apiUrl: string, token: string) => ({
    invoke: async (name: string, data: unknown) => {
      tokenUsed = token
      if (name === 'cloud:getSession') {
        if (status >= 300) throw new Error('no session')
        return { email: 'owner@example.com' }
      }
      invoked.push({ name, data })
      if (status >= 300) throw Object.assign(new Error('refused'), { status })
      return { findingId: 'f_1' }
    },
  }),
}))

const { CloudReport } = await import('./report.function.js')
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
  CloudReport.func({} as any, { unresolved: false, ...data } as any, {} as any)

const heldNow = async () => (await readHeld(await runIdFor())).length

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pikku-report-'))
  await mkdir(join(dir, 'app'))
  await writeFile(join(dir, 'app', 'pikku.config.json'), '{}')
  process.chdir(join(dir, 'app'))
  process.env.HOME = dir
  process.env.PIKKUSTUDIO_API_URL = 'http://127.0.0.1:1'
  process.env.PIKKUSTUDIO_API_KEY = 'account-token'
  process.env.PIKKUSTUDIO_FINDINGS_DIR = join(dir, 'findings')
  process.env.PIKKUSTUDIO_REPORT_CONSENT_FILE = join(dir, 'consent.json')
  delete process.env.PIKKU_REPORT
  ;(process.stdin as any).isTTY = false
  invoked.length = 0
  status = 200
  tokenUsed = undefined
})

afterEach(async () => {
  process.chdir(cwd)
  process.env = { ...env }
  ;(process.stdin as any).isTTY = tty
  await rm(dir, { recursive: true, force: true })
})

describe('pikku report, with no saved answer', () => {
  test('a finding is held, not sent', async () => {
    const result = await run(finding('Scaffold does not boot'))
    assert.deepEqual(result, { sent: 0, held: 1, needsConsent: false })
    assert.equal(invoked.length, 0)
  })

  test('at hand-over it lists what is held and asks for an answer', async () => {
    await run(finding('Scaffold does not boot'))
    await run(finding('Test accounts get no roles'))
    const result = await run()
    assert.deepEqual(result, {
      sent: 0,
      held: 2,
      needsConsent: true,
      account: 'owner@example.com',
    })
    assert.equal(invoked.length, 0)
  })

  test('when cloud will not say who the token is, the question still names the login', async () => {
    await run(finding('Scaffold does not boot'))
    status = 503
    assert.equal(
      (await run()).account,
      'the PIKKUSTUDIO_API_KEY account on 127.0.0.1:1'
    )
    delete process.env.PIKKUSTUDIO_API_KEY
    await mkdir(join(dir, '.pikkustudio'))
    await writeFile(
      join(dir, '.pikkustudio', 'auth.json'),
      JSON.stringify({ tokens: { 'http://127.0.0.1:1': 'stored-token' } })
    )
    assert.equal((await run()).account, 'your login on 127.0.0.1:1')
  })

  test('yes sends every held finding under the account, tied by one run id', async () => {
    await run(finding('Scaffold does not boot'))
    await run(finding('Test accounts get no roles'))
    const result = await run({ consent: 'yes' })
    assert.deepEqual(result, { sent: 2, held: 0, needsConsent: false })
    assert.equal(invoked.length, 2)
    const [first, second] = invoked.map((r) => r.data.finding)
    assert.equal(first.title, 'Scaffold does not boot')
    assert.equal(first.runId, second.runId)
    assert.equal(invoked[0]!.name, 'submitFinding')
    assert.equal(tokenUsed, 'account-token')
    assert.deepEqual(Object.keys(invoked[0]!.data), ['finding'])
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

describe('pikku report, not logged in', () => {
  beforeEach(() => {
    delete process.env.PIKKUSTUDIO_API_KEY
  })

  test('a finding stays on the computer with no question and no error', async () => {
    const result = await run(finding('Scaffold does not boot'))
    assert.deepEqual(result, {
      sent: 0,
      held: 1,
      needsConsent: false,
      reason: 'not-logged-in',
    })
    assert.equal(invoked.length, 0)
    assert.equal((await run()).needsConsent, false)
  })

  test('yes and always send nothing and keep it held', async () => {
    await run(finding('Scaffold does not boot'))
    assert.equal((await run({ consent: 'yes' })).held, 1)
    assert.equal((await run({ consent: 'always' })).held, 1)
    assert.equal((await run(finding('Another one'))).held, 2)
    assert.equal(invoked.length, 0)
  })

  test('no still discards what is held', async () => {
    await run(finding('Scaffold does not boot'))
    await run({ consent: 'no' })
    assert.equal(await heldNow(), 0)
  })

  test('what was held flushes once logged in', async () => {
    await run(finding('Scaffold does not boot'))
    process.env.PIKKUSTUDIO_API_KEY = 'account-token'
    assert.deepEqual(await run({ consent: 'yes' }), {
      sent: 1,
      held: 0,
      needsConsent: false,
    })
    assert.equal(tokenUsed, 'account-token')
  })

  test('a linked project does not change that', async () => {
    process.env.PIKKUSTUDIO_PROJECT_ID = 'project-1'
    const result = await run(finding('Scaffold does not boot'))
    assert.equal(result.reason, 'not-logged-in')
    assert.equal(invoked.length, 0)
  })

  test('a login that cannot be read is a warning', async () => {
    await mkdir(join(dir, '.pikkustudio'))
    await writeFile(join(dir, '.pikkustudio', 'auth.json'), 'not json')
    const result = await run(finding('Scaffold does not boot'))
    assert.equal(result.held, 1)
    assert.match(result.warnings![0]!, /could not read the login/)
  })
})

describe('pikku report, where it files', () => {
  beforeEach(() => {
    delete process.env.PIKKUSTUDIO_FINDINGS_DIR
  })

  test('.pikku/findings at the checkout root, from any directory inside it', async () => {
    await mkdir(join(dir, 'app', 'packages'))
    process.chdir(join(dir, 'app', 'packages'))
    await run(finding('Scaffold does not boot'))
    const held = await readHeld(await runIdFor())
    assert.equal(held.length, 1)
    assert.ok(held[0]!.file.includes(join('app', '.pikku', 'findings')))
    assert.ok(!existsSync(join(dir, 'app', 'packages', '.pikku')))
  })

  test('PIKKUSTUDIO_FINDINGS_DIR overrides it', async () => {
    process.env.PIKKUSTUDIO_FINDINGS_DIR = join(dir, 'elsewhere')
    assert.equal(heldDir(), join(dir, 'elsewhere'))
  })

  test('never inside .git', async () => {
    await rm(join(dir, 'app', 'pikku.config.json'))
    await mkdir(join(dir, 'app', '.git', 'hooks'), { recursive: true })
    process.chdir(join(dir, 'app', '.git', 'hooks'))
    assert.ok(!heldDir().includes('.git'))
    assert.ok(!checkoutRoot().includes('.git'))
  })

  test('the run id does not depend on the path the checkout is seen at', async () => {
    const id = await runIdFor()
    process.chdir(dir)
    await rename(join(dir, 'app'), join(dir, 'moved'))
    process.chdir(join(dir, 'moved'))
    assert.equal(await runIdFor(), id)
  })
})

describe('pikku report, when nothing can be written', () => {
  test('a failed write warns and returns', async () => {
    await writeFile(join(dir, 'blocked'), '')
    process.env.PIKKUSTUDIO_FINDINGS_DIR = join(dir, 'blocked', 'findings')
    const result = await run(finding('Scaffold does not boot'))
    assert.equal(result.sent, 0)
    assert.equal(result.held, 0)
    assert.match(result.warnings!.join(), /could not keep this finding/)
  })

  test('yes writes nothing to the consent file', async () => {
    process.env.PIKKUSTUDIO_REPORT_CONSENT_FILE = join(
      dir,
      'blocked-home',
      'consent.json'
    )
    await mkdir(join(dir, 'blocked-home'))
    await chmod(join(dir, 'blocked-home'), 0o500)
    await run(finding('Scaffold does not boot'))
    const result = await run({ consent: 'yes' })
    await chmod(join(dir, 'blocked-home'), 0o700)
    assert.deepEqual(result, { sent: 1, held: 0, needsConsent: false })
  })

  test('always and never that cannot be saved warn, and apply to this run', async () => {
    await writeFile(join(dir, 'blocked'), '')
    process.env.PIKKUSTUDIO_REPORT_CONSENT_FILE = join(
      dir,
      'blocked',
      'consent.json'
    )
    await run(finding('Scaffold does not boot'))
    const always = await run({ consent: 'always' })
    assert.equal(always.sent, 1)
    assert.match(always.warnings![0]!, /could not save "always".*PIKKU_REPORT/)

    await run(finding('Another one'))
    const never = await run({ consent: 'never' })
    assert.equal(never.reason, 'never')
    assert.equal(await heldNow(), 0)
    assert.match(never.warnings![0]!, /could not save "never"/)
    assert.equal(await readConsent(), null)
  })
})

describe('pikku report, always', () => {
  test('sends each finding the moment it is filed', async () => {
    await run(finding('Scaffold does not boot'))
    await run({ consent: 'always' })
    const result = await run(finding('Test accounts get no roles'))
    assert.deepEqual(result, { sent: 1, held: 0, needsConsent: false })
    assert.equal(invoked.length, 2)
    assert.equal(await readConsent(), 'always')
  })
})

describe('pikku report, never', () => {
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
    assert.equal(invoked.length, 0)
  })

  test('an explicit answer replaces it', async () => {
    await run({ consent: 'never' })
    await run({ consent: 'always' })
    assert.equal((await run(finding('Back on'))).sent, 1)
  })
})

describe('pikku report, on a machine with nobody to ask', () => {
  test('PIKKU_REPORT answers without saving', async () => {
    process.env.PIKKU_REPORT = 'always'
    assert.equal((await run(finding('Sent'))).sent, 1)
    process.env.PIKKU_REPORT = 'never'
    assert.equal((await run(finding('Dropped'))).reason, 'never')
    assert.equal(existsSync(join(dir, 'consent.json')), false)
  })
})

describe('pikku report, run ids', () => {
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

describe('pikku report, refusals', () => {
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
