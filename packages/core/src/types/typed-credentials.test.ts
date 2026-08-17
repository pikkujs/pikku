import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { CoreUserSession, GetCredential, PikkuWire } from './core.types.js'
import type { PikkuRPC } from '../wirings/rpc/rpc-types.js'
import type { PikkuWorkflowWire } from '../wirings/workflow/workflow.types.js'
import type { PikkuScenarioWire } from '../wirings/workflow/scenario.types.js'
import type { ScenarioPersonas } from '../services/personas-service.js'

interface CredentialsMap {
  slack: { token: string }
  stripe: { apiKey: string; accountId: string }
}

type TypedWire = PikkuWire<
  unknown,
  unknown,
  false,
  CoreUserSession,
  PikkuRPC,
  null,
  never,
  PikkuWorkflowWire,
  unknown,
  PikkuScenarioWire<any>,
  ScenarioPersonas,
  CredentialsMap
>

const VALUES: Record<string, unknown> = {
  slack: { token: 'xoxb-1' },
  stripe: { apiKey: 'sk-1', accountId: 'acct-1' },
  'not-in-the-map': { anything: true },
}

// Mirrors `createWireServicesCredentialWireProps`, so this also pins that a
// generic single-signature implementation still satisfies the overload pair.
const getCredential: NonNullable<TypedWire['getCredential']> = <T = unknown>(
  name: string
) => (VALUES[name] ?? null) as T | null

describe('wire.getCredential is typed by the generated CredentialsMap', () => {
  test('resolves a mapped name without an explicit type argument', async () => {
    const slack: { token: string } | null | Promise<{ token: string } | null> =
      getCredential('slack')
    assert.deepEqual(await slack, { token: 'xoxb-1' })

    const stripe = await getCredential('stripe')
    assert.equal(stripe?.accountId, 'acct-1')
  })

  test('rejects the wrong type for a mapped name', () => {
    // @ts-expect-error 'slack' resolves to { token: string }, not a string
    const wrong: string | null | Promise<string | null> = getCredential('slack')
    assert.ok(wrong)
  })

  test('keeps an unmapped name callable with an explicit type argument', async () => {
    const other = await getCredential<{ anything: boolean }>('not-in-the-map')
    assert.equal(other?.anything, true)
  })

  test('falls back to unknown when no map is bound', async () => {
    const untyped: GetCredential = <T = unknown>(name: string) =>
      (VALUES[name] ?? null) as T | null
    // @ts-expect-error no map is bound, so the value is unknown
    const wrong: { token: string } | null = await untyped('slack')
    assert.deepEqual(wrong, { token: 'xoxb-1' })
    assert.deepEqual(await untyped<{ token: string }>('slack'), {
      token: 'xoxb-1',
    })
  })
})
