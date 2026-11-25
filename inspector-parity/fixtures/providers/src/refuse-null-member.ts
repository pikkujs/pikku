import { defineProvider } from '@pikku/core/provider'

declare const cond: boolean
// PKU372: a null member of the union.
export const nullable = defineProvider(() => (cond ? { a: 1 } : null))
