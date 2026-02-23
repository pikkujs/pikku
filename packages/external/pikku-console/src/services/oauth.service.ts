import type { OAuth2CredentialConfig } from '@pikku/core/secret'

export interface PendingOAuthFlow {
  credentialName: string
  oauth2: OAuth2CredentialConfig
  secretId: string
  callbackUrl: string
  createdAt: number
}

const FLOW_TTL_MS = 10 * 60 * 1000

export class OAuthService {
  private pendingFlows = new Map<string, PendingOAuthFlow>()

  addPendingFlow(state: string, flow: PendingOAuthFlow): void {
    this.cleanup()
    this.pendingFlows.set(state, flow)
  }

  getPendingFlow(state: string): PendingOAuthFlow | undefined {
    this.cleanup()
    return this.pendingFlows.get(state)
  }

  removePendingFlow(state: string): void {
    this.pendingFlows.delete(state)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [state, flow] of this.pendingFlows) {
      if (now - flow.createdAt > FLOW_TTL_MS) {
        this.pendingFlows.delete(state)
      }
    }
  }
}
