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
  invoke(
    funcName: string,
    data: unknown,
    session?: unknown,
    traceId?: string
  ): Promise<unknown>
}
