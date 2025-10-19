import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import { ForbiddenError, ConflictError } from '@pikku/core/errors'
import { requireAccountAdmin } from '../permissions.js'

/**
 * Complex orchestration function using RPC
 * This is a GOOD use of RPC - orchestrating multiple steps
 */
export const closeAccount = pikkuFunc<{ accountId: string }, { closed: true }>({
  docs: {
    summary: 'Close an account',
    description:
      'Orchestrates account closure including sessions, keys, and notifications',
    tags: ['accounts', 'orchestration'],
    errors: ['ForbiddenError', 'ConflictError'],
  },
  // ✅ CORRECT: Permissions attached as function property
  permissions: {
    admin: requireAccountAdmin,
  },
  // ✅ CORRECT: Multiple services destructured in parameter list
  func: async ({ rpc, audit }, { accountId }) => {
    // Orchestrate multiple steps via RPC
    // This is appropriate because each step is non-trivial
    await rpc.invoke('beginAccountClosure', { accountId })
    await rpc.invoke('flushUserSessions', { accountId })
    await rpc.invoke('revokeKeysAndNotify', { accountId })

    // Log the action
    await audit.log('account.closed', { accountId })

    return { closed: true }
  },
})

/**
 * Example of what NOT to do - wrapping trivial service calls in RPC
 */
// ❌ BAD EXAMPLE - Don't do this:
/*
export const loadCard = pikkuFunc<{ cardId: string }, Card>({
  func: async ({ rpc }, { cardId }) => {
    // DON'T wrap simple service calls in RPC
    return await rpc.invoke('getCard', { cardId })
  }
})
*/

// ✅ GOOD - Call the service directly for simple CRUD:
/*
export const loadCard = pikkuFunc<{ cardId: string }, Card>({
  func: async ({ store }, { cardId }) => {
    return await store.getCard(cardId)
  }
})
*/
