import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { pikkuState, resetPikkuState } from '@pikku/core/state'

import { agentCredentialCheck } from './agent-credential-check.function.js'

const run = async (services: unknown, agentName: string, session?: unknown) =>
  (await agentCredentialCheck.func(services as never, { agentName }, {
    session,
  } as never))!

const asked: Array<[string, string | undefined]> = []
const credentialService = {
  has: async (name: string, userId?: string) => {
    asked.push([name, userId])
    return name === 'gmail'
  },
}

beforeEach(() => {
  resetPikkuState()
  asked.length = 0
  pikkuState(null, 'agent', 'agentsMeta', {
    mailer: { tools: ['mail:send', 'mail:read', 'plain'] },
    bare: { tools: [] },
  } as any)
  pikkuState(
    null,
    'addons',
    'packages',
    new Map([['mail', { package: '@x/mail' }]]) as any
  )
  pikkuState('@x/mail', 'package', 'credentialsMeta', {
    gmail: { type: 'wire', oauth2: {}, displayName: 'Gmail' },
    slack: { type: 'wire', oauth2: {} },
    apiKey: { type: 'singleton' },
  } as any)
})

test('an unknown agent or one without tools needs nothing', async () => {
  const expected = { requirements: [], allConnected: true }
  assert.deepEqual(await run({ credentialService }, 'nope'), expected)
  assert.deepEqual(await run({ credentialService }, 'bare'), expected)
})

test('lists each wire OAuth credential once, with its connected state', async () => {
  const result = await run({ credentialService }, 'mailer', { userId: 'u1' })
  assert.deepEqual(result, {
    requirements: [
      {
        credentialName: 'gmail',
        displayName: 'Gmail',
        addonNamespace: 'mail',
        connected: true,
      },
      {
        credentialName: 'slack',
        displayName: 'slack',
        addonNamespace: 'mail',
        connected: false,
      },
    ],
    allConnected: false,
  })
})

test('connection status is read for the session user only', async () => {
  await run({ credentialService }, 'mailer', { userId: 'alice' })
  assert.deepEqual(
    asked.map(([, user]) => user),
    ['alice', 'alice']
  )
})

test('without a credential service nothing counts as connected', async () => {
  const result = await run({ credentialService: undefined }, 'mailer', {
    userId: 'u1',
  })
  assert.equal(result.allConnected, false)
  assert.ok(result.requirements.every((r) => !r.connected))
})
