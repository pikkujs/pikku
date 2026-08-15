/**
 * The judge, run for real.
 *
 * `agent-scoring.feature.ts` covers the grading *path* — the snapshot the
 * runtime keeps, the instrumentation RPC, a scorer resolving by name — against
 * a scripted model, and the unit tests in `agent-scorer/` cover the judge's
 * prompt and the shape of what it returns. Between them the only thing never
 * exercised was the judge itself: `helpfulness` is declared with a real model
 * and a `sampleRate` of 0, so until this feature nothing in the suite ever
 * asked a model to grade anything.
 *
 * What that left unchecked is not plumbing. The judge's reply is parsed for a
 * number, clamped, and rejected when it is not numeric — all asserted against
 * a stub. Whether a real model, handed the real prompt this runtime builds,
 * answers in a shape those assertions describe is a different question, and it
 * is the one that breaks when a provider changes how it honours structured
 * output.
 *
 * The assertion is a gap, not a threshold. One run graded `atLeast` something
 * would pass against a judge stubbed to return 1, which is the failure worth
 * catching: a judge wired up wrongly returns a constant, and a constant is
 * indistinguishable from a good grade until you ask it to grade two different
 * answers. So the same judge grades two answers to the same question, and the
 * bounds are set where a constant cannot satisfy both.
 *
 * Two real model calls per run and a real judge on top, so this is `ai-live`.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const HELPFUL_AGENT = 'todoReadAgent'
const UNHELPFUL_AGENT = 'unhelpfulAgent'
const JUDGE = 'helpfulness'
const RESOURCE_ID = 'agent-scoring-live'
/** Asked of both, so the answer is the only thing that differs. */
const QUESTION = 'What is on my todo list?'

export const judgeSeparatesTwoAnswersScenario = pikkuScenario<
  void,
  { separated: true }
>({
  title: 'A real judge grades a useful answer above a useless one',
  description:
    'The same judge, the same question, two answers — and a gap a constant cannot fake',
  tags: ['scenario', 'agent-scoring-live', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'judgeSeparatesTwoAnswersScenario needs the admin actor — grading is an inline RPC and the snapshot lives in the server process'
      )
    }

    // A useful answer to "what is on my list" needs something to be on it, and
    // whatever an earlier scenario left there is not it.
    await scenario.do(
      'the todo list is reset',
      'todos:resetTodos',
      {},
      { actor: actors.admin }
    )

    // Separate threads: the second agent must answer the question cold, not
    // read the first one's answer out of a shared history.
    const helpfulThread = await scenario.given(
      'opens a thread for the todo agent',
      'startsAgentThread'
    )
    const helpfulRun = await scenario.when(
      'asks the todo agent what is on the list',
      'runsAgent',
      {
        agent: HELPFUL_AGENT,
        message: QUESTION,
        threadId: helpfulThread.threadId,
        resourceId: RESOURCE_ID,
      }
    )

    const unhelpfulThread = await scenario.given(
      'opens a thread for the unhelpful agent',
      'startsAgentThread'
    )
    const unhelpfulRun = await scenario.when(
      'asks the unhelpful agent the same thing',
      'runsAgent',
      {
        agent: UNHELPFUL_AGENT,
        message: QUESTION,
        threadId: unhelpfulThread.threadId,
        resourceId: RESOURCE_ID,
      }
    )

    // Deliberately not 1 and 0. The subject is whether the judge tells the two
    // apart, and pinning it to the ends of its own scale would make this a test
    // of how generous one model happens to be with full marks.
    await scenario.expectScore(
      'grades the useful answer well',
      helpfulRun.runId!,
      JUDGE,
      { atLeast: 0.6, actor: actors.admin }
    )
    await scenario.expectScore(
      'grades the useless answer poorly',
      unhelpfulRun.runId!,
      JUDGE,
      { atLeast: 0, atMost: 0.4, actor: actors.admin }
    )

    return { separated: true }
  },
})

export const agentScoringLiveFeature = pikkuFeature({
  name: 'Agent Scoring (live judge)',
  description: 'A real model grades two real runs, and is held to the gap',
  tags: ['agent-scoring-live', 'ai-live'],
  scenarios: [judgeSeparatesTwoAnswersScenario],
})
