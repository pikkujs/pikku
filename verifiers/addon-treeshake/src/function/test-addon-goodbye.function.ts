import { pikkuSessionlessFunc } from '#pikku'

/**
 * Body-invokes an addon function that needs no parent services — the unit
 * keeping this must import the addon (registration) but require none of
 * its requiredParentServices.
 */
export const testAddonGoodbye = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  func: async (_, data, { rpc }) => {
    return await rpc.invoke('ext:goodbye', data)
  },
})
