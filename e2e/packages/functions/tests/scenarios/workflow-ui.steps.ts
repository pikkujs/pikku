/**
 * Opening a specific workflow run on the console canvas.
 *
 * The run to open is identified by the id the scenario already started, so the
 * page is never asked to guess which run it is looking at — the cucumber
 * version fetched "the latest run for this workflow", which quietly followed
 * whichever run a concurrently-running scenario had left behind.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const opensWorkflowRun = pikkuScenarioStep<
  { workflowName: string; runId?: string },
  { opened: string },
  true
>({
  name: 'opensWorkflowRun',
  description: 'opens one workflow run on the console canvas',
  template: 'opens the {workflowName} run on the canvas',
  browser: true,
  func: async (_services, { workflowName, runId }, { browser }) => {
    if (!runId) {
      throw new Error(
        `opensWorkflowRun needs the run id — start the run first and pass its runId`
      )
    }
    await browser.goto(
      `/console/workflow?id=${encodeURIComponent(workflowName)}&runId=${encodeURIComponent(runId)}`
    )
    await browser
      .locate({ testId: 'workflow-node' })
      .first()
      .waitFor({ state: 'visible' })
    return { opened: runId }
  },
})
