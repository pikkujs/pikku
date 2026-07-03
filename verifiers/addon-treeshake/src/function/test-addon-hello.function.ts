import { pikkuSessionlessFunc } from '#pikku'

/**
 * Body-invokes an addon function that uses an addon-created service (noop),
 * which forces the addon services factory — the unit keeping this carries
 * the addon's full requiredParentServices.
 */
export const testAddonHello = pikkuSessionlessFunc<
  { name: string; greeting?: string },
  { message: string; timestamp: number; noopCalls: number }
>({
  func: async (_, data, { rpc }) => {
    return await rpc.invoke('ext:hello', data)
  },
})
