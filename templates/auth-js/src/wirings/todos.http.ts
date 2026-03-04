import {
  defineHTTPRoutes,
  wireHTTPRoutes,
} from '../../.pikku/pikku-types.gen.js'
import {
  listTodos,
  getTodo,
  createTodo,
  deleteTodo,
} from '../functions/todos.functions.js'

const todosRoutes = defineHTTPRoutes({
  auth: true,
  routes: {
    list: { method: 'get', route: '/todos', func: listTodos },
    get: { method: 'get', route: '/todos/:id', func: getTodo },
    create: { method: 'post', route: '/todos', func: createTodo },
    delete: { method: 'delete', route: '/todos/:id', func: deleteTodo },
  },
})

wireHTTPRoutes({ routes: { todos: todosRoutes } })
