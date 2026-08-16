import { pikkuFunc } from '#pikku/function'

export const me = pikkuFunc<void, { userId: string }>({
  func: async (_services, _data, { session }) => {
    return { userId: session.userId as string }
  },
})
