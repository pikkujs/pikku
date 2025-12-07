import { pikkuCLIRender } from '#pikku/pikku-types.gen.js'
import type { Todo } from '../schemas.js'

/**
 * Render todo list for CLI output.
 */
export const todoListRenderer = pikkuCLIRender<{
  todos: Todo[]
  total: number
}>((_services, result) => {
  if (result.total === 0) {
    console.log('No todos found.')
    return
  }

  console.log(`Found ${result.total} todo(s):\n`)
  for (const todo of result.todos) {
    const status = todo.completed ? '[x]' : '[ ]'
    const priority = `[${todo.priority.toUpperCase()}]`
    const due = todo.dueDate ? ` (due: ${todo.dueDate})` : ''
    console.log(`${status} ${priority} ${todo.id}: ${todo.title}${due}`)
  }
})

/**
 * Render single todo for CLI output.
 */
export const todoRenderer = pikkuCLIRender<{ todo: Todo | null }>(
  (_services, result) => {
    if (!result.todo) {
      console.log('Todo not found.')
      return
    }

    const todo = result.todo
    console.log(`ID: ${todo.id}`)
    console.log(`Title: ${todo.title}`)
    console.log(`Status: ${todo.completed ? 'Completed' : 'Pending'}`)
    console.log(`Priority: ${todo.priority}`)

    if (todo.description) {
      console.log(`Description: ${todo.description}`)
    }
    if (todo.dueDate) {
      console.log(`Due: ${todo.dueDate}`)
    }
    if (todo.tags.length > 0) {
      console.log(`Tags: ${todo.tags.join(', ')}`)
    }
    console.log(`Created: ${todo.createdAt}`)
    console.log(`Updated: ${todo.updatedAt}`)
  }
)

/**
 * Render success/failure result.
 */
export const successRenderer = pikkuCLIRender<{
  success?: boolean
  todo?: Todo
}>((_services, result) => {
  if (result.todo) {
    console.log(`Success: ${result.todo.title}`)
  } else {
    console.log(result.success ? 'Success' : 'Failed')
  }
})

/**
 * Default JSON renderer.
 */
export const jsonRenderer = pikkuCLIRender((_services, result: unknown) => {
  console.log(JSON.stringify(result, null, 2))
})
