export interface GatewayService {
  start(): Promise<void>

  stop(): Promise<void>
}
