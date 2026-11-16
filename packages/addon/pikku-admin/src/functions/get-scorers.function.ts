import { pikkuFunc } from '#pikku/addon/function'
import { pikkuState } from '@pikku/core/state'

export interface ScorerListEntry {
  name: string
  description: string
  lane: 'fast' | 'slow'
  sampleRate: number
  requiresReference: boolean
  sourceFile?: string
  exportedName?: string
  /** The agents that named this scorer, so an unused one is visibly unused. */
  agents: string[]
}

export const getScorers = pikkuFunc<void, ScorerListEntry[]>({
  title: 'Get Scorers',
  description:
    'Returns every declared AI scorer with the lane it grades on, the fraction of live runs it samples, and the agents that named it.',
  expose: true,
  func: async () => {
    const scorersMeta = pikkuState(null, 'agent', 'scorersMeta') ?? {}
    const agentsMeta = pikkuState(null, 'agent', 'agentsMeta') ?? {}

    const agentsByScorer = new Map<string, string[]>()
    for (const [agentName, agent] of Object.entries(agentsMeta) as [
      string,
      { scorers?: string[] },
    ][]) {
      for (const scorerName of agent.scorers ?? []) {
        agentsByScorer.set(scorerName, [
          ...(agentsByScorer.get(scorerName) ?? []),
          agentName,
        ])
      }
    }

    return Object.values(scorersMeta).map((scorer) => ({
      ...scorer,
      agents: agentsByScorer.get(scorer.name) ?? [],
    }))
  },
})
