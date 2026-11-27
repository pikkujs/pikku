/**
 * The steps passes in this process are working. On a run lease that is a
 * pass-through, this is all that tells a step being worked from one that was
 * lost; it says nothing about another process.
 */
export class OpenSteps {
  private readonly open = new Map<string, number>()

  has(runId: string, stepName: string): boolean {
    return this.open.has(`${runId}:${stepName}`)
  }

  /** Counts the step open as soon as it is called, until `work` settles. */
  async hold<T>(
    runId: string,
    stepName: string,
    work: () => Promise<T>
  ): Promise<T> {
    const key = `${runId}:${stepName}`
    this.open.set(key, (this.open.get(key) ?? 0) + 1)
    try {
      return await work()
    } finally {
      const holders = this.open.get(key)! - 1
      if (holders > 0) this.open.set(key, holders)
      else this.open.delete(key)
    }
  }
}
