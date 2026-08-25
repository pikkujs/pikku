import { PikkuFetchError } from '@pikku/fetch'
import { pikkuFetch } from '#pikku/pikku-fetch.gen.js'
import { lockStore } from './lock-store'

/**
 * The demo user the todo wirings default to. A real app would take this from a
 * session; the point here is the gate in front of the data, not who owns it.
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

/**
 * Run a request, and treat a 423 as news about the lock rather than as an
 * ordinary failure: the store shut under a page that was already open, so the
 * app goes back to the unlock screen instead of rendering a broken list.
 */
const guarded = async <T>(request: () => Promise<T>): Promise<T> => {
  try {
    return await request()
  } catch (caught) {
    if (caught instanceof PikkuFetchError && caught.status === 423) {
      lockStore.markLocked()
    }
    throw caught
  }
}

export const listTodos = () =>
  guarded(() =>
    client().get('/todos', {
      userId: USER_ID,
      completed: undefined,
      priority: undefined,
      tag: undefined,
    })
  )

export type Todo = Awaited<ReturnType<typeof listTodos>>['todos'][number]

export const createTodo = (title: string) =>
  guarded(() =>
    client().post('/todos', {
      title,
      userId: USER_ID,
      description: undefined,
      priority: 'medium',
      dueDate: undefined,
      tags: undefined,
    })
  )

export const completeTodo = (id: string) =>
  guarded(() => client().post('/todos/:id/complete', { id }))

export const deleteTodo = (id: string) =>
  guarded(() => client().delete('/todos/:id', { id }))
