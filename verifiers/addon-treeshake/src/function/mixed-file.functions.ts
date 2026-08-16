import { pikkuSessionlessFunc } from '#pikku/function'

export const mixedAddonCaller = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  func: async (_, data, { rpc }) => {
    return await rpc.invoke('ext:goodbye', data)
  },
})

export const mixedPlain = pikkuSessionlessFunc<void, { ok: boolean }>({
  func: async ({ logger }) => {
    logger.debug('plain')
    return { ok: true }
  },
})
