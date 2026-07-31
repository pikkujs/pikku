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
