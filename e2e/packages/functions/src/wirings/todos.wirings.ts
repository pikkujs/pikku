import { wireAddon } from '#pikku/addon'

/**
 * `mcp` names the tools this app offers from the addon. None of the todos
 * functions declares itself a tool, so the list is the only thing that puts one
 * on the menu — and it puts exactly one there.
 */
wireAddon({
  name: 'todos',
  package: '@pikku/addon-todos',
  mcp: ['listTodos'],
})
