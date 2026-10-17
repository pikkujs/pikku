/** Heartbeat timing for a {@link DeploymentService}, in milliseconds. */
export interface DeploymentServiceConfig {
  heartbeatInterval?: number
  heartbeatTtl?: number
}

/**
 * This deployment's identity, the endpoint other deployments reach it on, and
 * the functions it serves (all registered functions when omitted).
 */
export interface DeploymentConfig {
  deploymentId: string
  endpoint: string
  functions?: string[]
}

/** Another live deployment, as found in the registry. */
export interface DeploymentInfo {
  deploymentId: string
  endpoint: string
}

/**
 * Service discovery for split deployments: each deployment registers the
 * functions it serves and keeps a heartbeat, and `invoke` calls a function
 * hosted by another deployment. An RPC whose target is not registered locally
 * falls back to `invoke`, carrying the caller's session and trace id.
 * Implementations ship in the database and runtime packages (Kysely, Redis,
 * MongoDB, Cloudflare, Lambda, Azure).
 */
export interface DeploymentService {
  init(): Promise<void>
  start(config: DeploymentConfig): Promise<void>
  stop(): Promise<void>
  /**
   * The implementation owns the whole transport: resolving the target
   * (endpoint, service binding), propagating the session (JWT signing,
   * headers) and making the call. Callers supply no transport detail.
   */
  invoke(
    funcName: string,
    data: unknown,
    session?: unknown,
    traceId?: string
  ): Promise<unknown>
}
