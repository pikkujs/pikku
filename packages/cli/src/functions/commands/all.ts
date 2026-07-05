import { pikkuVoidFunc } from '#pikku'
import { computeMetaDiff, readMetaSnapshot } from '../../utils/meta-diff.js'

export const all = pikkuVoidFunc({
  remote: true,
  func: async ({ workflowService, logger, config }, _data, { rpc }) => {
    // --diff: snapshot the meta BEFORE codegen overwrites it, so we can report
    // exactly what this run changes. Cheap (a few small JSON reads), skipped
    // unless requested.
    const beforeMeta = config.diff ? readMetaSnapshot(config.outDir) : null

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

    // Reached only on success (startWorkflow re-throws → non-zero exit above),
    // so the diff never emits on a failed codegen. Print it as a single marker
    // line on stdout for the sandbox "what changed" build card to consume.
    if (beforeMeta) {
      const diff = computeMetaDiff(beforeMeta, readMetaSnapshot(config.outDir))
      // eslint-disable-next-line no-console
      console.log(`PIKKU_DIFF ${JSON.stringify(diff)}`)
    }

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
