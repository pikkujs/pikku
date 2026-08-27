import { pikkuFetch } from '#pikku/pikku-fetch.gen.js'

/**
 * The demo user the todo wirings default to. A real app would take this from a
 * session; the point here is the shape of the client, not who owns the data.
 */
const USER_ID = 'user1'

let configured = false

/**
 * The generated client, pointed at this page's own origin.
 *
 * Same-origin is the whole shape of this template: `pikku serve` mounts the
 * built frontend, and in development Vite proxies the API paths back to pikku,
 * so the browser never learns there are two processes.
 */
const client = () => {
  if (!configured) {
    pikkuFetch.setServerUrl(window.location.origin)
    configured = true
  }
  return pikkuFetch
}

export const listTodos = () =>
  client().get('/todos', {
    userId: USER_ID,
    completed: undefined,
    priority: undefined,
    tag: undefined,
  })

export type Todo = Awaited<ReturnType<typeof listTodos>>['todos'][number]

export const createTodo = (title: string) =>
  client().post('/todos', {
    title,
    userId: USER_ID,
    description: undefined,
    priority: 'medium',
    dueDate: undefined,
    tags: undefined,
  })

export const completeTodo = (id: string) =>
  client().post('/todos/:id/complete', { id })

export const deleteTodo = (id: string) => client().delete('/todos/:id', { id })
