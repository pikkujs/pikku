import ts from 'typescript'

/**
 * The module specifiers a source file imports from or re-exports from.
 *
 * Parsed rather than grepped: a project's own codegen templates hold the
 * specifiers they emit inside template literals, and those are output text
 * rather than imports the file itself makes.
 */
export const readModuleSpecifiers = (
  fileName: string,
  content: string
): string[] => {
  const source = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true
  )
  const found: string[] = []
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) &&
      !ts.isExportDeclaration(statement)
    ) {
      continue
    }
    const moduleSpecifier = statement.moduleSpecifier
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue
    found.push(moduleSpecifier.text)
  }
  return found
}
