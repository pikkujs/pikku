/**
 * The id of a function wired inline rather than declared on its own: the
 * wiring type followed by whatever identifies the wiring (`queue:emails`,
 * `http:get:/todos`). Kept apart from `extract-function-name.ts`, which needs
 * the TypeScript compiler, so pure state helpers can use it without loading it.
 */
export function makeContextBasedId(
  wiringType: string,
  ...segments: string[]
): string {
  return [wiringType, ...segments].join(':')
}
