/**
 * Type constraint tests for wireHTTPRoutes and defineHTTPRoutes
 *
 * Tests the grouped route wiring API that allows composing routes
 * with shared configuration (basePath, tags, auth, middleware).
 */

import { pikkuSessionlessFunc } from '#pikku'
import { wireHTTPRoutes, defineHTTPRoutes } from '@pikku/core/http'

// Sample functions for testing
const listTodos = pikkuSessionlessFunc<void, { id: string }[]>(async () => [])
const getTodo = pikkuSessionlessFunc<{ id: string }, { id: string }>(
  async ({}, { id }) => ({ id })
)
const createTodo = pikkuSessionlessFunc<{ title: string }, { id: string }>(
  async () => ({ id: '1' })
)
const updateTodo = pikkuSessionlessFunc<
  { id: string; title: string },
  { id: string }
>(async ({}, { id }) => ({ id }))

// ==========================================
// defineHTTPRoutes - Basic Usage
// ==========================================

// Valid: Simple routes without group config
defineHTTPRoutes({
  list: { method: 'get', route: '/todos', func: listTodos },
  get: { method: 'get', route: '/todos/:id', func: getTodo },
})

// Valid: Routes with group-level config
defineHTTPRoutes({
  tags: ['todos'],
  routes: {
    list: { method: 'get', route: '/todos', func: listTodos },
    get: { method: 'get', route: '/todos/:id', func: getTodo },
  },
})

// Valid: Nested route structure
defineHTTPRoutes({
  basePath: '/api',
  routes: {
    todos: {
      list: { method: 'get', route: '/todos', func: listTodos },
      create: { method: 'post', route: '/todos', func: createTodo },
    },
  },
})

// ==========================================
// wireHTTPRoutes - Basic Usage
// ==========================================

// Valid: Flat object routes
wireHTTPRoutes({
  routes: {
    list: { method: 'get', route: '/todos', func: listTodos },
    get: { method: 'get', route: '/todos/:id', func: getTodo },
  },
})

// Valid: Routes with basePath
wireHTTPRoutes({
  basePath: '/api/v1',
  routes: {
    list: { method: 'get', route: '/todos', func: listTodos },
  },
})

// Valid: Routes with tags
wireHTTPRoutes({
  tags: ['api', 'todos'],
  routes: {
    list: { method: 'get', route: '/todos', func: listTodos },
  },
})

// Valid: Array format routes
wireHTTPRoutes({
  basePath: '/api',
  routes: [
    { method: 'get', route: '/todos', func: listTodos },
    { method: 'post', route: '/todos', func: createTodo },
  ],
})

// ==========================================
// wireHTTPRoutes - Composing Route Contracts
// ==========================================

// Valid: Composing multiple route contracts
const todosContract = defineHTTPRoutes({
  tags: ['todos'],
  routes: {
    list: { method: 'get', route: '/todos', func: listTodos },
    get: { method: 'get', route: '/todos/:id', func: getTodo },
  },
})

wireHTTPRoutes({
  basePath: '/api/v1',
  routes: {
    todos: todosContract,
  },
})

// ==========================================
// wireHTTPRoutes - Nested Maps
// ==========================================

// Valid: Deeply nested route maps
wireHTTPRoutes({
  basePath: '/api',
  routes: {
    v1: {
      todos: {
        list: { method: 'get', route: '/todos', func: listTodos },
        get: { method: 'get', route: '/todos/:id', func: getTodo },
      },
    },
  },
})

// ==========================================
// Route with Functions
// ==========================================

// Valid: Route params match function input
wireHTTPRoutes({
  routes: {
    get: { method: 'get', route: '/todos/:id', func: getTodo },
  },
})

// Valid: Multiple route params
wireHTTPRoutes({
  routes: {
    update: {
      method: 'put',
      route: '/todos/:id',
      func: updateTodo,
    },
  },
})

// Note: wireHTTPRoutes uses HTTPRouteConfig which doesn't have TypeScript-level
// route param checking like wireHTTP does. Route param validation happens
// at build time via the inspector.

// ==========================================
// Config Cascading
// ==========================================

// Valid: Tags cascade from group to routes
wireHTTPRoutes({
  tags: ['api'],
  routes: {
    todos: defineHTTPRoutes({
      tags: ['todos'],
      routes: {
        list: {
          method: 'get',
          route: '/todos',
          func: listTodos,
          tags: ['list'],
        },
      },
    }),
  },
})

// Valid: basePath concatenates
wireHTTPRoutes({
  basePath: '/api',
  routes: {
    v1: defineHTTPRoutes({
      basePath: '/v1',
      routes: {
        todos: { method: 'get', route: '/todos', func: listTodos },
      },
    }),
  },
})
