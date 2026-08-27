import type * as React from 'react'
import { TodoRow } from './TodoRow'
import type { Todo } from '../lib/todos-client'

export type TodoListProps = {
  todos: Todo[]
  loading: boolean
  onComplete: (id: string) => void
  onRemove: (id: string) => void
}

export const TodoList: React.FC<TodoListProps> = ({
  todos,
  loading,
  onComplete,
  onRemove,
}) => {
  if (loading) {
    return <p className="empty">Loading…</p>
  }

  if (todos.length === 0) {
    return <p className="empty">Nothing here yet. Add the first one above.</p>
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {todos.map((todo) => (
        <TodoRow
          key={todo.id}
          todo={todo}
          onComplete={onComplete}
          onRemove={onRemove}
        />
      ))}
    </ul>
  )
}
