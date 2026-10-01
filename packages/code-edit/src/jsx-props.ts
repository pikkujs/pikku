import * as ts from 'typescript'

export type JsxPropValue = string | number | boolean

function findOpeningElement(
  file: ts.SourceFile,
  line: number,
  col: number
): ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined {
  let found: ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const at = file.getLineAndCharacterOfPosition(node.getStart(file))
      if (at.line + 1 === line && at.character === col) {
        found = node
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function literalValue(attr: ts.JsxAttribute): JsxPropValue | undefined {
  const init = attr.initializer
  if (!init) return true
  if (ts.isStringLiteral(init)) return init.text
  if (!ts.isJsxExpression(init) || !init.expression) return undefined
  const expr = init.expression
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  if (ts.isNumericLiteral(expr)) return Number(expr.text)
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false
  return undefined
}

function attrText(name: string, value: JsxPropValue): string {
  if (typeof value === 'boolean') return value ? name : `${name}={false}`
  if (typeof value === 'number') return `${name}={${value}}`
  return `${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Literal props of the JSX element starting at 1-based `line`, 0-based `col`; null when none starts there. */
export function readJsxProps(
  source: string,
  line: number,
  col: number
): Record<string, JsxPropValue> | null {
  const element = findOpeningElement(parse(source), line, col)
  if (!element) return null
  const props: Record<string, JsxPropValue> = {}
  for (const attr of element.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue
    const value = literalValue(attr)
    if (value !== undefined) props[attr.name.text] = value
  }
  return props
}

/** Sets, replaces or (with null) removes one literal prop; returns the source unchanged when no element starts there. */
export function writeJsxProp(
  source: string,
  line: number,
  col: number,
  name: string,
  value: JsxPropValue | null
): string {
  const file = parse(source)
  const element = findOpeningElement(file, line, col)
  if (!element) return source
  const existing = element.attributes.properties.find(
    (a): a is ts.JsxAttribute =>
      ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === name
  )
  if (value === null) {
    if (!existing) return source
    let start = existing.getStart(file)
    while (start > 0 && /[ \t]/.test(source[start - 1]!)) start--
    return source.slice(0, start) + source.slice(existing.end)
  }
  if (existing) {
    return source.slice(0, existing.getStart(file)) + attrText(name, value) + source.slice(existing.end)
  }
  const at = element.attributes.properties.length
    ? element.attributes.properties.end
    : element.typeArguments?.end ?? element.tagName.end
  return source.slice(0, at) + ` ${attrText(name, value)}` + source.slice(at)
}
