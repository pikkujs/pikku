export interface TriggerService {
  start(): Promise<void>

  stop(): Promise<void>
}
