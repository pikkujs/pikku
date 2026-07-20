import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'

/**
 * `prepareStep` receives the live tool array for the upcoming step, so mutating
 * it in place narrows what the model is offered from that step on. Here the
 * tools are withdrawn once the first step is done.
 */
export const prepareStepAgent = pikkuAIAgent({
  name: 'prepare-step-agent',
  description: 'Withdraws its tools after the first step',
  goal: 'You demonstrate step-driven tool narrowing.',
  model: 'openai/o4-mini',
  tools: [ref('openTool')],
  maxSteps: 5,
  toolChoice: 'auto',
  prepareStep: ({ stepNumber, tools }) => {
    if (stepNumber >= 1) {
      tools.length = 0
    }
  },
})

/**
 * Calls `stop()` before the very first step, so the loop ends before any model
 * call. This pins the current behaviour that the run then completes silently
 * with an empty result rather than signalling that it was short-circuited.
 */
export const prepareStopAgent = pikkuAIAgent({
  name: 'prepare-stop-agent',
  description: 'Stops before the first step ever runs',
  goal: 'You stop before doing anything.',
  model: 'openai/o4-mini',
  tools: [ref('openTool')],
  maxSteps: 5,
  toolChoice: 'auto',
  prepareStep: ({ stop }) => {
    stop()
  },
})
