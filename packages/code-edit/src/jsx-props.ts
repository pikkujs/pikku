import {
  InspectorHelperError,
  readJsxProps as readProps,
  writeJsxProp as writeProp,
  writeJsxStyle as writeStyle,
} from '@pikku/inspector-go'

export type JsxPropValue = string | number | boolean

/** Literal props of the JSX element starting at 1-based `line`, 0-based `col`; null when none starts there. */
export function readJsxProps(
  source: string,
  line: number,
  col: number
): Record<string, JsxPropValue> | null {
  const props = readProps(source, line, col)
  if (!props) return null
  const byName: Record<string, JsxPropValue> = {}
  for (const { name, value } of props) byName[name] = value
  return byName
}

export class JsxStyleError extends Error {}

export function writeJsxStyle(
  source: string,
  line: number,
  col: number,
  styles: Record<string, string | null>
): string {
  try {
    return writeStyle(source, line, col, Object.entries(styles))
  } catch (error) {
    if (error instanceof InspectorHelperError && error.name === 'JsxStyleError')
      throw new JsxStyleError(error.message)
    throw error
  }
}

/** Sets, replaces or (with null) removes one literal prop; returns the source unchanged when no element starts there. */
export function writeJsxProp(
  source: string,
  line: number,
  col: number,
  name: string,
  value: JsxPropValue | null
): string {
  return writeProp(source, line, col, name, value)
}
