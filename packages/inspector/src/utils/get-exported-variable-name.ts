import * as ts from 'typescript'

const isExportedVariableStatement = (
  statement: ts.Statement
): statement is ts.VariableStatement =>
  ts.isVariableStatement(statement) &&
  (statement.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
  ) ??
    false)

export const getExportedVariableName = (
  node: ts.Node,
  sourceFile: ts.SourceFile | undefined
): string | null => {
  if (!sourceFile) {
    return null
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    for (const statement of sourceFile.statements) {
      if (!isExportedVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (declaration === node) {
          return node.name.text
        }
      }
    }
  }

  if (!ts.isCallExpression(node)) {
    return null
  }

  for (const statement of sourceFile.statements) {
    if (!isExportedVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer === node
      ) {
        return declaration.name.text
      }
    }
  }

  return null
}
