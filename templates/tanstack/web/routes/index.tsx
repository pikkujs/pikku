import { createFileRoute, useRouter } from '@tanstack/react-router'
import { TodoComposer } from '../components/TodoComposer'
import { TodoList } from '../components/TodoList'
import {
  completeTodo,
  createTodo,
  deleteTodo,
  listTodos,
} from '../lib/todos-client'

/**
 * The todos are loaded by the route rather than by an effect in the component.
 *
 * That is what keeps hydration honest: `spa.prerender` writes a shell whose
 * outlet is empty, so a component that renders its list on the first client
 * pass disagrees with the markup it is hydrating into. A loader leaves the
 * first pass pending, which is exactly what the shell already shows.
 */
export const Route = createFileRoute('/')({
  loader: () => listTodos(),
  component: TodosPage,
})

function TodosPage() {
  const { todos } = Route.useLoaderData()
  const router = useRouter()

  const act = async (request: () => Promise<unknown>) => {
    try {
      await request()
    } finally {
      await router.invalidate()
    }
  }

  return (
    <section className="card">
      <h2>Todos</h2>
      <p>Served by pikku, on the same origin as this page.</p>
      <TodoComposer onAdd={(title) => void act(() => createTodo(title))} />
      <TodoList
        todos={todos}
        loading={false}
        onComplete={(id) => void act(() => completeTodo(id))}
        onRemove={(id) => void act(() => deleteTodo(id))}
      />
    </section>
  )
}
