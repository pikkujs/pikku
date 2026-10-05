import ts from 'typescript'

const TEXT_ATTRIBUTES = new Set([
  'placeholder',
  'title',
  'alt',
  'aria-label',
  'label',
  'description',
])

const TEXT_PROPERTIES = new Set([
  ...TEXT_ATTRIBUTES,
  'text',
  'body',
  'why',
  'hint',
  'caption',
  'heading',
  'subtitle',
  'message',
  'tooltip',
])

const NON_TEXT_ATTRIBUTES = new Set([
  'className',
  'class',
  'style',
  'd',
  'viewBox',
  'preserveAspectRatio',
  'points',
  'transform',
  'fill',
  'stroke',
  'href',
  'src',
  'rel',
  'target',
  'role',
  'to',
  'id',
  'name',
  'type',
  'value',
  'key',
])

const isProse = (text: string) =>
  /^\p{Lu}[^\s]*(\s+[^\s]+)+/u.test(text.trim()) &&
  !/[:/[\]=_#]/.test(text.split(/\s+/)[0] ?? '')

const isSentence = (text: string) => /\p{L}+\s+\p{L}+/u.test(text)

const hasLetter = (text: string) => /\p{L}/u.test(text)

const isLiteral = (node: ts.Node): node is ts.StringLiteralLike =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)

const rendered = (node: ts.Expression): ts.StringLiteralLike[] => {
  if (isLiteral(node)) return [node]
  if (ts.isParenthesizedExpression(node)) return rendered(node.expression)
  if (ts.isConditionalExpression(node)) {
    return [...rendered(node.whenTrue), ...rendered(node.whenFalse)]
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      return rendered(node.right)
    }
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return [...rendered(node.left), ...rendered(node.right)]
    }
  }
  return []
}

export type JsxLiteralText = { text: string; line: number }

export const readJsxLiteralText = (
  fileName: string,
  content: string
): JsxLiteralText[] => {
  const source = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const found: JsxLiteralText[] = []
  const seen = new Set<number>()
  const add = (node: ts.Node, text: string) => {
    if (!hasLetter(text) || seen.has(node.getStart(source))) return
    seen.add(node.getStart(source))
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
    found.push({ text: text.trim(), line: line + 1 })
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      add(node, node.text)
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      for (const literal of rendered(node.expression))
        add(literal, literal.text)
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(source)
      const value = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer
      if (
        value &&
        (ts.isStringLiteral(value) ||
          ts.isNoSubstitutionTemplateLiteral(value)) &&
        (TEXT_ATTRIBUTES.has(name) ||
          (!NON_TEXT_ATTRIBUTES.has(name) &&
            !name.startsWith('data-') &&
            isSentence(value.text)))
      ) {
        add(value, value.text)
      }
    } else if (
      ts.isPropertyAssignment(node) &&
      TEXT_PROPERTIES.has(node.name.getText(source)) &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      add(node.initializer, node.initializer.text)
    }
    if (
      isLiteral(node) &&
      isProse(node.text) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isExportDeclaration(node.parent) &&
      !ts.isLiteralTypeNode(node.parent) &&
      !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
      !(
        ts.isJsxAttribute(node.parent) &&
        NON_TEXT_ATTRIBUTES.has(node.parent.name.getText(source))
      )
    ) {
      add(node, node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}
