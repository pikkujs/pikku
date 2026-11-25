import { ErrorCode } from '@pikku/inspector'
import type { ProviderErrorKind } from '@pikku/core/provider'

/** A build refusal carrying the PKU code it is reported under. */
export class ProviderBuildError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'ProviderBuildError'
    this.code = code
  }
}

const RESOLVE_CODES: Partial<Record<ProviderErrorKind, ErrorCode>> = {
  'duplicate-provider': ErrorCode.PROVIDER_KEY_DUPLICATED,
  'unsatisfied-need': ErrorCode.PROVIDER_NEED_UNMET,
  cycle: ErrorCode.PROVIDER_CYCLE,
  'optional-key-needed': ErrorCode.PROVIDER_NEEDS_OPTIONAL_KEY,
  'entry-owned': ErrorCode.ENTRY_OWNED_KEY_REPLACED,
  'collection-key-conflict': ErrorCode.COLLECTION_KEY_CONFLICT,
}

/** The build error for a core resolution failure, or the failure itself when it has no code. */
export const toBuildError = (error: unknown): unknown => {
  const kind = (error as { kind?: ProviderErrorKind } | undefined)?.kind
  const code = kind ? RESOLVE_CODES[kind] : undefined
  return code && error instanceof Error
    ? new ProviderBuildError(code, error.message)
    : error
}
