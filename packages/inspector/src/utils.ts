import * as ts from 'typescript'
import { InspectorFilters } from './types.js'

type ExtractedFunctionName = {
  exportName: string | null
  funcName: string | null
  isAnon: boolean
  isProperty: boolean
  named: boolean
}

// helper: walks up to find `export` on a VariableStatement
const isNamedExport = (node: ts.Node): boolean =>{
  let cur: ts.Node | undefined = node
  while (cur) {
    if (ts.isVariableStatement(cur)) {
      return !!cur.modifiers?.some(
        m => m.kind === ts.SyntaxKind.ExportKeyword
      )
    }
    cur = cur.parent
  }
  return false
}

/**
 * Given a CallExpression like `const foo = pikkuFunc(...)` or
 * `pikkuFunc({ name: 'bar', func: () => {} })`, returns the identifier
 * (`foo` or `'bar'`), or `null` if none can be determined.
 */
export function extractFunctionName(callExpr: ts.CallExpression): ExtractedFunctionName {
  const parent = callExpr.parent
  let result: ExtractedFunctionName = {
    exportName: null,
    funcName: null,
    isAnon: false,
    isProperty: false,
    named: false
  }

  // 1) const foo = pikkuFunc(...)
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    if (isNamedExport(parent)) {
      result.exportName = parent.name.text
    }
    result.funcName = parent.name.text
  }

  // 2) { foo: pikkuFunc(...) }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    result.funcName = parent.name.text
    result.isProperty = true
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
        result.funcName = prop.initializer.text
        result.named = true
      }
    }
  }

  return result
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
