import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import { store } from '../services/store.service.js'
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
  func: async ({ logger }, { userId, completed, priority, tag }) => {
    const uid = userId || 'user1' // Default to demo user
    const todos = store.getTodosByUser(uid, { completed, priority, tag })
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
  func: async ({ logger }, { id }) => {
    const todo = store.getTodo(id)
    logger.info(`Get todo ${id}: ${todo ? 'found' : 'not found'}`)
    return { todo: todo || null }
  },
})

/**
 * Create a new todo.
 */
export const createTodo = pikkuSessionlessFunc({
  input: CreateTodoWithUserInputSchema,
  output: CreateTodoOutputSchema,
  func: async (
    { logger, eventHub },
    { userId, title, description, priority, dueDate, tags }
  ) => {
    const uid = userId || 'user1'
    const todo = store.createTodo(uid, {
      title,
      description,
      completed: false,
      priority: priority || 'medium',
      dueDate,
      tags: tags || [],
    })
    logger.info(`Created todo ${todo.id} for user ${uid}`)

    // Broadcast to all subscribers (null = all)
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
    { logger, eventHub },
    { id, title, description, priority, dueDate, tags, completed }
  ) => {
    const todo = store.updateTodo(id, {
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
  input: TodoIdInputSchema,
  output: DeleteResponseSchema,
  func: async ({ logger, eventHub }, { id }) => {
    const success = store.deleteTodo(id)
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
  input: TodoIdInputSchema,
  output: TodoSuccessOutputSchema,
  func: async ({ logger, eventHub }, { id }) => {
    const todo = store.completeTodo(id)

    if (todo) {
      logger.info(`Completed todo ${id}`)
      if (eventHub) {
        await eventHub.publish('todo-completed', null, { todo })
      }
    }

    return { todo: todo || null, success: !!todo }
  },
})
