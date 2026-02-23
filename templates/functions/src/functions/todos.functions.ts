import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import {
  ListTodosWithUserInputSchema,
  CreateTodoWithUserInputSchema,
  TodoIdInputSchema,
  UpdateTodoWithIdInputSchema,
  TodoOutputSchema,
  TodoSuccessOutputSchema,
  CreateTodoOutputSchema,
  TodoListResponseSchema,
  DeleteResponseSchema,
} from '../schemas.js'

/**
 * List todos for a user with optional filters.
 */
export const listTodos = pikkuSessionlessFunc({
  input: ListTodosWithUserInputSchema,
  output: TodoListResponseSchema,
  func: async ({ logger, todoStore }, { userId, completed, priority, tag }) => {
    const uid = userId || 'user1' // Default to demo user
    const todos = todoStore.getTodosByUser(uid, { completed, priority, tag })
    logger.info(`Listed ${todos.length} todos for user ${uid}`)
    return { todos, total: todos.length }
  },
})

/**
 * Get a single todo by ID.
 */
export const getTodo = pikkuSessionlessFunc({
  input: TodoIdInputSchema,
  output: TodoOutputSchema,
  func: async ({ logger, todoStore }, { id }) => {
    const todo = todoStore.getTodo(id)
    logger.info(`Get todo ${id}: ${todo ? 'found' : 'not found'}`)
    return { todo: todo || null }
  },
})

/**
 * Create a new todo.
 */
export const createTodo = pikkuSessionlessFunc({
  description:
    'Create a new todo item with title, description, priority, dueDate, and tags',
  mcp: true,
  input: CreateTodoWithUserInputSchema,
  output: CreateTodoOutputSchema,
  func: async (
    { logger, eventHub, todoStore },
    { userId, title, description, priority, dueDate, tags }
  ) => {
    const uid = userId || 'user1'
    const todo = todoStore.createTodo(uid, {
      title,
      description,
      completed: false,
      priority: priority || 'medium',
      dueDate,
      tags: tags || [],
    })
    logger.info(`Created todo ${todo.id} for user ${uid}`)

    if (eventHub) {
      await eventHub.publish('todo-created', null, { todo })
    }

    return { todo }
  },
})

/**
 * Update an existing todo.
 */
export const updateTodo = pikkuSessionlessFunc({
  input: UpdateTodoWithIdInputSchema,
  output: TodoSuccessOutputSchema,
  func: async (
    { logger, eventHub, todoStore },
    { id, title, description, priority, dueDate, tags, completed }
  ) => {
    const todo = todoStore.updateTodo(id, {
      title,
      description,
      priority,
      dueDate,
      tags,
      completed,
    })

    if (todo) {
      logger.info(`Updated todo ${id}`)
      if (eventHub) {
        await eventHub.publish('todo-updated', null, { todo })
      }
    }

    return { todo: todo || null, success: !!todo }
  },
})

/**
 * Delete a todo.
 */
export const deleteTodo = pikkuSessionlessFunc({
  description: 'Delete a todo by ID',
  mcp: true,
  input: TodoIdInputSchema,
  output: DeleteResponseSchema,
  func: async ({ logger, eventHub, todoStore }, { id }) => {
    const success = todoStore.deleteTodo(id)
    logger.info(`Deleted todo ${id}: ${success}`)

    if (eventHub && success) {
      await eventHub.publish('todo-deleted', null, { todoId: id })
    }

    return { success }
  },
})

/**
 * Mark a todo as complete.
 */
export const completeTodo = pikkuSessionlessFunc({
  description: 'Mark a todo as complete by ID',
  mcp: true,
  input: TodoIdInputSchema,
  output: TodoSuccessOutputSchema,
  func: async ({ logger, eventHub, todoStore }, { id }) => {
    const todo = todoStore.completeTodo(id)

    if (todo) {
      logger.info(`Completed todo ${id}`)
      if (eventHub) {
        await eventHub.publish('todo-completed', null, { todo })
      }
    }

    return { todo: todo || null, success: !!todo }
  },
})
