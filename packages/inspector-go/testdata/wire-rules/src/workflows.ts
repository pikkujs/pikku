import { pikkuWorkflowFunc } from './core.js'

const STEP = 'knownRpc'

// A literal and a const rpc name are readable; a computed one is an error.
export const stepNames = pikkuWorkflowFunc<{ name: string }, void>({
  func: async (_services, data, { workflow }) => {
    await workflow.do('Literal', 'literalRpc', {})
    await workflow.do('Const', STEP, {})
    await workflow.do('Computed', data.name, {})
  },
})

// A template name reads as a literal to the DSL extractor but names nothing.
export const templateStep = pikkuWorkflowFunc<{ name: string }, void>({
  func: async (_services, data, { workflow }) => {
    await workflow.do('Template', `prefix:${data.name}`, {})
  },
})
