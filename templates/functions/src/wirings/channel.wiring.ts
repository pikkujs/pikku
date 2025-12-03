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
      // Authentication
      auth: {
        func: login,
        auth: false,
      },
      // Subscribe to todo updates via EventHub
      subscribe: {
        func: subscribe,
      },
      unsubscribe: {
        func: unsubscribe,
      },
      // Todo operations via WebSocket
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
