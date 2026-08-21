import { pikkuFunc } from '#pikku/addon/function'

/**
 * Turns a persona loose now, rather than waiting for its schedule.
 *
 * Dispatches the project's own scaffolded `runVirtualUser` rather than starting
 * a run itself: the persona lookup, the acted-upon check and the production
 * guard live there, and a second copy of them in the console would eventually
 * disagree with the first. The cost is that this needs `scaffold.virtualUser`
 * on, while reading runs does not — so the absence is reported as the missing
 * scaffold it is, not as a broken button.
 *
 * SECURITY: its own scope, separate from reading. A run acts as a real user
 * against the real API, and an adversarial one is trying to break things.
 */
export const startVirtualUserRun = pikkuFunc<
  { persona: string; disposition?: string; goals?: string[] },
  { runId: string }
>({
  title: 'Start a Virtual User Run',
  description:
    'Runs a declared persona against this application now. Returns a run id; the result arrives in the run list.',
  expose: true,
  scopes: ['pikku:console:virtualUsers:run'],
  func: async ({ metaService }, input, { rpc }) => {
    const rpcs = await metaService?.getRpcMeta()
    if (!rpcs?.runVirtualUser) {
      throw new Error(
        'This application has no runVirtualUser function — turn on `scaffold.virtualUser` in pikku.config.json and run `pikku all` to generate it.'
      )
    }
    // `exposed` rather than `invoke`: the name belongs to the host application,
    // not to this addon, so there is no typed map for it here — and going in
    // through the exposed door is what the console is doing anyway.
    return (await rpc!.exposed('runVirtualUser', input)) as { runId: string }
  },
})
