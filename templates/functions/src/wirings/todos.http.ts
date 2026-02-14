import {
  defineHTTPRoutes,
  wireHTTPRoutes,
} from '../../.pikku/pikku-types.gen.js'
import {
  listTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  completeTodo,
} from '../functions/todos.functions.js'

const todosRoutes = defineHTTPRoutes({
  auth: false,
  tags: ['todos'],
  routes: {
    list: { method: 'get', route: '/todos', func: listTodos },
    get: { method: 'get', route: '/todos/:id', func: getTodo },
    create: { method: 'post', route: '/todos', func: createTodo },
    update: { method: 'put', route: '/todos/:id', func: updateTodo },
    delete: { method: 'delete', route: '/todos/:id', func: deleteTodo },
    complete: {
      method: 'post',
      route: '/todos/:id/complete',
      func: completeTodo,
    },
  },
})

wireHTTPRoutes({ routes: { todos: todosRoutes } })
