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
  findFunction(name: string): Promise<DeploymentInfo[]>
}
