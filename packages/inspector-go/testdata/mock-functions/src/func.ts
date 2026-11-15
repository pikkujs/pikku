import { pikkuFunc } from './core.js'

export type Todo = { id: string; title: string }

export const getTodo = pikkuFunc<{ id: string }, Todo>({
  expose: true,
  func: async (_services, { id }) => ({ id, title: 'real' }),
})

export const listTodos = pikkuFunc<{ limit: number }, Todo[]>({
  expose: true,
  mock: true,
})
