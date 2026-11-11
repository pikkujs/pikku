import {
  pikkuAgent,
  pikkuAgentScorer,
  pikkuAgentJudge,
  ref,
  workflow,
} from './pikku.js'
import {
  lookupItem,
  renamedTool,
  reviewGraph,
  unnamedGraph,
  notAFunc,
} from './functions.js'

const computed = { openai: { reasoningEffort: 'low' } }
const scorerName = 'dynamic'

export const helperAgent = pikkuAgent({
  name: 'helper',
  description: 'Helps',
  model: 'openai/gpt-4o',
})

export const shopAgent = pikkuAgent({
  name: 'shop-assistant',
  description: 'Answers shopper questions',
  summary: 'Shop bot',
  role: 'assistant',
  goal: 'Sell things',
  model: 'openai/gpt-4o',
  maxSteps: 5,
  temperature: 0.2,
  toolChoice: 'auto',
  providerOptions: {
    openai: { reasoningEffort: 'high', tags: ['a', 1, true, null], n: -2 },
    'x-y': { 1: 'one' },
  } as const,
  tools: [
    lookupItem,
    renamedTool,
    ref('external'),
    workflow('checkout'),
    'literal',
    notAFunc,
  ],
  agents: [helperAgent, 'other', notAFunc],
  workflows: [reviewGraph, unnamedGraph, ref('refFlow'), 'bad', notAFunc],
  scorers: ['answersTheShopper', scorerName],
  tags: ['bots'],
  input: someSchema(),
})

export const computedAgent = pikkuAgent({
  name: 'computed',
  description: 'Has computed options',
  model: 'openai/gpt-4o',
  providerOptions: computed,
  maxSteps: computed as unknown as number,
  tags: 'not-an-array',
})

export const noDescriptionAgent = pikkuAgent({ name: 'quiet', model: 'x' })
export const noNameAgent = pikkuAgent({ description: 'nameless' })
export const disabledAgent = pikkuAgent({
  name: 'off',
  description: 'off',
  disabled: true,
})

export const answersTheShopper = pikkuAgentJudge({
  name: 'answersTheShopper',
  description: 'Judges answers',
  model: 'openai/o4-mini',
})

export const namesAProduct = pikkuAgentScorer({
  name: 'namesAProduct',
  description: 'Names a product',
  sampleRate: 0.25,
  requiresReference: true,
})

export const badRate = pikkuAgentScorer({
  name: 'badRate',
  description: 'bad',
  sampleRate: 1.5,
})
export const noDescScorer = pikkuAgentScorer({ name: 'noDesc' })
export const noNameScorer = pikkuAgentJudge({ description: 'no name' })

function someSchema() {
  return {}
}
