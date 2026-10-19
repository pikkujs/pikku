import { wireCLI, pikkuCLICommand } from '#pikku/cli/pikku-cli-types.gen.js'
import { listDrafts } from '../functions/list-drafts.function.js'
import { publishScheduled } from '../functions/publish-scheduled.function.js'

// @snippet start wireCli
wireCLI({
  program: 'press',
  commands: {
    posts: pikkuCLICommand({
      description: 'List every post, including drafts',
      func: listDrafts,
    }),
    'publish-due': pikkuCLICommand({
      description: 'Flip scheduled posts whose date has passed',
      func: publishScheduled,
    }),
  },
})
// @snippet end wireCli
