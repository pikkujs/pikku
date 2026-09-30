// Component tests run under bun, which provides `mock.module`; bun-types is not
// a console dependency, so only the surface the tests use is declared here.
declare module 'bun:test' {
  export { describe, test } from 'node:test'
  export const mock: {
    module(path: string, factory: () => Record<string, unknown>): void
  }
}
