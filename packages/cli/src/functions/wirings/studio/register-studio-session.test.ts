import assert from 'node:assert'
import { describe, test } from 'node:test'
import { registerStudioSession, studioSession, STUDIO_HEADER } from './register-studio-session.js'

const TOKEN = 'a'.repeat(40)

const run = async (headers: Record<string, string>, session?: object) => {
  let set: unknown
  const wire = {
    http: { request: { header: (name: string) => headers[name] ?? null } },
    session,
    setSession: (s: unknown) => {
      set = s
    },
  }
  let called = false
  await (studioSession(TOKEN) as any)({}, wire, async () => {
    called = true
  })
  assert.ok(called)
  return set
}

describe('studio session', () => {
  test('the matching token becomes the console owner', async () => {
    assert.deepEqual(await run({ [STUDIO_HEADER]: TOKEN }), { userId: 'studio', scopes: ['pikku:console'] })
  })

  test('a wrong or missing token sets nothing', async () => {
    assert.equal(await run({ [STUDIO_HEADER]: 'b'.repeat(40) }), undefined)
    assert.equal(await run({ [STUDIO_HEADER]: 'short' }), undefined)
    assert.equal(await run({}), undefined)
  })

  test('an existing session is left alone', async () => {
    assert.equal(await run({ [STUDIO_HEADER]: TOKEN }, { userId: 'real' }), undefined)
  })

  test('is only registered with a long enough token', () => {
    assert.equal(registerStudioSession(undefined), false)
    assert.equal(registerStudioSession('short'), false)
  })
})
