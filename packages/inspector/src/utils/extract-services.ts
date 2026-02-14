import * as ts from 'typescript'
import { FunctionServicesMeta } from '@pikku/core'

/**
 * Extract services from a function's first parameter destructuring pattern
 */
export function extractServicesFromFunction(
  handlerNode: ts.FunctionExpression | ts.ArrowFunction
): FunctionServicesMeta {
  const services: FunctionServicesMeta = {
    optimized: true,
    services: [],
  }

  const firstParam = handlerNode.parameters[0]
  if (firstParam) {
    if (ts.isObjectBindingPattern(firstParam.name)) {
      for (const elem of firstParam.name.elements) {
        const original =
          elem.propertyName && ts.isIdentifier(elem.propertyName)
            ? elem.propertyName.text
            : ts.isIdentifier(elem.name)
              ? elem.name.text
              : undefined
        if (original) {
          services.services.push(original)
        }
      }
    } else if (ts.isIdentifier(firstParam.name)) {
      services.optimized = false
    }
  }

  return services
}

export function extractUsedWires(
  handlerNode: ts.FunctionExpression | ts.ArrowFunction,
  paramIndex: number
): string[] {
  const usedWires: string[] = []
  const param = handlerNode.parameters[paramIndex]
  if (param && ts.isObjectBindingPattern(param.name)) {
    for (const elem of param.name.elements) {
      const propertyName =
        elem.propertyName && ts.isIdentifier(elem.propertyName)
          ? elem.propertyName.text
          : ts.isIdentifier(elem.name)
            ? elem.name.text
            : undefined
      if (propertyName) {
        usedWires.push(propertyName)
      }
    }
  }
  return usedWires
}
