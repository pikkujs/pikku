import { pikkuSessionlessFunc } from '#pikku'

export const myQueueWorker = pikkuSessionlessFunc<
  { item: string },
  { processed: string }
>({
  auth: false,
  func: async (_services, { item }) => {
    return { processed: `done: ${item}` }
  },
})
