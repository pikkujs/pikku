import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { zodToTypeText } from './zod-to-type-text.js'

/**
 * The expectations below were taken from what `zodToTs` + `ts.createPrinter()`
 * produced for the same schemas, so the replacement is pinned to the text the
 * generated types already carried.
 */
describe('zodToTypeText', () => {
  test('prints primitives', () => {
    assert.equal(
      zodToTypeText(
        z.object({
          s: z.string(),
          n: z.number(),
          b: z.boolean(),
          nul: z.null(),
          any: z.any(),
          unk: z.unknown(),
        })
      ),
      [
        '{',
        '    s: string;',
        '    n: number;',
        '    b: boolean;',
        '    nul: null;',
        '    any: any;',
        '    unk: unknown;',
        '}',
      ].join('\n')
    )
  })

  test('distinguishes optional, nullable and nullish', () => {
    assert.equal(
      zodToTypeText(
        z.object({
          a: z.string().optional(),
          b: z.string().nullable(),
          c: z.string().nullish(),
        })
      ),
      [
        '{',
        '    a?: string | undefined;',
        '    b: string | null;',
        '    c?: (string | null) | undefined;',
        '}',
      ].join('\n')
    )
  })

  /**
   * The one place this deliberately departs from zodToTs, which printed a
   * defaulted field as required. `processZodSchema` strips defaulted fields out
   * of the JSON Schema's `required`, so the type text said a caller must pass
   * something the validator said they could omit.
   */
  test('makes a defaulted field optional, as the JSON Schema does', () => {
    assert.equal(
      zodToTypeText(
        z.object({
          plain: z.string().default('x'),
          wrapped: z.enum(['low', 'high']).optional().default('low'),
        })
      ),
      [
        '{',
        '    plain?: string | undefined;',
        '    wrapped?: ("low" | "high") | undefined;',
        '}',
      ].join('\n')
    )
  })

  test('prints arrays and tuples', () => {
    assert.equal(
      zodToTypeText(
        z.object({
          list: z.array(z.string()),
          nested: z.array(z.array(z.number())),
          pair: z.tuple([z.string(), z.number()]),
        })
      ),
      [
        '{',
        '    list: string[];',
        '    nested: number[][];',
        '    pair: [',
        '        string,',
        '        number',
        '    ];',
        '}',
      ].join('\n')
    )
  })

  test('prints unions, literals and enums', () => {
    assert.equal(
      zodToTypeText(
        z.object({
          kind: z.literal('a'),
          choice: z.union([z.literal('x'), z.literal('y')]),
          mixed: z.union([z.string(), z.number()]),
          enumed: z.enum(['red', 'green']),
        })
      ),
      [
        '{',
        '    kind: "a";',
        '    choice: "x" | "y";',
        '    mixed: string | number;',
        '    enumed: "red" | "green";',
        '}',
      ].join('\n')
    )
  })

  test('prints a record as an index signature', () => {
    assert.equal(
      zodToTypeText(z.object({ map: z.record(z.string(), z.number()) })),
      ['{', '    map: {', '        [key: string]: number;', '    };', '}'].join(
        '\n'
      )
    )
  })

  test('keeps Date, which the JSON Schema does not', () => {
    assert.equal(
      zodToTypeText(z.object({ when: z.date() })),
      ['{', '    when: Date;', '}'].join('\n')
    )
  })

  test('nests objects', () => {
    assert.equal(
      zodToTypeText(
        z.object({ outer: z.object({ inner: z.object({ deep: z.string() }) }) })
      ),
      [
        '{',
        '    outer: {',
        '        inner: {',
        '            deep: string;',
        '        };',
        '    };',
        '}',
      ].join('\n')
    )
  })

  test('prints an intersection', () => {
    assert.equal(
      zodToTypeText(
        z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }))
      ),
      ['{', '    a: string;', '} & {', '    b: number;', '}'].join('\n')
    )
  })

  test('prints a discriminated union', () => {
    assert.equal(
      zodToTypeText(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('a'), a: z.string() }),
          z.object({ kind: z.literal('b'), b: z.number() }),
        ])
      ),
      [
        '{',
        '    kind: "a";',
        '    a: string;',
        '} | {',
        '    kind: "b";',
        '    b: number;',
        '}',
      ].join('\n')
    )
  })

  test('carries .describe() through as JSDoc', () => {
    assert.equal(
      zodToTypeText(
        z.object({ documented: z.string().describe('The documented field.') })
      ),
      [
        '{',
        '    /** The documented field. */',
        '    documented: string;',
        '}',
      ].join('\n')
    )
  })

  test('prints a top-level array and a bare primitive', () => {
    assert.equal(
      zodToTypeText(z.array(z.object({ id: z.string() }))),
      ['{', '    id: string;', '}[]'].join('\n')
    )
    assert.equal(zodToTypeText(z.string()), 'string')
  })

  // Cases zodToTs never had to answer, but a real schema can reach.

  test('parenthesises a union inside an array', () => {
    assert.equal(
      zodToTypeText(z.array(z.union([z.string(), z.number()]))),
      '(string | number)[]'
    )
  })

  test('quotes a key that is not an identifier', () => {
    assert.equal(
      zodToTypeText(z.object({ 'content-type': z.string() })),
      ['{', '    "content-type": string;', '}'].join('\n')
    )
  })

  test('prints a self-referential schema as any rather than recursing', () => {
    const tree: any = z.object({
      value: z.string(),
      get children() {
        return z.array(tree)
      },
    })
    assert.equal(
      zodToTypeText(tree),
      ['{', '    value: string;', '    children: any[];', '}'].join('\n')
    )
  })

  test('resolves a lazy schema', () => {
    assert.equal(
      zodToTypeText(z.lazy(() => z.object({ a: z.string() }))),
      ['{', '    a: string;', '}'].join('\n')
    )
  })

  test('prints the collection types', () => {
    assert.equal(zodToTypeText(z.set(z.string())), 'Set<string>')
    assert.equal(
      zodToTypeText(z.map(z.string(), z.number())),
      'Map<string, number>'
    )
    assert.equal(zodToTypeText(z.promise(z.string())), 'Promise<string>')
  })

  test('prints a tuple with a rest element', () => {
    assert.equal(
      zodToTypeText(z.tuple([z.string()], z.number())),
      ['[', '    string,', '    ...number[]', ']'].join('\n')
    )
  })

  test('prints an empty object', () => {
    assert.equal(zodToTypeText(z.object({})), '{}')
  })
})
