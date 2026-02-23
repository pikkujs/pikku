import { pikkuSessionlessFunc } from '#pikku'

export const streamWorkflowRun = pikkuSessionlessFunc<{ runId: string }, any>({
  title: 'Stream Workflow Run',
  description: 'SSE stream of workflow run status and step state changes.',
  expose: false,
  auth: false,
  func: async ({ workflowRunService }, { runId }, { channel }) => {
    if (!channel || !workflowRunService) return

    let lastHash = ''
    const poll = async () => {
      const run = await workflowRunService.getRun(runId)
      if (!run) {
        channel.close()
        return false
      }

      const steps = await workflowRunService.getRunSteps(runId)
      const hash = JSON.stringify({
        s: run.status,
        steps: steps.map((s) => [s.stepName, s.status]),
      })

      if (hash !== lastHash) {
        lastHash = hash
        channel.send({ type: 'update', run, steps })
      }

      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        channel.send({ type: 'done' })
        channel.close()
        return false
      }
      return true
    }

    const shouldContinue = await poll()
    if (!shouldContinue) return

    await new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        const cont = await poll()
        if (!cont) {
          clearInterval(interval)
          resolve()
        }
      }, 1000)
    })
  },
})
