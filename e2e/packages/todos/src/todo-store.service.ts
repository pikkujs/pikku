export interface Todo {
  id: string
  title: string
  completed: boolean
  createdAt: string
}

export class TodoStore {
  private todos = new Map<string, Todo>()

  constructor() {
    const seed: Todo[] = [
      {
        id: '1',
        title: 'Buy groceries',
        completed: false,
        createdAt: '2026-03-01T10:00:00Z',
      },
      {
        id: '2',
        title: 'Write documentation',
        completed: true,
        createdAt: '2026-03-01T11:00:00Z',
      },
      {
        id: '3',
        title: 'Review pull requests',
        completed: false,
        createdAt: '2026-03-02T09:00:00Z',
      },
    ]
    for (const todo of seed) {
      this.todos.set(todo.id, todo)
    }
  }

  list(): Todo[] {
    return Array.from(this.todos.values())
  }

  get(id: string): Todo | undefined {
    return this.todos.get(id)
  }

  add(title: string): Todo {
    const id = String(Date.now())
    const todo: Todo = {
      id,
      title,
      completed: false,
      createdAt: new Date().toISOString(),
    }
    this.todos.set(id, todo)
    return todo
  }

  delete(id: string): boolean {
    return this.todos.delete(id)
  }

  reset(): void {
    this.todos.clear()
    const seed: Todo[] = [
      {
        id: '1',
        title: 'Buy groceries',
        completed: false,
        createdAt: '2026-03-01T10:00:00Z',
      },
      {
        id: '2',
        title: 'Write documentation',
        completed: true,
        createdAt: '2026-03-01T11:00:00Z',
      },
      {
        id: '3',
        title: 'Review pull requests',
        completed: false,
        createdAt: '2026-03-02T09:00:00Z',
      },
    ]
    for (const todo of seed) {
      this.todos.set(todo.id, todo)
    }
  }
}
