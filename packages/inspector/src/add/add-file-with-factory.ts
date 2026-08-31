import * as ts from 'typescript'
import type { PathToNameAndType, InspectorState } from '../types.js'
import { extractServicesFromFunction } from '../utils/extract-services.js'

// Mapping of wrapper function names to their corresponding types
const wrapperFunctionMap: Record<string, string> = {
  pikkuConfig: 'CreateConfig',
  pikkuAddonConfig: 'CreateConfig',
  pikkuServices: 'CreateSingletonServices',
  pikkuAddonServices: 'CreateSingletonServices',
  pikkuWireServices: 'CreateWireServices',
  pikkuAddonWireServices: 'CreateWireServices',
  pikkuServerLifecycle: 'ServerLifecycle',
}

/**
 * What an addon's `pikkuAddonServices` factory takes from the parent: the names
 * destructured off its second parameter, either in the parameter list or from a
 * `const { … } = existingServices` in the body.
 */
const extractForwardedServices = (
  functionNode: ts.ArrowFunction | ts.FunctionExpression
): string[] => {
  const forwarded: string[] = []
  const secondParam = functionNode.parameters[1]
  if (!secondParam) return forwarded

  const collectBinding = (pattern: ts.ObjectBindingPattern) => {
    for (const elem of pattern.elements) {
      const name =
        elem.propertyName && ts.isIdentifier(elem.propertyName)
          ? elem.propertyName.text
          : ts.isIdentifier(elem.name)
            ? elem.name.text
            : undefined
      if (name) forwarded.push(name)
    }
  }

  if (ts.isObjectBindingPattern(secondParam.name)) {
    collectBinding(secondParam.name)
    return forwarded
  }

  if (!ts.isIdentifier(secondParam.name)) return forwarded
  const paramName = secondParam.name.text
  const body = functionNode.body
  if (!ts.isBlock(body)) return forwarded

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === paramName
    ) {
      collectBinding(node.name)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(body, visit)

  return forwarded
}

/**
 * The service names the factory's returned object literals name. A spread is
 * skipped — it carries the parent's bag through rather than naming anything —
 * and a name the factory took off the parent is a forward, not a creation.
 */
const extractReturnedServices = (
  functionNode: ts.ArrowFunction | ts.FunctionExpression
): string[] => {
  const returned: string[] = []

  const collect = (expression: ts.Expression) => {
    if (!ts.isObjectLiteralExpression(expression)) return
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property)) continue
      const name = property.name
      if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
        returned.push(name.text)
      }
    }
  }

  const body = functionNode.body
  if (!ts.isBlock(body)) {
    collect(ts.isParenthesizedExpression(body) ? body.expression : body)
    return returned
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      return
    }
    if (ts.isReturnStatement(node) && node.expression) {
      collect(node.expression)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(body, visit)

  return returned
}

export const addFileWithFactory = (
  node: ts.Node,
  checker: ts.TypeChecker,
  methods: PathToNameAndType = new Map(),
  expectedTypeName: string,
  state?: InspectorState
) => {
  if (ts.isVariableDeclaration(node)) {
    const fileName = node.getSourceFile().fileName
    const variableTypeNode = node.type
    const variableName = node.name.getText()

    // Check for wrapper function calls FIRST (e.g., pikkuConfig(...), pikkuServices(...))
    // This handles both cases: with and without explicit type annotations
    if (node.initializer && ts.isCallExpression(node.initializer)) {
      const callExpression = node.initializer
      const expression = callExpression.expression

      if (ts.isIdentifier(expression)) {
        const wrapperFunctionName = expression.text
        const inferredType = wrapperFunctionMap[wrapperFunctionName]

        if (inferredType === expectedTypeName) {
          // Get the type declaration path from the wrapper function
          const typeSymbol = checker.getSymbolAtLocation(expression)
          let typeDeclarationPath: string | null = null

          if (
            typeSymbol &&
            typeSymbol.declarations &&
            typeSymbol.declarations[0]
          ) {
            const declaration = typeSymbol.declarations[0]
            const sourceFile = declaration.getSourceFile()
            typeDeclarationPath = sourceFile.fileName
          }

          const variables = methods.get(fileName) || []
          variables.push({
            variable: variableName,
            type: inferredType,
            typePath: typeDeclarationPath,
          })
          methods.set(fileName, variables)

          if (state && callExpression.arguments.length > 0) {
            const firstArg = callExpression.arguments[0]
            let functionNode:
              ts.ArrowFunction | ts.FunctionExpression | undefined

            if (ts.isArrowFunction(firstArg)) {
              functionNode = firstArg
            } else if (ts.isFunctionExpression(firstArg)) {
              functionNode = firstArg
            }

            // Extract singleton services for CreateWireServices factories
            if (expectedTypeName === 'CreateWireServices' && functionNode) {
              const servicesMeta = extractServicesFromFunction(functionNode)
              state.wireServicesMeta.set(variableName, servicesMeta.services)
            }

            // Extract existing services an addon needs from the parent
            // (second parameter of pikkuAddonServices callback)
            if (wrapperFunctionName === 'pikkuAddonServices' && functionNode) {
              state.addonServicesFactorySeen = true
              const forwarded = new Set(extractForwardedServices(functionNode))
              for (const name of forwarded) {
                state.addonRequiredParentServices.push(name)
              }
              for (const name of extractReturnedServices(functionNode)) {
                if (!forwarded.has(name)) {
                  state.addonCreatedServices.push(name)
                }
              }
            }
          }

          return // Early return since we found a match
        }
      }
    }

    if (variableTypeNode && ts.isTypeReferenceNode(variableTypeNode)) {
      const typeNameNode = variableTypeNode.typeName || null

      let typeDeclarationPath: string | null = null

      // Check if the type name matches the expected type name
      if (
        ts.isIdentifier(typeNameNode) &&
        typeNameNode.text === expectedTypeName
      ) {
        const typeSymbol = checker.getSymbolAtLocation(typeNameNode)
        const declaration =
          typeSymbol && typeSymbol.declarations && typeSymbol.declarations[0]
        if (declaration) {
          const sourceFile = declaration.getSourceFile()
          typeDeclarationPath = sourceFile.fileName // Get the path of the file where the type was declared
        }

        const variables = methods.get(fileName) || []
        variables.push({
          variable: variableName,
          type: typeNameNode.getText(),
          typePath: typeDeclarationPath,
        })
        methods.set(fileName, variables)

        // Extract singleton services for CreateWireServices factories
        if (
          expectedTypeName === 'CreateWireServices' &&
          state &&
          node.initializer
        ) {
          let functionNode: ts.ArrowFunction | ts.FunctionExpression | undefined
          if (ts.isArrowFunction(node.initializer)) {
            functionNode = node.initializer
          } else if (ts.isFunctionExpression(node.initializer)) {
            functionNode = node.initializer
          }

          if (functionNode) {
            const servicesMeta = extractServicesFromFunction(functionNode)
            state.wireServicesMeta.set(variableName, servicesMeta.services)
          }
        }
      }

      // Handle qualified type names if necessary
      else if (ts.isQualifiedName(typeNameNode)) {
        const lastName = typeNameNode.right.text
        if (lastName === expectedTypeName) {
          const typeSymbol = checker.getSymbolAtLocation(typeNameNode.right)
          const declaration =
            typeSymbol && typeSymbol.declarations && typeSymbol.declarations[0]
          if (declaration) {
            const sourceFile = declaration.getSourceFile()
            typeDeclarationPath = sourceFile.fileName // Get the path of the file where the type was declared
          }

          const variables = methods.get(fileName) || []
          variables.push({
            variable: variableName,
            type: typeNameNode.getText(),
            typePath: typeDeclarationPath,
          })
          methods.set(fileName, variables)

          // Extract singleton services for CreateWireServices factories
          if (
            expectedTypeName === 'CreateWireServices' &&
            state &&
            node.initializer
          ) {
            let functionNode:
              ts.ArrowFunction | ts.FunctionExpression | undefined
            if (ts.isArrowFunction(node.initializer)) {
              functionNode = node.initializer
            } else if (ts.isFunctionExpression(node.initializer)) {
              functionNode = node.initializer
            }

            if (functionNode) {
              const servicesMeta = extractServicesFromFunction(functionNode)
              state.wireServicesMeta.set(variableName, servicesMeta.services)
            }
          }
        }
      }
    }
  }
}
