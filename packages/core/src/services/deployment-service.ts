import type { JWTService } from './jwt-service.js'
import type { SecretService } from './secret-service.js'
import { encryptJSON } from '../crypto-utils.js'

export interface DeploymentServiceConfig {
  heartbeatInterval?: number
  heartbeatTtl?: number
}

export interface DeploymentConfig {
  deploymentId: string
  endpoint: string
  functions?: string[]
}

export interface DeploymentInfo {
  deploymentId: string
  endpoint: string
}

export interface DeploymentService {
  init(): Promise<void>
  start(config: DeploymentConfig): Promise<void>
  stop(): Promise<void>
  /**
   * Dispatch a remote RPC call to a function.
   * The deployment service owns the full transport:
   * - Resolving the target (endpoint, service binding, etc.)
   * - Session propagation (JWT signing, headers)
   * - The actual network call
   *
   * @param funcName - The function to invoke
   * @param data - Input data for the function
   * @param session - User session to propagate (optional)
   */
  invoke(funcName: string, data: unknown, session?: unknown): Promise<unknown>
}

/**
 * Abstract base class for deployment services that dispatch remote RPC
 * calls via HTTP. Handles JWT signing and session propagation so
 * implementations only need to resolve the target URL and send the request.
 */
export abstract class AbstractDeploymentService implements DeploymentService {
  constructor(
    protected jwt?: JWTService,
    protected secrets?: SecretService
  ) {}

  async init(): Promise<void> {}
  async start(_config: DeploymentConfig): Promise<void> {}
  async stop(): Promise<void> {}

  async invoke(
    funcName: string,
    data: unknown,
    session?: unknown
  ): Promise<unknown> {
    const headers = await this.buildRemoteHeaders(funcName, session)
    return this.dispatch(funcName, data, headers)
  }

  /**
   * Build Authorization headers with JWT-signed session for
   * pikkuRemoteAuthMiddleware on the receiving end.
   */
  protected async buildRemoteHeaders(
    funcName: string,
    session?: unknown
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }

    let secret: string | undefined
    try {
      secret = await this.secrets?.getSecret('PIKKU_REMOTE_SECRET')
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

    return headers
  }

  /**
   * Dispatch the actual remote call. Implementations resolve the target
   * and send the request.
   */
  protected abstract dispatch(
    funcName: string,
    data: unknown,
    headers: Record<string, string>
  ): Promise<unknown>
}
