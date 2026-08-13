import { pikkuState } from '../../pikku-state.js'
import type { PikkuAIScorer } from './ai-scorer.types.js'

export const addAIScorer = (
  scorerName: string,
  scorer: PikkuAIScorer<any>,
  packageName: string | null = null
) => {
  const scorersMeta = pikkuState(packageName, 'agent', 'scorersMeta')
  if (!scorersMeta[scorerName]) {
    console.warn(
      `[pikku] Skipping AI scorer '${scorerName}' — metadata not found. Scorers must be declared in a *.scorer.ts file.`
    )
    return
  }
  const scorers = pikkuState(packageName, 'agent', 'scorers')
  if (scorers.has(scorerName)) {
    throw new Error(`AI scorer already exists: ${scorerName}`)
  }
  scorers.set(scorerName, scorer)
}

export const getAIScorers = () => pikkuState(null, 'agent', 'scorers')

export const getAIScorersMeta = () => pikkuState(null, 'agent', 'scorersMeta')

/**
 * Resolve a scorer by name across every registered package, the way an agent's
 * tools are resolved: a scorer declared in an addon is nameable by an app agent.
 */
export const resolveAIScorer = (scorerName: string): PikkuAIScorer<any> => {
  const scorer = pikkuState(null, 'agent', 'scorers').get(scorerName)
  if (!scorer) {
    throw new Error(`AI scorer not found: ${scorerName}`)
  }
  return scorer
}

/**
 * The scorers an agent asked to be graded by.
 *
 * A name that resolves to nothing is warned about rather than thrown: a missing
 * scorer must not take down a run that has already answered the user.
 */
export const scorersForAgent = (
  agentName: string,
  logger?: { warn: (message: string) => void }
): PikkuAIScorer<any>[] => {
  const agent = pikkuState(null, 'agent', 'agents').get(agentName)
  const names = agent?.scorers ?? []
  const scorers: PikkuAIScorer<any>[] = []
  for (const name of names) {
    const scorer = pikkuState(null, 'agent', 'scorers').get(name)
    if (!scorer) {
      logger?.warn(
        `[pikku] Agent '${agentName}' names scorer '${name}', which is not registered — skipping it`
      )
      continue
    }
    scorers.push(scorer)
  }
  return scorers
}
