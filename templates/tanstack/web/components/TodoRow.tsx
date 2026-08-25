import type * as React from 'react'
import type { Todo } from '../lib/todos-client'

export type TodoRowProps = {
  todo: Todo
  onComplete: (id: string) => void
  onRemove: (id: string) => void
}

export const TodoRow: React.FC<TodoRowProps> = ({
  todo,
  onComplete,
  onRemove,
}) => {
  return (
    <li className="row">
      <input
        type="checkbox"
        checked={todo.completed}
        disabled={todo.completed}
        aria-label={`Complete ${todo.title}`}
        onChange={() => onComplete(todo.id)}
      />
      <span className={todo.completed ? 'title done' : 'title'}>
        {todo.title}
      </span>
      <button
        type="button"
        className="ghost"
        aria-label={`Delete ${todo.title}`}
        onClick={() => onRemove(todo.id)}
      >
        Delete
      </button>
    </li>
  )
}
