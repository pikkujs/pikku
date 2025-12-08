import { wireChannel } from '../../.pikku/pikku-types.gen.js'
import { login } from '../functions/auth.functions.js'
import {
  onConnect,
  onDisconnect,
  subscribe,
  unsubscribe,
} from '../functions/channel.functions.js'
import {
  listTodos,
  createTodo,
  completeTodo,
} from '../functions/todos.functions.js'

wireChannel({
  name: 'todos-live',
  route: '/',
  onConnect,
  onDisconnect,
  onMessageWiring: {
    action: {
      auth: {
        func: login,
        auth: false,
      },
      subscribe: {
        func: subscribe,
      },
      unsubscribe: {
        func: unsubscribe,
      },
      list: {
        func: listTodos,
      },
      create: {
        func: createTodo,
      },
      complete: {
        func: completeTodo,
      },
    },
  },
  tags: ['realtime', 'todos'],
})
