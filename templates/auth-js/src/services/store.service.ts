import type { Todo, User } from '../schemas.js'

/**
 * Singleton in-memory store for todos and users.
 * Persists during server lifetime.
 */
export class TodoStore {
  private todos: Map<string, Todo> = new Map()
  private users: Map<string, User> = new Map()
  private idCounter = 1

  constructor() {
    this.users.set('user1', {
      id: 'user1',
      username: 'demo',
      email: 'demo@example.com',
    })
    this.users.set('user2', {
      id: 'user2',
      username: 'admin',
      email: 'admin@example.com',
    })

    const now = new Date().toISOString()
    this.todos.set('todo1', {
      id: 'todo1',
      userId: 'user1',
      title: 'Learn Pikku',
      description: 'Go through the Pikku documentation and examples',
      completed: false,
      priority: 'high',
      tags: ['learning', 'pikku'],
      createdAt: now,
      updatedAt: now,
    })
    this.todos.set('todo2', {
      id: 'todo2',
      userId: 'user1',
      title: 'Build a todo app',
      description: 'Create a comprehensive todo app example',
      completed: true,
      priority: 'medium',
      tags: ['project', 'pikku'],
      createdAt: now,
      updatedAt: now,
    })
  }

  getUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find((u) => u.username === username)
  }

  getUserById(id: string): User | undefined {
    return this.users.get(id)
  }

  createTodo(
    userId: string,
    data: Omit<Todo, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Todo {
    const id = `todo${this.idCounter++}`
    const now = new Date().toISOString()
    const todo: Todo = {
      ...data,
      id,
      userId,
      createdAt: now,
      updatedAt: now,
    }
    this.todos.set(id, todo)
    return todo
  }

  getTodo(id: string): Todo | undefined {
    return this.todos.get(id)
  }

  getTodosByUser(
    userId: string,
    filters?: {
      completed?: boolean
      priority?: 'low' | 'medium' | 'high'
      tag?: string
    }
  ): Todo[] {
    let todos = Array.from(this.todos.values()).filter(
      (t) => t.userId === userId
    )

    if (filters?.completed !== undefined) {
      todos = todos.filter((t) => t.completed === filters.completed)
    }
    if (filters?.priority) {
      todos = todos.filter((t) => t.priority === filters.priority)
    }
    if (filters?.tag) {
      todos = todos.filter((t) => t.tags.includes(filters.tag!))
    }

    return todos.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  deleteTodo(id: string): boolean {
    return this.todos.delete(id)
  }
}
