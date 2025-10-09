import * as ts from 'typescript'
import { PathToNameAndType } from './types.js'

export const addFileExtendsCoreType = (
  node: ts.Node,
  checker: ts.TypeChecker,
  methods: PathToNameAndType,
  expectedTypeName: string
) => {
  if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    const fileName = node.getSourceFile().fileName
    const typeName = node.name?.getText()

    // Check if the class or interface extends the expected type
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const type of clause.types) {
            const extendedTypeName = type.expression.getText()
            let extendedTypeDeclarationPath: string | null = null

            // Check if the extended type matches the expected type name
            if (extendedTypeName === expectedTypeName) {
              // Retrieve the symbol of the extended type
              const typeSymbol = checker.getSymbolAtLocation(type.expression)
              const declaration =
                typeSymbol &&
                typeSymbol.declarations &&
                typeSymbol.declarations[0]
              if (declaration) {
                const sourceFile = declaration.getSourceFile()
                extendedTypeDeclarationPath = sourceFile.fileName // Get the path of the file where the extended type was declared
              }

              const variables = methods.get(fileName) || []

              if (!typeName) {
                throw new Error('TODO')
              }
              variables.push({
                variable: typeName,
                type: typeName || null,
                typePath: extendedTypeDeclarationPath,
              })
              methods.set(fileName, variables)
            }
          }
        }
      }
    }
  }
}
