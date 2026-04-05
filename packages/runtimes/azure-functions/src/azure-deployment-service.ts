/**
 * Azure Functions deployment service — routes remote() calls via HTTP.
 *
 * When a gateway (agent, MCP, channel, workflow orchestrator) calls
 * remote('funcName'), this service dispatches to the function's
 * Azure Function via HTTP. Uses the function's URL endpoint.
 *
 * Session propagation uses the existing pikkuRemoteAuthMiddleware:
 * JWT signed with PIKKU_REMOTE_SECRET, session encrypted in payload.
 */

import type { DeploymentService, DeploymentConfig } from '@pikku/core/services'
import type { JWTService } from '@pikku/core/services'
import type { SecretService } from '@pikku/core/services'
import { encryptJSON } from '@pikku/core/crypto-utils'

export class AzureDeploymentService implements DeploymentService {
  private bindings: Map<string, string>

  constructor(
    private jwt: JWTService | undefined,
    private secrets: SecretService,
    functionBindings: Record<string, string>
  ) {
    this.bindings = new Map(Object.entries(functionBindings))
  }

  async init(): Promise<void> {}
  async start(_config: DeploymentConfig): Promise<void> {}
  async stop(): Promise<void> {}

  async invoke(
    funcName: string,
    data: unknown,
    session?: unknown,
    traceId?: string
  ): Promise<unknown> {
    const functionUrl = this.bindings.get(funcName)
    if (!functionUrl) {
      throw new Error(
        `No Azure Function binding for function '${funcName}'. ` +
          `Available bindings: ${[...this.bindings.keys()].join(', ')}`
      )
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(traceId && { 'x-request-id': traceId }),
    }

    // Sign session as JWT for pikkuRemoteAuthMiddleware
    let secret: string | undefined
    try {
      secret = await this.secrets.getSecret('PIKKU_REMOTE_SECRET')
    } catch {}

    if (secret && this.jwt) {
      const sessionEnc = session
        ? await encryptJSON(secret, { session })
        : undefined
      const token = await this.jwt.encode(
        { value: 5, unit: 'minute' },
        {
          aud: 'pikku-remote',
          fn: funcName,
          iat: Math.floor(Date.now() / 1000),
          session: sessionEnc,
        }
      )
      headers.authorization = `Bearer ${token}`
    }

    const url = `${functionUrl}/remote/rpc/${encodeURIComponent(funcName)}`
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      let errorBody: string
      try {
        errorBody = JSON.stringify(await response.json())
      } catch {
        errorBody = await response.text()
      }
      throw new Error(
        `Remote RPC call to '${funcName}' failed: ${response.status} ${response.statusText}. ${errorBody}`
      )
    }

    return response.json()
  }
}
