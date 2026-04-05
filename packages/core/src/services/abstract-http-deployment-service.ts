import type { JWTService } from './jwt-service.js'
import type { SecretService } from './secret-service.js'
import { encryptJSON } from '../crypto-utils.js'
import type { DeploymentService, DeploymentConfig } from './deployment-service.js'

/**
 * Abstract base class for deployment services that dispatch remote RPC
 * calls via HTTP. Handles JWT signing, session propagation, and traceId
 * forwarding so implementations only need to resolve the target URL
 * and send the request.
 */
export abstract class AbstractHTTPDeploymentService
  implements DeploymentService
{
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
    session?: unknown,
    traceId?: string
  ): Promise<unknown> {
    const headers = await this.buildRemoteHeaders(funcName, session, traceId)
    return this.dispatch(funcName, data, headers)
  }

  /**
   * Build headers with JWT-signed session and traceId for
   * pikkuRemoteAuthMiddleware on the receiving end.
   */
  protected async buildRemoteHeaders(
    funcName: string,
    session?: unknown,
    traceId?: string
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(traceId && { 'x-request-id': traceId }),
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
