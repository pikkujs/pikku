// Compiled by tsc only (tsconfig.type-tests.json); never executed.
import type { SingletonServices } from '#pikku/provider'

type IsAny<T> = 0 extends 1 & T ? true : false
const assertType = <_T extends true>() => {}

assertType<IsAny<SingletonServices['logger']> extends false ? true : false>()
export const guard = (s: SingletonServices) => {
  if (s.auditLog) s.auditLog.write('x')
  // @ts-expect-error auditLog? is optional
  s.auditLog.write('y')
}
