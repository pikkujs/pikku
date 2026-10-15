import { describe, test } from 'node:test'
import assert from 'node:assert'

import { resolveOrganizationId } from './organization.js'
import { CloudPreconditionError } from '../../utils/precondition-error.js'
import type { getCloudRPC } from './http.js'

type Org = {
  organizationId: string
  slug: string
  name: string
}

const rpcReturning = (organizations: Org[]) =>
  ({
    invoke: async () => ({ organizations }),
  }) as unknown as ReturnType<typeof getCloudRPC>

const rpcThatMustNotBeCalled = () =>
  ({
    invoke: async () => {
      throw new Error('listMyOrganizations should not have been called')
    },
  }) as unknown as ReturnType<typeof getCloudRPC>

const orgs: Org[] = [
  {
    organizationId: '11111111-1111-4111-8111-111111111111',
    slug: 'pikkustudio',
    name: 'Pikku Pikku Studio Cloud',
  },
  {
    organizationId: '22222222-2222-4222-8222-222222222222',
    slug: 'vlandor',
    name: 'Vlandor GmbH',
  },
]

describe('--organization accepts a slug, a name or an id', () => {
  test('no flag leaves the org to the session', async () => {
    assert.strictEqual(
      await resolveOrganizationId(rpcThatMustNotBeCalled(), undefined),
      undefined
    )
  })

  test('an id passes straight through without a lookup', async () => {
    assert.strictEqual(
      await resolveOrganizationId(
        rpcThatMustNotBeCalled(),
        '22222222-2222-4222-8222-222222222222'
      ),
      '22222222-2222-4222-8222-222222222222'
    )
  })

  test('a slug resolves, case-insensitively', async () => {
    assert.strictEqual(
      await resolveOrganizationId(rpcReturning(orgs), 'VlAnDoR'),
      '22222222-2222-4222-8222-222222222222'
    )
  })

  test('a display name resolves, case-insensitively', async () => {
    assert.strictEqual(
      await resolveOrganizationId(rpcReturning(orgs), 'vlandor gmbh'),
      '22222222-2222-4222-8222-222222222222'
    )
  })

  test('an unknown name refuses, and lists what you do belong to', async () => {
    await assert.rejects(
      () => resolveOrganizationId(rpcReturning(orgs), 'acme'),
      (error: unknown) => {
        assert.ok(error instanceof CloudPreconditionError)
        assert.match(error.message, /pikkustudio, vlandor/)
        return true
      }
    )
  })

  test('an ambiguous name refuses with the ids to choose from', async () => {
    const ambiguous: Org[] = [
      { organizationId: 'a', slug: 'vlandor', name: 'One' },
      { organizationId: 'b', slug: 'other', name: 'vlandor' },
    ]
    await assert.rejects(
      () => resolveOrganizationId(rpcReturning(ambiguous), 'vlandor'),
      (error: unknown) => {
        assert.ok(error instanceof CloudPreconditionError)
        assert.match(error.message, /a, b/)
        return true
      }
    )
  })
})
