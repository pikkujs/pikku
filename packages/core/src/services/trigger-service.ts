/**
 * Starts and stops the trigger subscriptions registered with `wireTrigger`, so
 * their target functions run when the source fires.
 */
export interface TriggerService {
  start(): Promise<void>

  stop(): Promise<void>
}
