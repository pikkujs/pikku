import {
  pikkuAgentScorer,
  pikkuAgentJudge,
} from '#pikku/agent/pikku-agent-types.gen.js'

/**
 * How well the todo agent answers, graded in code.
 *
 * These are heuristics rather than judges on purpose: the deterministic suite
 * runs against a scripted model, so a judge would be a second model grading the
 * first one's fixture — expensive, non-deterministic, and asserting nothing
 * about pikku. `helpfulness` below is the judge, and it is tagged `ai-live`
 * wherever a scenario reaches it.
 */
export const brevity = pikkuAgentScorer({
  name: 'brevity',
  description: 'A short answer scores higher than a rambling one',
  sampleRate: 0.25,
  score: ({ output }) => ({
    score: output.length <= 120 ? 1 : 0,
    reason: `The answer was ${output.length} characters.`,
  }),
})

export const restraint = pikkuAgentScorer({
  name: 'restraint',
  description: 'Reaching for a tool the question did not need scores lower',
  score: ({ toolCalls }) => ({
    score: toolCalls.length === 0 ? 1 : 1 / (1 + toolCalls.length),
    reason: `The run made ${toolCalls.length} tool call(s).`,
  }),
})

/**
 * Grades against an answer key, so live traffic never samples it — the runtime
 * filters `requiresReference` scorers out, and a scenario is the only caller
 * that can supply the `reference` it needs.
 */
export const matchesAnswerKey = pikkuAgentScorer({
  name: 'matchesAnswerKey',
  description: 'The answer is the one the scenario expected',
  requiresReference: true,
  score: ({ output, reference }) => ({
    score: output.trim() === reference?.trim() ? 1 : 0,
    reason:
      output.trim() === reference?.trim()
        ? 'Matched the answer key.'
        : `Expected '${reference}', got '${output}'.`,
  }),
})

/**
 * Never sampled on live traffic. A sampled judge fires asynchronously some time
 * after the run it grades, so its model call lands in whichever scenario's
 * window happens to be open — a deterministic suite then fails at random on an
 * unrelated agent's model-call count. `pikkuScenarioGradeRun` ignores the
 * sample rate, so the `ai-live` scenario that wants this judge still reaches it.
 */
export const helpfulness = pikkuAgentJudge({
  name: 'helpfulness',
  description: 'Does the answer actually help the person who asked',
  model: 'reasoning',
  /**
   * The ends of the scale are stated because leaving them to the model does not
   * work. Told only to "grade how well the answer addresses what was asked", it
   * gave a full 1 to an answer it described in the same breath as giving
   * "general tips about organizing a to-do list instead of listing the specific
   * items on your to-do list as requested" — the reading was right and the
   * number did not follow from it, which is what an unanchored scale gets you.
   */
  goal: [
    'Grade how well the answer addresses what was asked.',
    'Score 1 when it gives the particular information requested.',
    'Score 0 when it does not, however fluent, polite, or on-topic it is —',
    'discussing the subject in general is not answering the question.',
    'A correct but unusable answer scores low.',
  ].join(' '),
  sampleRate: 0,
})
