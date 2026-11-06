// Stand-ins for the @pikku/core surface the classification scan reads. Sinks
// are matched on interface name and brands structurally, so these behave as
// the real ones do.
export type Private<T> = T & { readonly __classification__?: 'private' }
export type Pii<T> = T & { readonly __classification__?: 'pii' }
export type Secret<T> = T & { readonly __classification__?: 'secret' }

export interface SecretValue<T> {
  reveal(): Secret<T>
}

export interface Logger {
  info(...args: unknown[]): void
  error(...args: unknown[]): void
}
export interface WebhookService {
  send(url: string, body: unknown): void
  verify(body: unknown): void
}
export interface QueueService {
  add(name: string, body: unknown): void
}
export interface EmailService {
  send(body: unknown): void
}
export interface AuditService {
  audit(body: unknown): void
  write(body: unknown): void
}
export interface AuditLog {
  write(body: unknown): void
}

export interface Services {
  logger: Logger
  webhook: WebhookService
  queue: QueueService
  email: EmailService
  audit: AuditService
  auditLog: AuditLog
}

type Handler<O> = (services: Services, data: {}, wire: {}) => O
export declare const pikkuFunc: <O>(
  f:
    | Handler<O>
    | { func: Handler<O>; expose?: boolean; permissionsInBody?: boolean }
) => Handler<O>
export declare const pikkuSessionlessFunc: <O>(
  f:
    | Handler<O>
    | { func: Handler<O>; expose?: boolean; permissionsInBody?: boolean }
) => Handler<O>
