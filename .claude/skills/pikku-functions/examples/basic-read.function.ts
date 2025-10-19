import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import { NotFoundError } from '@pikku/core/errors'
import type { Card } from '../types.js'

/**
 * Basic read function with correct service destructuring
 * This function is exposed as an RPC endpoint
 */
export const getCard = pikkuFunc<{ cardId: string }, Card>({
  expose: true,
  docs: {
    summary: 'Fetch a card',
    description: 'Returns a card by ID or throws NotFoundError if not found',
    tags: ['cards', 'read'],
    errors: ['NotFoundError'],
  },
  // ✅ CORRECT: Services destructured in parameter list
  func: async ({ store }, { cardId }) => {
    const card = await store.getCard(cardId)
    if (!card) {
      throw new NotFoundError('Card not found')
    }
    return card
  },
})
