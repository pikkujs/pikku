import type { Logger } from '../../services/logger.js'
import type { WorkflowRunMirror } from './workflow.types.js'

/** Writes to the mirror, if there is one, without ever failing the run. */
export const writeRunMirror = async (
  mirror: WorkflowRunMirror | undefined,
  getLogger: () => Logger | undefined,
  write: (mirror: WorkflowRunMirror) => Promise<void>
): Promise<void> => {
  if (!mirror) return
  try {
    await write(mirror)
  } catch (err: any) {
    try {
      getLogger()?.warn?.(
        `[pikku] WorkflowRunMirror write failed: ${err?.message ?? err}`
      )
    } catch {
      // knowledge: decisions/internals/workflow-run-mirror-is-never-a-source-of-truth.md
    }
  }
}
