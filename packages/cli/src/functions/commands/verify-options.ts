import type { RunVerifyOptions } from '@pikku/code-edit/verify'

export type PikkuVerifyInput = {
  skipCodegen?: boolean
  skipTypecheck?: boolean
  skipFrontends?: boolean
  /** Release mode: `i18n-stub` and `string-literal-copy` are errors, not warnings. */
  strict?: boolean
}

/** What `pikku verify`'s flags mean to the library. */
export const verifyOptions = (
  rootDir: string,
  input: PikkuVerifyInput | undefined
): RunVerifyOptions => ({
  rootDir,
  codegen: !input?.skipCodegen,
  typecheck: !input?.skipTypecheck,
  frontends: !input?.skipFrontends,
  strict: !!input?.strict,
  pikkuCli: process.argv[1],
})
