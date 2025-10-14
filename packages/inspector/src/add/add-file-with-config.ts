import * as ts from 'typescript'
import { doesTypeExtendsCore } from '../utils/does-type-extend-core-type.js'
import { PathToNameAndType } from '../types.js'

export const addFileWithConfig = (
  node: ts.Node,
  checker: ts.TypeChecker,
  configs: PathToNameAndType
) => {
  if (ts.isVariableDeclaration(node)) {
    const fileName = node.getSourceFile().fileName
    const variableSymbol = checker.getSymbolAtLocation(node.name)

    if (variableSymbol) {
      const variableType = checker.getTypeOfSymbolAtLocation(
        variableSymbol,
        node.name
      )
      const variableName = node.name.getText()
      const variableTypeText = node.type?.getText()

      // Check if the type extends CoreConfig
      if (doesTypeExtendsCore(variableType, checker, new Set(), 'CoreConfig')) {
        // Retrieve the symbol of the type (if it has one)
        const typeSymbol = variableType.symbol
        let typeDeclarationPath: string | null = null
        const declaration =
          typeSymbol && typeSymbol.declarations && typeSymbol.declarations[0]

        if (declaration) {
          const sourceFile = declaration.getSourceFile()
          typeDeclarationPath = sourceFile.fileName // Get the path of the file where the type was declared
        }

        const variables = configs[fileName] || []
        variables.push({
          variable: variableName,
          type: variableTypeText || null,
          typePath: typeDeclarationPath,
        })
        configs[fileName] = variables
      }
    }
  }
}
