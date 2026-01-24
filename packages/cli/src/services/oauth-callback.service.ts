export type OAuthCallbackResult = {
  code: string
  state: string
}

type PendingCallback = {
  resolve: (result: OAuthCallbackResult) => void
  reject: (error: Error) => void
  timeoutId: NodeJS.Timeout
}

/**
 * Service to coordinate OAuth callbacks between HTTP handler and CLI command.
 * Uses explicit Map-based registration instead of generic EventEmitter.
 */
export class OAuthCallbackService {
  private pendingCallbacks = new Map<string, PendingCallback>()

  /**
   * Register a callback and wait for the OAuth response.
   * Returns a promise that resolves when handleCallback is called with matching state.
   */
  waitForCallback(
    state: string,
    timeoutMs: number = 5 * 60 * 1000
  ): Promise<OAuthCallbackResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCallbacks.delete(state)
        reject(new Error('OAuth callback timed out after 5 minutes'))
      }, timeoutMs)

      this.pendingCallbacks.set(state, { resolve, reject, timeoutId })
    })
  }

  /**
   * Called by HTTP callback handler when OAuth provider redirects back.
   * Returns true if there was a pending callback for this state.
   */
  handleCallback(result: OAuthCallbackResult): boolean {
    const pending = this.pendingCallbacks.get(result.state)
    if (!pending) {
      return false
    }
    clearTimeout(pending.timeoutId)
    this.pendingCallbacks.delete(result.state)
    pending.resolve(result)
    return true
  }

  /**
   * Called by HTTP callback handler on error.
   */
  handleError(state: string, errorMessage: string): boolean {
    const pending = this.pendingCallbacks.get(state)
    if (!pending) {
      return false
    }
    clearTimeout(pending.timeoutId)
    this.pendingCallbacks.delete(state)
    pending.reject(new Error(errorMessage))
    return true
  }

  /**
   * Check if there's a pending callback for the given state.
   */
  hasPendingCallback(state: string): boolean {
    return this.pendingCallbacks.has(state)
  }

  /**
   * Cancel a pending callback (cleanup).
   */
  cancelCallback(state: string): void {
    const pending = this.pendingCallbacks.get(state)
    if (pending) {
      clearTimeout(pending.timeoutId)
      this.pendingCallbacks.delete(state)
    }
  }
}
