import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

/**
 * Uses one parent-provided service directly (greetingStore) and no
 * addon-created services — a consumer unit deploying just this function
 * carries greetingStore but NOT auditSink and does not need the factory.
 */
export const greetFromStore = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  description: 'Greets using the parent project greeting store',
  func: async ({ greetingStore }, data) => {
    return { message: greetingStore.greet(data.name) }
  },
  tags: ['addon'],
})
