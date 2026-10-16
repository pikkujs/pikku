import { pikkuSessionlessFunc } from './pikku.js'

export const full = pikkuSessionlessFunc<{ id: string }, { ok: boolean }>({
  title: 'Full',
  description: 'Every node field set',
  tags: ['a', 'b'],
  node: {
    displayName: 'Full Node',
    category: 'Things',
    type: 'trigger',
    errorOutput: true,
  },
  func: async () => ({ ok: true }),
})

export const bare = pikkuSessionlessFunc<void, void>({
  node: { displayName: 'Bare', category: 'Things', type: 'end' },
  func: async () => {},
})

export const badType = pikkuSessionlessFunc<void, void>({
  node: { displayName: 'Bad', category: 'Things', type: 'sideways' },
  func: async () => {},
})

export const missing = pikkuSessionlessFunc<void, void>({
  node: {},
  func: async () => {},
})

export const notLiteral = pikkuSessionlessFunc<void, void>({
  node: { displayName: 'X', category: 'Y', type: 'action' } as any,
  func: async () => {},
})

// An explicit empty tags list is kept as `tags: []`, not dropped.
export const emptyTags = pikkuSessionlessFunc<void, void>({
  tags: [],
  func: async () => {},
})
