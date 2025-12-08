import { wireCLI, pikkuCLICommand } from '../../.pikku/pikku-types.gen.js'
import {
  listTodos,
  getTodo,
  createTodo,
  completeTodo,
  deleteTodo,
} from '../functions/todos.functions.js'
import {
  todoListRenderer,
  todoRenderer,
  successRenderer,
  jsonRenderer,
} from './cli.render.js'

wireCLI({
  program: 'todo-cli',
  commands: {
    list: pikkuCLICommand({
      func: listTodos,
      description: 'List all todos',
      render: todoListRenderer,
      options: {
        completed: {
          description: 'Filter by completed status',
          short: 'c',
        },
        priority: {
          description: 'Filter by priority (low, medium, high)',
          short: 'p',
        },
      },
    }),

    add: pikkuCLICommand({
      parameters: '<title>',
      func: createTodo,
      description: 'Add a new todo',
      render: successRenderer,
      options: {
        priority: {
          description: 'Set priority (low, medium, high)',
          short: 'p',
          default: 'medium' as const,
        },
        dueDate: {
          description: 'Set due date (YYYY-MM-DD)',
          short: 'd',
        },
      },
    }),

    show: pikkuCLICommand({
      parameters: '<id>',
      func: getTodo,
      description: 'Show a todo by ID',
      render: todoRenderer,
    }),

    complete: pikkuCLICommand({
      parameters: '<id>',
      func: completeTodo,
      description: 'Mark a todo as complete',
      render: successRenderer,
    }),

    delete: pikkuCLICommand({
      parameters: '<id>',
      func: deleteTodo,
      description: 'Delete a todo',
      render: successRenderer,
    }),
  },

  options: {
    verbose: {
      description: 'Enable verbose output',
      short: 'v',
      default: false,
    },
  },

  render: jsonRenderer,
})
