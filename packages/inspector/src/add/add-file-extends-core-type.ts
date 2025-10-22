import * as ts from 'typescript'
import { PathToNameAndType, InspectorState } from '../types.js'

export const addFileExtendsCoreType = (
  node: ts.Node,
  checker: ts.TypeChecker,
  methods: PathToNameAndType,
  expectedTypeName: string,
  state?: InspectorState
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
                throw new Error(
                  `Found anonymous ${ts.isClassDeclaration(node) ? 'class' : 'interface'} extending ${expectedTypeName} in ${fileName}. ` +
                    `Classes and interfaces that extend core types must have a name.`
                )
              }
              variables.push({
                variable: typeName,
                type: typeName,
                typePath: extendedTypeDeclarationPath,
              })
              methods.set(fileName, variables)

              // Store the type in typesLookup if state is provided
              if (state && node.name) {
                const symbol = checker.getSymbolAtLocation(node.name)
                if (symbol) {
                  const declaredType = checker.getDeclaredTypeOfSymbol(symbol)
                  // Use the type name as the key in typesLookup
                  state.typesLookup.set(typeName, [declaredType])
                }
              }
            }
          }
        }
      }
    }
  }
}
