import type {
  PikkuAgentScorer,
  ScorerInput,
  ScorerOutput,
} from './agent-scorer.types.js'

const assertSampleRate = (name: string, sampleRate: number | undefined) => {
  if (sampleRate === undefined) return 1
  if (sampleRate < 0 || sampleRate > 1) {
    throw new Error(
      `Scorer '${name}' has a sampleRate of ${sampleRate} — it is a fraction of live runs to grade, so it must be between 0 and 1`
    )
  }
  return sampleRate
}

/**
 * A heuristic scorer: pure code over the finished run, no model call, so it
 * grades on the fast lane.
 */
export const pikkuAgentScorer = <Services = any>(config: {
  name: string
  description: string
  /** 0..1 fraction of live runs to grade. Defaults to all of them. */
  sampleRate?: number
  /**
   * Grades against a known-correct answer. Such a scorer is test-only — live
   * traffic has no answer key, so the runtime never samples it.
   */
  requiresReference?: boolean
  score: (
    input: ScorerInput,
    services: Services
  ) => ScorerOutput | Promise<ScorerOutput>
}): PikkuAgentScorer<Services> => ({
  name: config.name,
  description: config.description,
  lane: 'fast',
  sampleRate: assertSampleRate(config.name, config.sampleRate),
  requiresReference: config.requiresReference ?? false,
  score: config.score,
})

/**
 * An LLM-judge scorer: the runtime makes the model call and forces a structured
 * `{ score, reason }`, so a judge is a rubric rather than a prompt to parse.
 *
 * The rubric field is `goal`, matching `pikkuAgent`'s prompt vocabulary — a
 * judge is a degenerate agent, and should use the same word for the same thing.
 * `prompt` is the escape hatch for non-standard framing.
 */
export const pikkuAgentJudge = <Services = any>(config: {
  name: string
  description: string
  /** 0..1 fraction of live runs to grade. Defaults to all of them. */
  sampleRate?: number
  /**
   * Grades against a known-correct answer. Such a judge is test-only — live
   * traffic has no answer key, so the runtime never samples it.
   */
  requiresReference?: boolean
  model: string
  goal: string
  prompt?: (input: ScorerInput) => string
}): PikkuAgentScorer<Services> => ({
  name: config.name,
  description: config.description,
  lane: 'slow',
  sampleRate: assertSampleRate(config.name, config.sampleRate),
  requiresReference: config.requiresReference ?? false,
  judge: {
    model: config.model,
    goal: config.goal,
    ...(config.prompt ? { prompt: config.prompt } : {}),
  },
})
