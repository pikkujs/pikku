import { z } from 'zod'
import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'

/**
 * An agent whose whole memory is one array.
 *
 * Working memory is echoed back to the model in full every turn and updated by
 * a partial JSON patch, and arrays in that patch replace rather than append. A
 * model that reads "only include changed fields" and emits just the new item
 * therefore deletes everything already on the list — issue #1331. Nothing but a
 * real model can show whether the prompt stops it doing that, so this agent
 * exists for the `ai-live` tier: a single array field, no tools, and a goal
 * that keeps the model from parking the list anywhere else.
 */
export const ShoppingListWorkingMemory = z.object({
  items: z
    .array(z.string())
    .describe('Every item the user still wants to buy')
    .optional(),
})

export const shoppingListAgent = pikkuAgent({
  name: 'shopping-list-agent',
  description: 'Keeps a shopping list in working memory',
  goal: [
    'You keep track of a shopping list for the user.',
    'Every item they mention wanting to buy belongs in the items array of your',
    'working memory, and it stays there until they say they no longer need it.',
    'Reply in one short sentence naming the items currently on the list.',
  ].join('\n'),
  model: 'cheap',
  memory: { workingMemory: ShoppingListWorkingMemory },
  tools: [],
  maxSteps: 1,
  toolChoice: 'none',
})
