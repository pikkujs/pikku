import { createFileRoute } from '@tanstack/react-router'
import { TodoComposer } from '../components/TodoComposer'
import { TodoList } from '../components/TodoList'
import { useTodos } from '../lib/use-todos'

export const Route = createFileRoute('/')({
  component: TodosPage,
})

function TodosPage() {
  const { todos, loading, add, complete, remove } = useTodos()

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
