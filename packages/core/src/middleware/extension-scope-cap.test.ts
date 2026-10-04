import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { extensionScopeCap } from './extension-scope-cap.js'
import { intersectScopes } from '../scopes.js'
import { ForbiddenError } from '../errors/errors.js'
import type { CoreUserSession } from '../types/core.types.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../services/user-session-service.js'

const run = async (
  headers: Record<string, string>,
  session: CoreUserSession | undefined,
  roles: Record<string, string[]>
) => {
  const sessions = new PikkuSessionService<CoreUserSession>()
  if (session) sessions.setInitial(session)
  let nextCalled = false
  await extensionScopeCap({ resolve: (name) => roles[name] })(
    {} as any,
    {
      ...createMiddlewareSessionWireProps(sessions),
      http: { request: { header: (n: string) => headers[n.toLowerCase()] } },
    } as any,
    async () => {
      nextCalled = true
    }
  )
  return { session: sessions.get(), nextCalled }
}

describe('intersectScopes', () => {
  test('keeps the narrower grant when one side is a wildcard', () => {
    assert.deepEqual(intersectScopes(['invoices:*'], ['invoices:read']), [
      'invoices:read',
    ])
    assert.deepEqual(intersectScopes(['invoices:read'], ['invoices:*']), [
      'invoices:read',
    ])
  })

  test('drops what only one side holds', () => {
    assert.deepEqual(
      intersectScopes(
        ['invoices:read', 'admin'],
        ['invoices:read', 'crm:read']
      ),
      ['invoices:read']
    )
  })

  test('fails closed on nothing held or an empty cap', () => {
    assert.deepEqual(intersectScopes(undefined, ['a']), [])
    assert.deepEqual(intersectScopes(['a'], []), [])
  })
})

describe('extensionScopeCap', () => {
  const roles = { invoices: ['invoices:read'] }

  test('narrows an admin to the extension role', async () => {
    const { session, nextCalled } = await run(
      { 'x-pikku-extension': 'invoices' },
      { userId: 'u', scopes: ['admin', 'invoices:*'] },
      roles
    )
    assert.equal(nextCalled, true)
    assert.deepEqual(session?.scopes, ['invoices:read'])
    assert.equal(session?.userId, 'u')
  })

  test('leaves a call that names no extension untouched', async () => {
    const original = { userId: 'u', scopes: ['admin'] }
    const { session } = await run({}, original, roles)
    assert.deepEqual(session, original)
  })

  test('has nothing to narrow without a session', async () => {
    const { session, nextCalled } = await run(
      { 'x-pikku-extension': 'invoices' },
      undefined,
      roles
    )
    assert.equal(nextCalled, true)
    assert.equal(session, undefined)
  })

  test('refuses an extension the host does not know', async () => {
    await assert.rejects(
      run(
        { 'x-pikku-extension': 'ghost' },
        { userId: 'u', scopes: ['admin'] },
        roles
      ),
      ForbiddenError
    )
  })
})
