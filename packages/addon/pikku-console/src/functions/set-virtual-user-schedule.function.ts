import { pikkuFunc } from '#pikku/addon/function'

/**
 * Changes how often a persona uses the application on its own.
 *
 * Dispatches the project's own scaffolded `setVirtualUserSchedule` rather than
 * writing the row here: that function refuses an undeclared persona and one
 * declared as acted upon, and a second copy of those rules in the console would
 * eventually disagree with the first. So reading a cadence needs only the
 * store, while changing one needs the scaffold — and the absence is reported as
 * the missing scaffold it is.
 *
 * SECURITY: its own scope, and the most powerful one on this screen. Starting a
 * run spends money once with a caller present to see it; writing a schedule
 * spends it repeatedly with nobody there.
 */
export const setVirtualUserSchedule = pikkuFunc<
  {
    persona: string
    enabled?: boolean
    disposition?: string
    goals?: string[]
    minIntervalMs?: number
    maxIntervalMs?: number
  },
  unknown
>({
  title: 'Set a Virtual User Schedule',
  description:
    'Says how often a declared persona should use this application on its own. Every field left out keeps what it already had.',
  expose: true,
  scopes: ['pikku:console:virtualUsers:schedule'],
  func: async ({ metaService }, input, { rpc }) => {
    const rpcs = await metaService?.getRpcMeta()
    if (!rpcs?.setVirtualUserSchedule) {
      throw new Error(
        'This application has no setVirtualUserSchedule function — turn on `scaffold.virtualUser` in pikku.config.json and run `pikku all` to generate it.'
      )
    }
    return await rpc!.exposed('setVirtualUserSchedule', input)
  },
})
