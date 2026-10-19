export class NoopService {
  private callCount = 0

  execute(): { success: true; callCount: number } {
    this.callCount++
    return {
      success: true,
      callCount: this.callCount,
    }
  }

  getCallCount(): number {
    return this.callCount
  }
}
