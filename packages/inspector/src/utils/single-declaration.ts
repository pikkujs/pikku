import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

/**
 * Claims the one call site a single-declaration construct is allowed.
 *
 * `definePersonas` takes a keyed object, so one call already declares as many
 * entries as you like. Letting the call itself repeat buys nothing and costs
 * the thing that matters: a single place to read the declared set from, and a
 * single place to add to it. The same rule `pikkuBetterAuth` has had all along.
 *
 * A second call in the SAME file is refused too — "the file" is not an answer
 * to "where do I add a persona?" when the file holds two calls, so allowing it
 * would keep the ambiguity the rule exists to remove.
 *
 * A generated file is exempt, and never claims the slot either. The rule exists
 * to name the one place a person adds to, and nobody adds to a file the CLI
 * rewrites on the next run — `pikku-personas.gen.ts` would otherwise make every
 * project that scaffolds one unbuildable, and take the app's own declaration
 * down with it.
 *
 * `defineScope` and `defineSystemRole` held this rule too, briefly, and do not
 * until the `admin` tree stops being app-declared. The exemption above is not
 * enough for them: the CLI generates a `defineScope` in `user-admin.gen.ts` and
 * `@pikku/addon-console` spells the same tree out again in a hand-written file,
 * so two non-generated declarations remain and the build still fails. The fix
 * is for `admin` to be a default scope nobody declares, and the rule comes back
 * for scopes and roles once that lands.
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
