import { wireChannel } from '#pikku/channel'
import {
  authenticate,
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

// @snippet start wire-channel
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
// @snippet end wire-channel
