import { pikkuAgentJudge, pikkuAgentScorer } from '#pikku/agent'

// @snippet start agentScorer
export const namesAProduct = pikkuAgentScorer({
  name: 'namesAProduct',
  description: 'An answer that names an actual item beats one that hedges',
  sampleRate: 0.25,
  score: ({ toolCalls }) => ({
    score: toolCalls.some((call) => call.name.startsWith('listItems')) ? 1 : 0,
    reason: `The run made ${toolCalls.length} tool call(s).`,
  }),
})
// @snippet end agentScorer

// @snippet start agentJudge
export const answersTheShopper = pikkuAgentJudge({
  name: 'answersTheShopper',
  description: 'Does the answer help someone trying to buy something',
  model: 'openai/o4-mini',
  goal: [
    'Grade how well the answer addresses what the shopper asked.',
    'Score 1 when it names the item, price or availability they asked about.',
    'Score 0 when it talks about the catalogue in general instead.',
  ].join(' '),
  sampleRate: 0,
})
// @snippet end agentJudge
