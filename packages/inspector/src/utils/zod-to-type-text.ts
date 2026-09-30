/**
 * Print the TypeScript type text for a Zod schema.
 *
 * `processZodSchema` needs two things from a schema: the JSON Schema, which
 * `z.toJSONSchema` already gives it, and the TypeScript source text that goes
 * into the generated types. Only the second needed a library, and only to build
 * a TypeScript AST that was immediately printed back to a string — so this walks
 * Zod's own definitions and writes the text directly.
 *
 * It prints from the Zod tree rather than from the JSON Schema on purpose. The
 * JSON Schema has already lost what the text needs: `z.date()` is rewritten to
 * `string`/`date-time` before anything can read it, and `z.any()` and
 * `z.unknown()` both flatten to `{}`. The Zod tree still says `Date`, `any` and
 * `unknown`.
 *
 * The walk mirrors {@link findZodTransform} — same `_zod.def` shapes, same
 * seen-set and node budget, for the same reason.
 */

/** Max nodes visited, so a pathological or cyclic schema cannot hang the walk. */
const MAX_NODES = 10_000

const INDENT = '    '

interface ZodNode {
  _zod?: { def?: Record<string, any> }
  description?: string
}

const isNode = (value: unknown): value is ZodNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ZodNode)._zod?.def?.type === 'string'

/**
 * A printed type, and whether it binds loosely enough to need parentheses when
 * it becomes the element of an array or one arm of a larger union.
 */
interface Printed {
  text: string
  loose: boolean
}

const tight = (text: string): Printed => ({ text, loose: false })
const loose = (text: string): Printed => ({ text, loose: true })

const parenthesized = ({ text, loose }: Printed): string =>
  loose ? `(${text})` : text

/** A JS value as a TypeScript literal type. */
const literalOf = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'bigint') return `${value}n`
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  return String(value)
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const propertyKey = (name: string): string =>
  IDENTIFIER.test(name) ? name : JSON.stringify(name)

/** A `.describe()` string as a JSDoc block at the given indentation. */
const jsDoc = (description: string | undefined, indent: string): string => {
  if (!description) return ''
  const lines = description.split('\n')
  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`
  return `${indent}/**\n${lines.map((line) => `${indent} * ${line}`).join('\n')}\n${indent} */\n`
}

const union = (parts: Printed[]): Printed => {
  const texts = [...new Set(parts.map(parenthesized))]
  if (texts.length === 0) return tight('never')
  if (texts.length === 1) return tight(texts[0]!)
  return loose(texts.join(' | '))
}

/**
 * The TypeScript type text for `schema`, as it would be written by hand.
 *
 * A schema that refers to itself cannot be written inline, so a cycle prints as
 * `any` rather than recursing forever.
 */
export function zodToTypeText(schema: unknown): string {
  const seen = new Set<unknown>()
  let budget = MAX_NODES

  const print = (node: unknown, indent: string): Printed => {
    if (budget-- <= 0 || !isNode(node)) return tight('any')
    if (seen.has(node)) return tight('any')
    seen.add(node)
    try {
      return printDef(node, indent)
    } finally {
      seen.delete(node)
    }
  }

  const printDef = (node: ZodNode, indent: string): Printed => {
    const def = node._zod!.def!
    const inner = indent + INDENT

    switch (def.type) {
      case 'string':
      case 'email':
      case 'url':
      case 'uuid':
      case 'guid':
      case 'cuid':
      case 'cuid2':
      case 'ulid':
      case 'emoji':
      case 'nanoid':
      case 'jwt':
      case 'base64':
      case 'base64url':
      case 'ipv4':
      case 'ipv6':
      case 'cidrv4':
      case 'cidrv6':
      case 'iso_date':
      case 'iso_time':
      case 'iso_datetime':
      case 'iso_duration':
        return tight('string')
      case 'number':
      case 'int':
      case 'nan':
        return tight('number')
      case 'bigint':
        return tight('bigint')
      case 'boolean':
        return tight('boolean')
      case 'date':
        return tight('Date')
      case 'null':
        return tight('null')
      case 'undefined':
      case 'void':
        return tight('undefined')
      case 'symbol':
        return tight('symbol')
      case 'file':
        return tight('File')
      case 'never':
        return tight('never')
      case 'any':
        return tight('any')
      case 'unknown':
        return tight('unknown')

      case 'literal':
        return union(
          (def.values ?? []).map((v: unknown) => tight(literalOf(v)))
        )

      case 'enum':
        return union(
          Object.values(def.entries ?? {}).map((v) => tight(literalOf(v)))
        )

      case 'template_literal': {
        const body = (def.parts ?? [])
          .map((part: unknown) =>
            isNode(part) ? `\${${print(part, indent).text}}` : String(part)
          )
          .join('')
        return tight(`\`${body}\``)
      }

      case 'array':
        return tight(`${parenthesized(print(def.element, indent))}[]`)

      case 'set':
        return tight(`Set<${print(def.valueType, indent).text}>`)

      case 'map':
        return tight(
          `Map<${print(def.keyType, indent).text}, ${print(def.valueType, indent).text}>`
        )

      case 'promise':
        return tight(`Promise<${print(def.innerType, indent).text}>`)

      case 'tuple': {
        const items = (def.items ?? []).map(
          (item: unknown) => print(item, inner).text
        )
        if (def.rest) {
          items.push(`...${parenthesized(print(def.rest, inner))}[]`)
        }
        if (items.length === 0) return tight('[]')
        return tight(
          `[\n${items.map((item: string) => `${inner}${item}`).join(',\n')}\n${indent}]`
        )
      }

      case 'union':
        return union(
          (def.options ?? []).map((option: unknown) => print(option, indent))
        )

      case 'intersection':
        return loose(
          `${parenthesized(print(def.left, indent))} & ${parenthesized(print(def.right, indent))}`
        )

      case 'record':
        return tight(
          `{\n${inner}[key: ${print(def.keyType, inner).text}]: ${print(def.valueType, inner).text};\n${indent}}`
        )

      case 'object':
      case 'interface': {
        const shape: Record<string, unknown> = def.shape ?? {}
        const entries = Object.entries(shape)
        if (entries.length === 0 && !def.catchall) return tight('{}')

        const members = entries.map(([name, property]) => {
          const optional = isNode(property) && isOptional(property)
          const printed = print(property, inner)
          const type = optional
            ? `${parenthesized(printed)} | undefined`
            : printed.text
          const doc = jsDoc(
            isNode(property) ? property.description : undefined,
            inner
          )
          return `${doc}${inner}${propertyKey(name)}${optional ? '?' : ''}: ${type};`
        })

        if (def.catchall) {
          members.push(
            `${inner}[key: string]: ${print(def.catchall, inner).text};`
          )
        }
        return tight(`{\n${members.join('\n')}\n${indent}}`)
      }

      case 'nullable':
        return union([print(def.innerType, indent), tight('null')])

      case 'lazy': {
        try {
          return print(def.getter(), indent)
        } catch {
          // A lazy schema that cannot be forced tells us nothing about its type.
          return tight('any')
        }
      }

      default:
        // optional, default, prefault, nonoptional, readonly, catch, success,
        // pipe — every wrapper Zod spells `innerType`, and a pipe's input is the
        // shape a caller writes.
        if (def.innerType) return print(def.innerType, indent)
        if (def.in) return print(def.in, indent)
        return tight('any')
    }
  }

  /**
   * Whether a property may be omitted.
   *
   * `.default()` counts. `processZodSchema` strips every defaulted field out of
   * the JSON Schema's `required`, because a caller who omits one gets the
   * default rather than a validation error — so the text has to say the same
   * thing the validator does.
   */
  const isOptional = (node: ZodNode): boolean => {
    const def = node._zod!.def!
    if (def.type === 'optional') return true
    if (def.type === 'default' || def.type === 'prefault') return true
    if (def.type === 'nonoptional') return false
    if (def.innerType && isNode(def.innerType)) return isOptional(def.innerType)
    return false
  }

  return print(schema, '').text
}
