import { wireHTTP } from '../../.pikku/pikku-types.gen.js'
import {
  listTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  completeTodo,
} from '../functions/todos.functions.js'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/todos',
  func: listTodos,
  tags: ['todos'],
})

wireHTTP({
  auth: false,
  method: 'get',
  route: '/todos/:id',
  func: getTodo,
  tags: ['todos'],
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/todos',
  func: createTodo,
  tags: ['todos'],
})

wireHTTP({
  auth: false,
  method: 'put',
  route: '/todos/:id',
  func: updateTodo,
  tags: ['todos'],
})

wireHTTP({
  auth: false,
  method: 'delete',
  route: '/todos/:id',
  func: deleteTodo,
  tags: ['todos'],
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/todos/:id/complete',
  func: completeTodo,
  tags: ['todos'],
})
