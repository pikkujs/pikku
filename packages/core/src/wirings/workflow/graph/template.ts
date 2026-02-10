export type TemplateString = {
  $template: {
    parts: string[]
    expressions: Array<{ $ref: string; path?: string }>
  }
} & { __brand: 'TemplateString' }

export function template(
  templateStr: string,
  refs: Array<{ $ref: string; path?: string }>
): TemplateString {
  const parts: string[] = []
  const expressions: Array<{ $ref: string; path?: string }> = []

  const regex = /\$(\d+)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(templateStr)) !== null) {
    parts.push(templateStr.slice(lastIndex, match.index))

    const refIndex = parseInt(match[1]!, 10)
    const refValue = refs[refIndex]
    if (refValue) {
      const expr: { $ref: string; path?: string } = { $ref: refValue.$ref }
      if (refValue.path) {
        expr.path = refValue.path
      }
      expressions.push(expr)
    } else {
      expressions.push({ $ref: 'unknown' })
    }

    lastIndex = regex.lastIndex
  }

  parts.push(templateStr.slice(lastIndex))

  return {
    $template: { parts, expressions },
  } as TemplateString
}
