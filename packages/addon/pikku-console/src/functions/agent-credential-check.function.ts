import { pikkuSessionlessFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'

export interface AgentCredentialRequirement {
  credentialName: string
  displayName: string
  addonNamespace: string
  connected: boolean
}

export const agentCredentialCheck = pikkuSessionlessFunc<
  { agentName: string; userId?: string },
  { requirements: AgentCredentialRequirement[]; allConnected: boolean }
>({
  title: 'Agent Credential Check',
  description:
    'Checks which OAuth credentials an agent needs and whether the user has connected them.',
  expose: true,
  func: async ({ credentialService, wiringService }, { agentName, userId }) => {
    const allMeta = await wiringService.readAllMeta()
    const agentMeta = allMeta.agentsMeta?.[agentName]
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
