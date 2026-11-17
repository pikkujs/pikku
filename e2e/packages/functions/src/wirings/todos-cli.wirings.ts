import { refCLI } from '#pikku/function'
import { wireCLI } from '#pikku/cli/pikku-cli-types.gen.js'

// @snippet start refCLI
wireCLI({
  program: 'todos',
  commands: {
    todos: {
      description: 'Commands from an installed addon',
      subcommands: refCLI('todos:todoCommands'),
    },
  },
})
// @snippet end refCLI
