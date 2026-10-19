import { wireCLI, pikkuCLICommand } from '#pikku/cli/pikku-cli-types.gen.js'
import { listRuns } from '../functions/list-runs.function.js'
import { runFlow } from '../functions/run-flow.function.js'
import { cancelRun } from '../functions/cancel-run.function.js'

/**
 * The same three functions the HTTP routes and the UI call.
 *
 * This is the point of the template: an operator on a laptop at 3am runs
 * `flow cancel --runId=...` and gets the identical code path, the identical
 * scope check and the identical audit entry as the button in the UI. There is
 * no ops script that does it "slightly differently" to discover later.
 */
// @snippet start wireCli
wireCLI({
  program: 'flow',
  commands: {
    runs: pikkuCLICommand({
      description: 'List recent runs, newest first',
      func: listRuns,
    }),
    run: pikkuCLICommand({
      description: 'Start a flow by hand',
      func: runFlow,
    }),
    cancel: pikkuCLICommand({
      description: 'Cancel a queued or running execution',
      func: cancelRun,
    }),
  },
})
// @snippet end wireCli
