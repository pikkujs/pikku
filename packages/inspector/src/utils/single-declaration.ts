import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

/**
 * Claims the one call site a single-declaration construct is allowed.
 *
 * `defineScope`, `defineSystemRole` and `definePersonas` each take a keyed
 * object, so one call already declares as many entries as you like. Letting the
 * call itself repeat buys nothing and costs the thing that matters: a single
 * place to read the declared set from, and a single place to add to it. The
 * same rule `pikkuBetterAuth` has had all along.
 *
 * A second call in the SAME file is refused too — "the file" is not an answer
 * to "where do I add a persona?" when the file holds two calls, so allowing it
 * would keep the ambiguity the rule exists to remove.
 *
 * A generated file is exempt, and never claims the slot either. The rule exists
 * to name the one place a person adds to, and nobody adds to a file the CLI
 * rewrites on the next run — the scaffolds that ship a scope tree of their own
 * (`user-admin.gen.ts`, and the addon scaffolds beside it) would otherwise make
 * every project that generates one unbuildable, and take the app's own
 * declaration down with them.
 *
 * @param files - The construct's `files` set, which doubles as the claim.
 * @returns true when the caller holds the claim and should carry on.
 */
export const claimSingleDeclaration = (
  logger: InspectorLogger,
  files: Set<string>,
  code: ErrorCode,
  helper: string,
  sourceFile: string
): boolean => {
  if (sourceFile.endsWith('.gen.ts')) {
    return true
  }

  const [first] = files
  if (first === undefined) {
    files.add(sourceFile)
    return true
  }

  logger.critical(
    code,
    first === sourceFile
      ? `Only one ${helper}(...) is allowed per codebase, so there is one place to read the declarations from and one place to add to. Found a second call in ${sourceFile}. Declare them all in one call.`
      : `Only one ${helper}(...) is allowed per codebase, so there is one place to read the declarations from and one place to add to. Found a second in ${sourceFile} (first: ${first}). Declare them all in one call.`
  )
  return false
}
