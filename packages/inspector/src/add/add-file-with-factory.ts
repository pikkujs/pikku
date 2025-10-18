import * as ts from 'typescript'
import { PathToNameAndType, InspectorState } from '../types.js'
import { extractServicesFromFunction } from '../utils/extract-services.js'

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

        // Extract singleton services for CreateSessionServices factories
        if (
          expectedTypeName === 'CreateSessionServices' &&
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
            state.sessionServicesMeta.set(variableName, servicesMeta.services)
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

          // Extract singleton services for CreateSessionServices factories
          if (
            expectedTypeName === 'CreateSessionServices' &&
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
              state.sessionServicesMeta.set(variableName, servicesMeta.services)
            }
          }
        }
      }
    }
  }
}
