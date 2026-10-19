import { wireCLI, pikkuCLICommand } from '#pikku/cli/pikku-cli-types.gen.js'
import { listIssues } from '../functions/list-issues.function.js'
import { expireInvitations } from '../functions/expire-invitations.function.js'

/**
 * Note that `issues` still takes an orgId and still runs the tenancy
 * permission. An operator on the CLI is not exempt: the same function, the same
 * two gates. A back-office script that could read any tenant's data would be
 * the largest hole in the product.
 */
// @snippet start wireCli
wireCLI({
  program: 'teams',
  commands: {
    issues: pikkuCLICommand({
      description: 'List issues in an organisation',
      func: listIssues,
    }),
    'expire-invites': pikkuCLICommand({
      description: 'Expire invitations that were never accepted',
      func: expireInvitations,
    }),
  },
})
// @snippet end wireCli
