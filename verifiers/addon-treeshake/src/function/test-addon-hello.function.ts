import { pikkuSessionlessFunc } from '#pikku/function'

export const testAddonHello = pikkuSessionlessFunc<
  { name: string; greeting?: string },
  { message: string; timestamp: number; noopCalls: number }
>({
  func: async (_, data, { rpc }) => {
    return await rpc.invoke('ext:hello', data)
  },
})
