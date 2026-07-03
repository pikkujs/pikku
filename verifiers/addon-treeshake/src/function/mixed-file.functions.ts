import { pikkuSessionlessFunc } from '#pikku'

/**
 * Two functions sharing one source file — invocation attribution is
 * file-granular, so a unit keeping only mixedPlain still keeps the addon
 * (conservative over-inclusion, never under-inclusion). Kept deliberately
 * as the documented mixed-file behavior; one-function-per-file avoids it.
 */
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
