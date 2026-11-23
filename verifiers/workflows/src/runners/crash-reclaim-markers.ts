import { createScriptContent, getText, putText } from '../script-content.js'

export type StepStart = { attempt: number; pid: number }

const BUCKET = 'markers'

/**
 * Record that a step attempt started, and return which attempt it is.
 *
 * The content service has no exclusive create, so the attempt number is the
 * count of markers already stored for the run plus one. Attempts of one run
 * never overlap (the previous worker was killed or finished first), so the
 * number still survives the worker that wrote it being killed.
 */
export const recordStepStart = async (
  dir: string,
  runId: string,
  pid: number
): Promise<number> => {
  const content = createScriptContent(dir)
  const existing = await content.listFilesByPrefix(BUCKET, `${runId}/`)
  const attempt = existing.length + 1
  await putText(content, BUCKET, `${runId}/${attempt}`, String(pid))
  return attempt
}

export const readStepStarts = async (
  dir: string,
  runId: string
): Promise<StepStart[]> => {
  const content = createScriptContent(dir)
  const keys = await content.listFilesByPrefix(BUCKET, `${runId}/`)
  const starts: StepStart[] = []
  for (const key of keys) {
    const pid = await getText(content, BUCKET, key)
    // The content service creates the file before its body arrives; a marker
    // with no pid yet is a start still being recorded.
    if (pid === '') continue
    starts.push({
      attempt: Number(key.slice(runId.length + 1)),
      pid: Number(pid),
    })
  }
  return starts.sort((a, b) => a.attempt - b.attempt)
}
