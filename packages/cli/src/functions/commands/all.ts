import { pikkuVoidFunc } from '#pikku'

export const all = pikkuVoidFunc({
  remote: true,
  func: async ({ workflowService, logger }, _data, { rpc }) => {
    // Drive the run directly (the CLI is always inline — no queueService) so we
    // can read back the per-step durations already recorded on each step's
    // state. startWorkflow runs the job to completion before returning in inline
    // mode and re-throws on failure, matching runToCompletion's behaviour.
    const { runId } = await workflowService.startWorkflow(
      'allWorkflow',
      {},
      { type: 'internal' },
      rpc,
      { inline: true }
    )

    // Per-step timing breakdown for debugging slow runs (e.g. which inspector
    // re-runs dominate). Opt-in via PIKKU_TIMING so normal runs stay quiet.
    if (typeof process !== 'undefined' && process.env?.PIKKU_TIMING) {
      const status = await workflowService.getRunStatus(runId)
      const rows = (status?.steps ?? [])
        .filter((s) => typeof s.duration === 'number')
        .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
      const total = rows.reduce((sum, s) => sum + (s.duration ?? 0), 0)
      logger.info(
        `[TIMING] pikku all — ${rows.length} steps, ${total}ms total (slowest first):`
      )
      for (const s of rows) {
        logger.info(`[TIMING]   ${String(s.duration).padStart(7)}ms  ${s.name}`)
      }
    }
  },
})
