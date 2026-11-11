import { wireAddon } from '#pikku/addon'

/**
 * `mcp` names the tools this app offers from the addon. None of the todos
 * functions declares itself a tool, so the list is the only thing that puts one
 * on the menu — and it puts exactly one there.
 *
 * `expose` does the same for `POST /rpc`, from the functions the addon itself
 * declares exposed — `listTodos`, `resetTodos` and `getTodo`. `deleteTodo` is
 * not one of them, so no list could open it, and it stays unreachable over RPC.
 */
wireAddon({
  name: 'todos',
  package: '@pikku/addon-todos',
  mcp: ['listTodos'],
  expose: ['listTodos', 'resetTodos', 'getTodo'],
})
