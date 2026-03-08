import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const ListTodosInput = z.object({})

export const ListTodosOutput = z.object({
  todos: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      completed: z.boolean(),
      createdAt: z.string(),
    })
  ),
})

export const listTodos = pikkuSessionlessFunc({
  description: 'Lists all todos',
  expose: true,
  input: ListTodosInput,
  output: ListTodosOutput,
  func: async ({ todoStore }) => {
    return { todos: todoStore.list() }
  },
})
