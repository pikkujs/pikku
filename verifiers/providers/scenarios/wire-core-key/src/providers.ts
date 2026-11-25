import { defineWireProvider } from '@pikku/core/provider'

// core builds auditLog for every invocation.
export const audit = defineWireProvider(() => ({
  auditLog: { write: () => {} },
}))
