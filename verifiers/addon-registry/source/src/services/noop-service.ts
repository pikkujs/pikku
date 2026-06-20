/** Minimal addon-owned service: counts how many times it was called. */
export class NoopService {
  private callCount = 0

  execute(): { callCount: number } {
    this.callCount += 1
    return { callCount: this.callCount }
  }
}
