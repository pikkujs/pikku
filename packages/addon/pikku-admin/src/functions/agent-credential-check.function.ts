import { pikkuFunc } from '#pikku/addon/function'
import { pikkuState } from '@pikku/core/state'

export interface AgentCredentialRequirement {
  credentialName: string
  displayName: string
  addonNamespace: string
  connected: boolean
}

export const agentCredentialCheck = pikkuFunc<
  { agentName: string },
  { requirements: AgentCredentialRequirement[]; allConnected: boolean }
>({
  title: 'Agent Credential Check',
  description:
    'Checks which OAuth credentials an agent needs and whether the authenticated user has connected them.',
  expose: true,
  scopes: ['admin:credentials:read'],
  func: async ({ credentialService }, { agentName }, { session }) => {
    // Scope to the caller's own session — never accept an arbitrary userId from
    // input, which would let a caller probe another user's connected credentials.
    const userId = session?.userId
    // Read the agent from the running app's own state, not from `.pikku` files
    // on disk, so this works in a deployed stage.
    const agentMeta = pikkuState(null, 'agent', 'agentsMeta')?.[agentName]
    if (!agentMeta?.tools?.length) {
      return { requirements: [], allConnected: true }
    }

    const addons = pikkuState(null, 'addons', 'packages')
    const seen = new Set<string>()
    const requirements: AgentCredentialRequirement[] = []

    for (const toolName of agentMeta.tools) {
      const colonIndex = toolName.indexOf(':')
      if (colonIndex === -1) continue

      const namespace = toolName.substring(0, colonIndex)
      const pkgConfig = addons.get(namespace)
      if (!pkgConfig) continue

      const credsMeta = pikkuState(
        pkgConfig.package,
        'package',
        'credentialsMeta'
      )
      if (!credsMeta) continue

      for (const [name, meta] of Object.entries(
        credsMeta as Record<string, any>
      )) {
        if (meta.type === 'wire' && meta.oauth2 && !seen.has(name)) {
          seen.add(name)
          const connected = credentialService
            ? await credentialService.has(name, userId)
            : false
          requirements.push({
            credentialName: name,
            displayName: meta.displayName ?? name,
            addonNamespace: namespace,
            connected,
          })
        }
      }
    }

    return {
      requirements,
      allConnected: requirements.every((r) => r.connected),
    }
  },
})
