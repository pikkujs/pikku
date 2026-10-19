import { pikkuAgentScorer, pikkuAgentJudge } from '#pikku/agent'

// @snippet start agentScorer
// Pure code over the finished run: if the answer quotes a price, the run must
// have looked the item up rather than invented the number.
export const pricesComeFromTools = pikkuAgentScorer({
  name: 'prices-come-from-tools',
  description: 'An answer that quotes a price must have called a catalogue tool',
  sampleRate: 0.5,
  score: ({ output, toolCalls }) => {
    const quotesPrice = /[$€£]\s?\d/.test(output)
    const lookedItUp = toolCalls.some(
      ({ name }) => name === 'getItem' || name === 'listItems'
    )
    return quotesPrice && !lookedItUp
      ? { score: 0, reason: 'Quoted a price without calling getItem or listItems' }
      : { score: 1 }
  },
})
// @snippet end agentScorer

// @snippet start agentJudge
// A model grades what code can't: whether the answer actually helps.
export const answersTheShopper = pikkuAgentJudge({
  name: 'answers-the-shopper',
  description: 'Does the reply address what the customer asked, briefly and politely?',
  model: 'claude-sonnet-4-5',
  goal: 'Answer the shopper’s question about the catalogue or their basket directly, without padding, and say so plainly when something is out of stock or unavailable.',
  sampleRate: 0.1,
  toolCalls: 'names',
})
// @snippet end agentJudge
