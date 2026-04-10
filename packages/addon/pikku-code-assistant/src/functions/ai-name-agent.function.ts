import { pikkuSessionlessFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'
import { callClaude, extractJsonArray } from '@pikku/addon-dynamic-workflows'

function nameExists(name: string): boolean {
  const rootMeta = pikkuState(null, 'agent', 'agentsMeta')
  if (rootMeta[name]) return true

  const addons = pikkuState(null, 'addons', 'packages')
  if (addons) {
    for (const [, addon] of addons) {
      const addonMeta = pikkuState(addon.package, 'agent', 'agentsMeta')
      if (addonMeta?.[name]) return true
    }
  }

  return false
}

function sanitizeName(raw: string): string | null {
  let name = raw.trim().replace(/[^a-zA-Z]/g, '')
  if (!name || name.length < 3) return null
  return name.charAt(0).toLowerCase() + name.slice(1)
}

export const aiNameAgent = pikkuSessionlessFunc<
  { prompt: string },
  { name: string; inputTokens: number; outputTokens: number; costUsd: number }
>({
  description: 'Uses AI to generate a unique short camelCase name for an agent',
  func: async ({}, { prompt }) => {
    const result = callClaude(
      `Generate 5 short camelCase names (2-4 words, no numbers, no "dynamic" or "agent" in the name) for this AI agent:

"${prompt}"

Return a JSON array of 5 names, ordered from best to least preferred. Examples: ["todoManager", "emailHelper", "inventoryBot", "orderProcessor", "customerSupport"]

Return ONLY the JSON array. Nothing else.`
    )

    const names = extractJsonArray(result.text)
    if (Array.isArray(names)) {
      for (const raw of names) {
        if (typeof raw !== 'string') continue
        const name = sanitizeName(raw)
        if (name && !nameExists(name)) {
          return {
            name,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
          }
        }
      }
    }

    const fallback = `agent${Date.now().toString(36).slice(-4)}`
    return {
      name: fallback,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    }
  },
})
