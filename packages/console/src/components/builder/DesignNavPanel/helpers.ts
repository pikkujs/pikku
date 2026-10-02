import type { DesignLens } from './types.js'
import { DESIGN_LENSES } from './constants.js'

/** Narrows a `?lens=` value off the URL, which anyone can type anything into. */
export function isDesignLens(value: unknown): value is DesignLens {
  return typeof value === 'string' && DESIGN_LENSES.some((lens) => lens.id === value)
}
