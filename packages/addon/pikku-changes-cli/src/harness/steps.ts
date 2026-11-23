/** What the recorder is told about a step besides its name. */
export type StepOptions = {
  attempt?: number
  gate?: string
}

/**
 * Runs each agent call, gate run and commit as one named step. Names are unique within a run, so a
 * durable recorder can return a finished step's stored result instead of running it again. A step
 * returns plain JSON and throws a HarnessInfraError or a plain Error, so a recorder can store either
 * and give it back on replay.
 */
export type HarnessSteps = {
  step: <T>(
    name: string,
    fn: () => Promise<T>,
    options?: StepOptions
  ) => Promise<T>
}

export type StepRecord = StepOptions & {
  name: string
  status: 'done' | 'error'
  durationMs: number
  result?: unknown
  error?: unknown
}

/** Keeps every step in memory; a finished step is not run twice. For tests and one-off runs. */
export class InMemorySteps implements HarnessSteps {
  readonly records: StepRecord[] = []

  async step<T>(
    name: string,
    fn: () => Promise<T>,
    options: StepOptions = {}
  ): Promise<T> {
    const finished = this.records.find(
      (record) => record.name === name && record.status === 'done'
    )
    if (finished) return finished.result as T
    const started = performance.now()
    try {
      const result = await fn()
      this.records.push({
        ...options,
        name,
        status: 'done',
        durationMs: Math.round(performance.now() - started),
        result,
      })
      return result
    } catch (error) {
      this.records.push({
        ...options,
        name,
        status: 'error',
        durationMs: Math.round(performance.now() - started),
        error,
      })
      throw error
    }
  }
}
