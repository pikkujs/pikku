/**
 * Cloudflare deployment service — routes remote() calls through service bindings.
 *
 * When a gateway (agent, MCP, channel, workflow orchestrator) calls
 * remote('funcName'), this service dispatches to the function's worker
 * via env.FUNC_WORKER.fetch(). Free, ~0ms, internal.
 *
 * Session propagation uses the existing pikkuRemoteAuthMiddleware:
 * JWT signed with PIKKU_REMOTE_SECRET, session encrypted in payload.
 */

import type { DeploymentService, DeploymentConfig } from '@pikku/core/services'
import type { JWTService } from '@pikku/core/services'
import type { SecretService } from '@pikku/core/services'
import { encryptJSON } from '@pikku/core/crypto-utils'

export type CloudflareEnv = Record<string, unknown>

interface ServiceBinding {
  fetch: (request: Request) => Promise<Response>
}

export class CloudflareDeploymentService implements DeploymentService {
  private bindings: Map<string, string>

  constructor(
    private env: CloudflareEnv,
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
    session?: unknown
  ): Promise<unknown> {
    const bindingName = this.bindings.get(funcName)
    if (!bindingName) {
      throw new Error(
        `No service binding for function '${funcName}'. ` +
          `Available bindings: ${[...this.bindings.keys()].join(', ')}`
      )
    }

    const binding = this.env[bindingName] as ServiceBinding | undefined
    if (!binding?.fetch) {
      throw new Error(
        `Service binding '${bindingName}' not found in env for function '${funcName}'`
      )
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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
          iat: Date.now(),
          session: sessionEnc,
        }
      )
      headers.Authorization = `Bearer ${token}`
    }

    const request = new Request(
      `http://internal/rpc/${encodeURIComponent(funcName)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ data }),
      }
    )

    const response = await binding.fetch(request)

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
