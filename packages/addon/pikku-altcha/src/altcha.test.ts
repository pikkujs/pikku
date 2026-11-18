import { strict as assert } from 'assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { solveChallenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { createBunSqliteKysely } from '@pikku/kysely-bun-sqlite'
import { sql, type Kysely } from 'kysely'
import { AltchaService } from './services/altcha.service.js'
import { verifyChallenge } from './functions/verify-challenge.function.js'
import { getChallenge } from './functions/get-challenge.function.js'
import { VerifyChallengeInput } from './lib/altcha.schemas.js'

const SECRET = 'a'.repeat(40)
const KEY_SECRET = 'b'.repeat(40)
const COST = 10

const solved = async (altcha: AltchaService): Promise<string> => {
  const challenge = await altcha.issue()
  const solution = await solveChallenge({ challenge, deriveKey })
  assert.ok(solution, 'the widget side must find a solution')
  return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64')
}

const refusal = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise
  } catch (error: any) {
    return String(error.message).split(':')[0]
  }
  return 'accepted'
}

describe('AltchaService', () => {
  const altcha = new AltchaService(SECRET, KEY_SECRET, COST)
  const realNow = Date.now

  afterEach(() => {
    Date.now = realNow
  })

  test('accepts a challenge it issued and solved', async () => {
    const { id, expiry } = await altcha.check(await solved(altcha))
    assert.ok(id.length > 0)
    assert.ok(expiry > Date.now())
  })

  test('refuses a missing, unreadable or incomplete payload', async () => {
    assert.equal(await refusal(altcha.check('')), 'CAPTCHA_INVALID')
    assert.equal(
      await refusal(altcha.check('not base64 json')),
      'CAPTCHA_INVALID'
    )
    const bare = Buffer.from(JSON.stringify({ challenge: {} })).toString(
      'base64'
    )
    assert.equal(await refusal(altcha.check(bare)), 'CAPTCHA_INVALID')
  })

  test('refuses a payload signed with other secrets', async () => {
    const other = new AltchaService('c'.repeat(40), 'd'.repeat(40), COST)
    assert.equal(
      await refusal(altcha.check(await solved(other))),
      'CAPTCHA_INVALID'
    )
  })

  test('refuses tampered parameters', async () => {
    const payload = JSON.parse(
      Buffer.from(await solved(altcha), 'base64').toString('utf8')
    )
    payload.challenge.parameters.cost = 1
    const tampered = Buffer.from(JSON.stringify(payload)).toString('base64')
    assert.equal(await refusal(altcha.check(tampered)), 'CAPTCHA_INVALID')
  })

  test('refuses a wrong solution', async () => {
    const payload = JSON.parse(
      Buffer.from(await solved(altcha), 'base64').toString('utf8')
    )
    payload.solution.derivedKey = '00'.repeat(32)
    const wrong = Buffer.from(JSON.stringify(payload)).toString('base64')
    assert.equal(await refusal(altcha.check(wrong)), 'CAPTCHA_INVALID')
  })

  test('refuses a challenge solved after its expiry', async () => {
    const payload = await solved(altcha)
    Date.now = () => realNow() + 6 * 60 * 1000
    assert.equal(await refusal(altcha.check(payload)), 'CAPTCHA_EXPIRED')
  })
})

describe('verifyChallenge', () => {
  let kysely: Kysely<any>
  let altcha: AltchaService
  const run = (payload: string) =>
    (verifyChallenge as any).func({ kysely, altcha }, { payload }, {})

  beforeEach(async () => {
    kysely = createBunSqliteKysely({ filename: ':memory:' }) as Kysely<any>
    await sql`create table captcha_used_challenge (id text primary key, expiry timestamp not null)`.execute(
      kysely
    )
    altcha = new AltchaService(SECRET, KEY_SECRET, COST)
  })

  afterEach(async () => {
    await kysely.destroy()
  })

  test('accepts a valid solution', async () => {
    assert.deepEqual(await run(await solved(altcha)), { verified: true })
  })

  test('an empty payload is a captcha refusal, not a schema error', async () => {
    assert.ok(VerifyChallengeInput.safeParse({ payload: '' }).success)
    assert.equal(await refusal(run('')), 'CAPTCHA_INVALID')
  })

  test('refuses a missing or invalid payload and records nothing', async () => {
    assert.equal(await refusal(run('')), 'CAPTCHA_INVALID')
    assert.equal(await refusal(run('garbage')), 'CAPTCHA_INVALID')
    const rows = await kysely
      .selectFrom('captcha_used_challenge')
      .selectAll()
      .execute()
    assert.equal(rows.length, 0)
  })

  test('refuses a reused solution', async () => {
    const payload = await solved(altcha)
    await run(payload)
    assert.equal(await refusal(run(payload)), 'CAPTCHA_REUSED')
  })

  test('lets only one of two concurrent submissions through', async () => {
    const payload = await solved(altcha)
    const outcomes = await Promise.all([
      refusal(run(payload)),
      refusal(run(payload)),
    ])
    assert.deepEqual(outcomes.sort(), ['CAPTCHA_REUSED', 'accepted'])
  })

  test('refuses an expired solution', async () => {
    const payload = await solved(altcha)
    const realNow = Date.now
    Date.now = () => realNow() + 6 * 60 * 1000
    try {
      assert.equal(await refusal(run(payload)), 'CAPTCHA_EXPIRED')
    } finally {
      Date.now = realNow
    }
  })

  test('prunes spent rows past their expiry', async () => {
    await kysely
      .insertInto('captcha_used_challenge')
      .values({ id: 'old', expiry: new Date(Date.now() - 1000) })
      .execute()
    await run(await solved(altcha))
    const ids = (
      await kysely.selectFrom('captcha_used_challenge').select('id').execute()
    ).map((r) => r.id)
    assert.ok(!ids.includes('old'))
  })
})

describe('getChallenge', () => {
  test('issues a signed challenge that expires', async () => {
    const challenge = await (getChallenge as any).func(
      { altcha: new AltchaService(SECRET, KEY_SECRET, COST) },
      undefined,
      {}
    )
    assert.ok(challenge.signature)
    assert.ok(challenge.parameters.expiresAt * 1000 > Date.now())
  })
})
