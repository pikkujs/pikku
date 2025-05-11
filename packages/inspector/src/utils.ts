import * as ts from 'typescript'
import { InspectorFilters } from './types.js'

/**
 * Generates a stable “anonymous” name for a CallExpression based on:
 *   – the file name (sanitized)
 *   – the line and character where the call appears
 */
export function makeDeterministicAnonName(callExpr: ts.CallExpression): string {
  const sf = callExpr.getSourceFile()
  const file = sf.fileName.replace(/[^a-zA-Z0-9_]/g, '_')
  const { line, character } = ts.getLineAndCharacterOfPosition(
    sf,
    callExpr.getStart()
  )
  return `pikkuFn_${file}_L${line + 1}C${character + 1}`
}

/**
 * Given a CallExpression like `const foo = pikkuFunc(...)` or
 * `pikkuFunc({ name: 'bar', func: () => {} })`, returns the identifier
 * (`foo` or `'bar'`), or `null` if none can be determined.
 */
export function extractFunctionName(callExpr: ts.CallExpression): string {
  const parent = callExpr.parent

  // 1) const foo = pikkuFunc(...)
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text
  }

  // 2) { foo: pikkuFunc(...) }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text
  }

  // 3) pikkuFunc({ name: '…', func: … })
  const firstArg = callExpr.arguments[0]
  if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
    for (const prop of firstArg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'name' &&
        ts.isStringLiteral(prop.initializer)
      ) {
        return prop.initializer.text
      }
    }
  }

  // 3) no explicit or LHS name → deterministic anon
  return makeDeterministicAnonName(callExpr)
}

export const extractTypeKeys = (type: ts.Type): string[] => {
  return type.getProperties().map((symbol) => symbol.getName())
}

export const getPropertyAssignment = (
  obj: ts.ObjectLiteralExpression,
  name: string,
  required: boolean = true
) => {
  const property = obj.properties.find(
    (p) =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      ts.isIdentifier(p.name) &&
      p.name.text === name
  )
  if (!property) {
    if (required) {
      console.error(`Missing property '${name}' in object`)
    }
    return null
  }
  return property
}

// export const getTypeArgumentsOfType = (
//   checker: ts.TypeChecker,
//   type: ts.Type
// ): readonly ts.Type[] | null => {
//   if (type.isUnionOrIntersection()) {
//     const types: ts.Type[] = []
//     for (const subType of type.types) {
//       const subTypeArgs = getTypeArgumentsOfType(checker, subType)
//       if (subTypeArgs) {
//         types.push(...subTypeArgs)
//       }
//     }
//     return types.length > 0 ? types : null
//   }

//   // If the type is a TypeReference with typeArguments, return them
//   if (
//     type.flags & ts.TypeFlags.Object &&
//     (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
//   ) {
//     const typeRef = type as ts.TypeReference
//     if (typeRef.typeArguments && typeRef.typeArguments.length > 0) {
//       return typeRef.typeArguments
//     }
//   }

//   // If the type is an alias with aliasTypeArguments, return them
//   if (type.aliasTypeArguments && type.aliasTypeArguments.length > 0) {
//     return type.aliasTypeArguments as ts.Type[]
//   }

//   return null
// }

export const matchesFilters = (
  filters: InspectorFilters,
  params: { tags?: string[] },
  meta: { type: 'schedule' | 'http' | 'channel'; name: string }
) => {
  if (Object.keys(filters).length === 0 || filters.tags?.length === 0) {
    return true
  }

  if (filters.tags?.some((tag) => params.tags?.includes(tag))) {
    return true
  }

  console.debug(`⒡ Filtered: ${meta.type}:${meta.name}`)
  return false
}
