export const isSecretNotFound = (e: unknown): boolean =>
  typeof (e as { message?: unknown } | null)?.message === 'string' &&
  (e as { message: string }).message.startsWith('Requested secret not found')
