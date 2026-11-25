import { defineProvider } from '@pikku/core/provider'

/** The stand-in for a project that reaches `noopQueue` instead of `queueClient`. */
export const queueNoop = defineProvider({
  dev: () => ({ noopQueue: { kind: 'noop', target: 'dev' } }),
  deploy: () => ({ noopQueue: { kind: 'noop', target: 'deploy' } }),
})
