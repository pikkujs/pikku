import * as ts from 'typescript'
import type { SchemaVendor, InspectorLogger } from '../types.js'
import { ErrorCode } from '../error-codes.js'

/**
 * Whether the checker could type the identifier at all.
 *
 * `any` here is not a schema written in an exotic library — it is TypeScript telling us
 * it could not resolve the declaration, which happens when the schema comes from a file
 * outside the program (not matched by tsconfig `include`) or from a generated file that
 * has not been written yet (`.pikku/db/zod.gen.ts` before `pikku db generate` runs).
 * The distinction matters because the two have opposite fixes, and conflating them told
 * users to "import from a supported validation library" about a plain `z.object`.
 */
const isUnresolved = (type: ts.Type): boolean =>
  (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0

/**
 * Detect the schema vendor by tracing the type back to its library origin.
 * This handles locally-defined schemas like `export const MySchema = z.object({...})`
 * by checking where the type itself originates from.
 *
 * Supports multiple schema libraries in the same project (e.g., during migration
 * from one library to another).
 */
export const detectSchemaVendor = (
  identifier: ts.Identifier,
  checker: ts.TypeChecker
): SchemaVendor => {
  const type = checker.getTypeAtLocation(identifier)
  if (!type) return 'unknown'

  // Check the type's symbol declarations to find the library origin
  const checkTypeOrigin = (t: ts.Type): SchemaVendor | null => {
    const symbol = t.getSymbol() || t.aliasSymbol
    if (symbol) {
      const decls = symbol.getDeclarations()
      if (decls) {
        for (const decl of decls) {
          const fileName = decl.getSourceFile().fileName
          if (fileName.includes('node_modules/zod')) return 'zod'
          if (fileName.includes('node_modules/valibot')) return 'valibot'
          if (fileName.includes('node_modules/arktype')) return 'arktype'
          if (fileName.includes('node_modules/@effect/schema')) return 'effect'
        }
      }
    }

    // Check base types for class/interface hierarchies
    const baseTypes = t.getBaseTypes?.()
    if (baseTypes) {
      for (const baseType of baseTypes) {
        const result = checkTypeOrigin(baseType)
        if (result) return result
      }
    }

    return null
  }

  const vendor = checkTypeOrigin(type)
  if (vendor) return vendor

  // Fallback: check type arguments (for generic types like z.ZodObject<...>)
  if ((type as ts.TypeReference).typeArguments) {
    for (const arg of (type as ts.TypeReference).typeArguments || []) {
      const result = checkTypeOrigin(arg)
      if (result) return result
    }
  }

  return 'unknown'
}

/**
 * Detect schema vendor and log a fatal error if unknown.
 * Returns the vendor if successful, or undefined if unknown (after logging error).
 *
 * @param identifier - The TypeScript identifier for the schema variable
 * @param checker - TypeScript type checker
 * @param logger - Inspector logger for error reporting
 * @param context - Description of what the schema is for (e.g., "Credential 'myCredential'")
 * @param sourceFile - Source file path for error message
 */
export const detectSchemaVendorOrError = (
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
  logger: InspectorLogger,
  context: string,
  sourceFile: string
): Exclude<SchemaVendor, 'unknown'> | undefined => {
  const vendor = detectSchemaVendor(identifier, checker)
  if (vendor === 'unknown') {
    // Two different failures used to share one message. Reporting the wrong one is not a
    // cosmetic problem: the schema is dropped either way (`inputSchemaName: null`, no
    // generated schema file), so the message is the only thing standing between the user
    // and a function that silently validates nothing — and "use a supported validation
    // library" is unactionable when the schema already IS `z.object({...})`.
    if (isUnresolved(checker.getTypeAtLocation(identifier))) {
      logger.critical(
        ErrorCode.INLINE_SCHEMA,
        `${context} schema '${identifier.text}' could not be TYPED from '${sourceFile}' — ` +
          `TypeScript resolved it to 'any', so its vendor cannot be traced. This is a ` +
          `resolution problem, not a schema problem: the file it is imported from is either ` +
          `outside your tsconfig 'include', or has not been generated yet (a schema built ` +
          `from '.pikku/db/zod.gen.ts' needs 'pikku db generate' to have run first). ` +
          `Fix the import so the type resolves, then re-run.`
      )
      return undefined
    }
    logger.critical(
      ErrorCode.INLINE_SCHEMA,
      `${context} schema vendor could not be determined from '${sourceFile}'. ` +
        `Supported vendors: zod, valibot, arktype, @effect/schema. ` +
        `Ensure your schema is imported from a supported validation library.`
    )
    return undefined
  }
  return vendor
}
