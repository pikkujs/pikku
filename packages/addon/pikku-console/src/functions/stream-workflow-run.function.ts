import { pikkuSessionlessFunc } from '#pikku/addon/function'

export const streamWorkflowRun = pikkuSessionlessFunc<{ runId: string }, any>({
  title: 'Stream Workflow Run',
  description: 'SSE stream of workflow run status and step state changes.',
  expose: false,
  auth: false,
  func: async ({ workflowRunService }, { runId }, { channel }) => {
    if (!channel) return

    let lastHash = ''
    const poll = async () => {
      const run = await workflowRunService.getRun(runId)
      if (!run) {
        await channel.close()
        return false
      }

      const steps = await workflowRunService.getRunSteps(runId)
      const hash = JSON.stringify({
        s: run.status,
        steps: steps.map((s) => [s.stepName, s.status]),
      })

      if (hash !== lastHash) {
        lastHash = hash
        await channel.send({ type: 'update', run, steps })
      }

      if (
        [
          'completed',
          'failed',
          'cancelled',
          'compensated',
          'compensation_failed',
        ].includes(run.status)
      ) {
        await channel.send({ type: 'done', status: run.status })
        await channel.close()
        return false
      }
      return true
    }

    const shouldContinue = await poll()
    if (!shouldContinue) return

    await new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        poll().then(
          (cont) => {
            if (!cont) {
              clearInterval(interval)
              resolve()
            }
          },
          (error) => {
            clearInterval(interval)
            reject(error)
          }
        )
      }, 1000)
    })
  },
})
