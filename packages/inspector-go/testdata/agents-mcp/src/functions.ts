import {
  pikkuFunc,
  pikkuSessionlessFunc,
  pikkuMCPToolFunc,
  pikkuMCPResourceFunc,
  pikkuMCPPromptFunc,
  pikkuWorkflow,
} from './pikku.js'

export const lookupItem = pikkuSessionlessFunc<
  { id: string },
  { name: string }
>({
  description: 'Look an item up',
  func: async (_services, { id }) => ({ name: id }),
})

export const renamedTool = pikkuSessionlessFunc<{ q: string }, string>({
  override: 'searchItems',
  description: 'Search',
  func: async (_services, { q }) => q,
})

export const undocumentedTool = pikkuFunc<{ a: number }, number>({
  mcp: true,
  func: async (_services, { a }) => a,
})

export const labelledTool = pikkuMCPToolFunc<{ text: string }, unknown>({
  name: 'echo-text',
  title: 'Echo',
  description: 'Echoes the text back',
  tags: ['mcp'],
  func: async (_services, { text }) => text,
})

export const readNote = pikkuMCPResourceFunc<{ id: string }, unknown>({
  func: async (_services, { id }) => id,
})

export const summarisePrompt = pikkuMCPPromptFunc<{ topic: string }, unknown>({
  func: async (_services, { topic }) => topic,
})

export const reviewGraph = pikkuWorkflow({ name: 'reviewFlow' })
export const unnamedGraph = pikkuWorkflow({})

export const notAFunc = { not: 'a pikku function' }
