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

          // Extract singleton services for CreateWireServices factories
          if (
            expectedTypeName === 'CreateWireServices' &&
            state &&
            callExpression.arguments.length > 0
          ) {
            const firstArg = callExpression.arguments[0]
            let functionNode:
              | ts.ArrowFunction
              | ts.FunctionExpression
              | undefined

            if (ts.isArrowFunction(firstArg)) {
              functionNode = firstArg
            } else if (ts.isFunctionExpression(firstArg)) {
              functionNode = firstArg
            }

            if (functionNode) {
              const servicesMeta = extractServicesFromFunction(functionNode)
              state.wireServicesMeta.set(variableName, servicesMeta.services)
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
              | ts.ArrowFunction
              | ts.FunctionExpression
              | undefined
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
