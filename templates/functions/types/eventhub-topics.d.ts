import type { Todo } from '../src/schemas.js'

export type EventHubTopics = {
  'todo-created': { todo: Todo }
  'todo-updated': { todo: Todo }
  'todo-deleted': { todoId: string }
  'todo-completed': { todo: Todo }
  [key: string]: unknown
}
