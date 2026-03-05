import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const DeleteTodoInput = z.object({
  id: z.string(),
})

export const DeleteTodoOutput = z.object({
  success: z.boolean(),
})

export const deleteTodo = pikkuSessionlessFunc({
  description: 'Deletes a todo by ID',
  approvalRequired: true,
  approvalDescription: async ({ todoStore }, { id }) => {
    const todo = todoStore.get(id)
    return `Delete the todo called "${todo?.title ?? id}"`
  },
  input: DeleteTodoInput,
  output: DeleteTodoOutput,
  func: async ({ todoStore }, { id }) => {
    const deleted = todoStore.delete(id)
    if (!deleted) {
      throw new Error(`Todo with id '${id}' not found`)
    }
    return { success: true }
  },
})
