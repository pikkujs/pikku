import type { ScorerMeta } from '@pikku/core/ecosystem/ai-scorer'

/**
 * The names an agent may ask to be graded by.
 *
 * Emitted even when there are none — the agent types file imports it
 * unconditionally, so a project with no scorers still has to typecheck. `never`
 * is what makes `scorers: ['typo']` a type error there rather than a silent
 * no-op at runtime.
 */
export const serializeScorerNames = (scorersMeta: ScorerMeta): string => {
  const names = Object.keys(scorersMeta).sort()

  return `/**
 * The AI scorers declared in this project.
 */

export type ScorerName = ${
    names.length === 0 ? 'never' : names.map((name) => `'${name}'`).join(' | ')
  }
`
}
