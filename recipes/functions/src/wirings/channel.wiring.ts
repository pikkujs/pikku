import { wireChannel } from '#pikku/channel'
import {
  authenticate,
  onConnect,
  onDisconnect,
} from '../functions/channel.functions.js'
import {
  listTodos,
  createTodo,
  completeTodo,
  subscribe,
} from '../functions/todos.functions.js'

wireChannel({
  name: 'todos-live',
  route: '/',
  onConnect,
  onDisconnect,
  onMessageWiring: {
    action: {
      auth: {
        func: authenticate,
        auth: false,
      },
      subscribe: {
        func: subscribe,
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
