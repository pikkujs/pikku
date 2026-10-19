import type * as React from 'react'
import { useState } from 'react'

export type TodoComposerProps = {
  onAdd: (title: string) => void
}

export const TodoComposer: React.FC<TodoComposerProps> = ({ onAdd }) => {
  const [title, setTitle] = useState('')

  return (
    <form
      className="compose"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = title.trim()
        if (trimmed) {
          onAdd(trimmed)
          setTitle('')
        }
      }}
    >
      <input
        aria-label="New todo"
        placeholder="What needs doing?"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button type="submit" disabled={title.trim().length === 0}>
        Add
      </button>
    </form>
  )
}
