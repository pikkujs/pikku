import { useEffect } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { TodoComposer } from '../components/TodoComposer'
import { TodoList } from '../components/TodoList'
import { lockStore } from '../lib/lock-store'
import { useLockStatus } from '../lib/use-lock-status'
import { useTodos } from '../lib/use-todos'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { state } = await lockStore.ensure()
    if (state === 'uninitialized') {
      throw redirect({ to: '/initialize' })
    }
    if (state === 'locked') {
      throw redirect({ to: '/unlock' })
    }
  },
  component: TodosPage,
})

function TodosPage() {
  const navigate = useNavigate()
  const status = useLockStatus()
  const { todos, loading, add, complete, remove } = useTodos()

  // The store can shut while this page is open — someone locked it elsewhere,
  // or the server restarted. Leaving for the unlock screen is the only honest
  // thing to show; the alternative is a list that silently stops answering.
  useEffect(() => {
    if (status && status.state !== 'unlocked') {
      void navigate({ to: '/unlock' })
    }
  }, [status, navigate])

  return (
    <section className="card">
      <h2>Todos</h2>
      <p>Served by pikku, on the same origin as this page.</p>
      <TodoComposer onAdd={add} />
      <TodoList
        todos={todos}
        loading={loading}
        onComplete={complete}
        onRemove={remove}
      />
    </section>
  )
}
