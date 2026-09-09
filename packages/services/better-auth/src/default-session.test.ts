import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { defaultSession } from './default-session.js'

describe('defaultSession', () => {
  test("carries the organization plugin's active org onto the session", () => {
    assert.deepEqual(
      defaultSession({
        user: { id: 'u_1' },
        session: { activeOrganizationId: 'org_1' },
      }),
      { userId: 'u_1', orgId: 'org_1' }
    )
  })

  test('omits orgId rather than setting it null when there is no active org', () => {
    for (const session of [
      { activeOrganizationId: null },
      {},
      null,
      undefined,
    ]) {
      const mapped = defaultSession({ user: { id: 'u_1' }, session })
      assert.deepEqual(mapped, { userId: 'u_1' })
      assert.ok(!('orgId' in mapped))
    }
  })
})
