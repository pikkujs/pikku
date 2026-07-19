import { pikkuFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'

export interface AddonInstance {
  /** The `wireAddon` name / RPC namespace for this instance. */
  namespace: string
  /** Logical secret name -> the project secret this instance resolves it to. */
  secretOverrides?: Record<string, string>
  /** Logical variable name -> the project variable this instance resolves it to. */
  variableOverrides?: Record<string, string>
  /** Logical credential name -> the project credential this instance resolves it to. */
  credentialOverrides?: Record<string, string>
}

/**
 * Every wired instance of a package, with its per-instance overrides. A package
 * installed more than once has one entry per `wireAddon` namespace; the Setup
 * tab uses the selected instance's overrides to resolve the addon's logical
 * secret/variable/credential names to the actual project names to display and
 * configure. An instance with no overrides resolves to the logical names.
 */
export const getAddonInstances = pikkuFunc<
  { packageName: string },
  AddonInstance[]
>({
  title: 'Get Addon Instances',
  description:
    'Returns the wired instances of an addon package and their per-instance overrides.',
  expose: true,
  func: async (_services, { packageName }) => {
    const addonsMap = pikkuState(null, 'addons', 'packages')
    const instances: AddonInstance[] = []
    for (const [namespace, config] of addonsMap) {
      if (config.package !== packageName) continue
      instances.push({
        namespace,
        secretOverrides: config.secretOverrides,
        variableOverrides: config.variableOverrides,
        credentialOverrides: config.credentialOverrides,
      })
    }
    return instances
  },
})
