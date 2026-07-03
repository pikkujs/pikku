import { pikkuSessionlessFunc } from '#pikku'

export const testAddonGoodbye = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  func: async (_, data, { rpc }) => {
    return await rpc.invoke('ext:goodbye', data)
  },
})
