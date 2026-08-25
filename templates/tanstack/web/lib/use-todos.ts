import { useCallback, useEffect, useState } from 'react'
import {
  completeTodo,
  createTodo,
  deleteTodo,
  listTodos,
  type Todo,
} from './todos-client'

export type TodosState = {
  todos: Todo[]
  loading: boolean
  add: (title: string) => Promise<void>
  complete: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTodos = (): TodosState => {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const { todos: loaded } = await listTodos()
      setTodos(loaded)
    } catch {
      // A 423 has already been reported to the lock store, which moves the app
      // to the unlock screen; anything else leaves the last good list alone.
      setTodos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const act = useCallback(
    async (request: () => Promise<unknown>) => {
      try {
        await request()
      } catch {
        // Same as above: a 423 is already on its way to the unlock screen, and
        // the reload below is what redraws whatever did survive.
      } finally {
        await reload()
      }
    },
    [reload]
  )

  return {
    todos,
    loading,
    add: (title: string) => act(() => createTodo(title)),
    complete: (id: string) => act(() => completeTodo(id)),
    remove: (id: string) => act(() => deleteTodo(id)),
  }
}
