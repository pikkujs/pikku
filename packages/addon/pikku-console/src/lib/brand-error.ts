import { BrandError } from '@pikku/code-edit/brand'
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '#pikku/addon/error'

/** Rethrows a BrandError as the HTTP error its kind maps to. */
export function rethrowBrandError(error: unknown): never {
  if (error instanceof BrandError) {
    if (error.kind === 'invalid') throw new BadRequestError(error.message)
    if (error.kind === 'missing') throw new NotFoundError(error.message)
    throw new ServiceUnavailableError(error.message)
  }
  throw error
}
