// A user-defined (non-core) service type. A carved addon using `email` must
// declare this on its own SingletonServices to type-check.
export interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>
}
