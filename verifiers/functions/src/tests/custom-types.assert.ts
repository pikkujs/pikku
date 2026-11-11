import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.pikku'
)
const CUSTOM_TYPES = 'pikku-custom-types.gen.d.ts'
const NAMESPACE = '__PikkuCustomTypes'

const generatedTypeScript = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return generatedTypeScript(path)
    return /\.tsx?$/.test(entry) ? [path] : []
  })

/**
 * `pikku all` writes the full tree into `.pikku` and then one child tree per
 * backend into `.pikku/backends/<backend>`. Each of those is a complete
 * generation with its own single custom types file, so the invariants hold per
 * tree rather than across the whole directory.
 */
const trees = (): string[] => {
  const backends = join(outDir, 'backends')
  const children = existsSync(backends)
    ? readdirSync(backends)
        .map((entry) => join(backends, entry))
        .filter((path) => statSync(path).isDirectory())
    : []
  return [outDir, ...children]
}

/** The files of one tree, leaving out the child trees nested under it. */
const treeFiles = (tree: string): string[] =>
  generatedTypeScript(tree).filter(
    (file) => !relative(tree, file).startsWith(`backends${sep}`)
  )

const segments = (tree: string, file: string): string[] =>
  relative(tree, file).split(sep)

/** `sdk/<backend>/...` holds the published SDK slices of a tree. */
const isSdkSlice = (tree: string, file: string): boolean =>
  segments(tree, file)[0] === 'sdk'

const label = (file: string): string => relative(outDir, file)

/**
 * Index of the `}` closing the block whose `{` sits at `open`, skipping braces
 * inside strings and comments.
 */
const matchingBrace = (content: string, open: number): number => {
  let depth = 0
  for (let i = open; i < content.length; i++) {
    const char = content[i]
    if (char === '/' && content[i + 1] === '/') {
      i = content.indexOf('\n', i)
      if (i === -1) break
    } else if (char === '/' && content[i + 1] === '*') {
      i = content.indexOf('*/', i + 2)
      if (i === -1) break
      i++
    } else if (char === '"' || char === "'" || char === '`') {
      for (i++; i < content.length && content[i] !== char; i++) {
        if (content[i] === '\\') i++
      }
    } else if (char === '{') {
      depth++
    } else if (char === '}' && --depth === 0) {
      return i
    }
  }
  throw new Error('unbalanced braces in a custom types namespace')
}

/** The `declare namespace __PikkuCustomTypes { ... }` bodies of a file. */
const namespaceBodies = (content: string): string[] => {
  const bodies: string[] = []
  const opener = new RegExp(`^declare namespace ${NAMESPACE} \\{`, 'gm')
  for (const match of content.matchAll(opener)) {
    const open = match.index + match[0].length - 1
    bodies.push(content.slice(open + 1, matchingBrace(content, open)))
  }
  return bodies
}

/** The file with its `__PikkuCustomTypes` namespace blocks cut out. */
const withoutNamespaces = (content: string): string => {
  let result = content
  const opener = new RegExp(`^declare namespace ${NAMESPACE} \\{`, 'm')
  for (let match = opener.exec(result); match; match = opener.exec(result)) {
    const open = match.index + match[0].length - 1
    result =
      result.slice(0, match.index) +
      result.slice(matchingBrace(result, open) + 1)
  }
  return result
}

/**
 * Every `export type Name = body` declaration, keyed by name. A body runs to the
 * next declaration, so multi-line bodies are compared whole.
 */
const declarations = (content: string): Map<string, string> => {
  const starts = Array.from(content.matchAll(/^export type (\w+) = /gm))
  const result = new Map<string, string>()
  starts.forEach((match, index) => {
    const bodyStart = match.index + match[0].length
    const bodyEnd = starts[index + 1]?.index ?? content.length
    result.set(match[1] ?? '', content.slice(bodyStart, bodyEnd).trimEnd())
  })
  return result
}

const declaredTypeNames = (content: string): string[] =>
  Array.from(declarations(content).keys())

const readCustomTypes = (tree: string): Map<string, string> =>
  declarations(readFileSync(join(tree, CUSTOM_TYPES), 'utf-8'))

/** Everything a tree publishes as an SDK slice that carries custom types. */
const slices = (
  tree: string
): { file: string; declared: Map<string, string> }[] =>
  treeFiles(tree)
    .filter((file) => isSdkSlice(tree, file))
    .flatMap((file) => {
      const content = readFileSync(file, 'utf-8')
      if (basename(file) === CUSTOM_TYPES) {
        return [{ file, declared: declarations(content) }]
      }
      return namespaceBodies(content).map((body) => ({
        file,
        declared: declarations(body),
      }))
    })

describe('shared custom types verifier', () => {
  test('the custom types are generated into one shared file', () => {
    const customTypesFile = join(outDir, CUSTOM_TYPES)
    assert.ok(
      existsSync(customTypesFile),
      `${customTypesFile} was not generated`
    )
    const names = declaredTypeNames(readFileSync(customTypesFile, 'utf-8'))
    assert.ok(names.includes('FormatPostalAddressInput'))
  })

  test('each generated tree has exactly one custom types file', () => {
    const problems: string[] = []
    for (const tree of trees()) {
      const copies = treeFiles(tree).filter(
        (file) => basename(file) === CUSTOM_TYPES && !isSdkSlice(tree, file)
      )
      if (copies.length !== 1 || copies[0] !== join(tree, CUSTOM_TYPES)) {
        problems.push(
          `${label(tree) || '.pikku'}: expected only ${CUSTOM_TYPES} at its root, found [${copies.map(label).join(', ')}]`
        )
      }
    }
    assert.equal(problems.length, 0, problems.join('\n'))
  })

  test('no typed map carries its own copy of a custom type', () => {
    const redeclared: string[] = []
    for (const tree of trees()) {
      const customNames = new Set(readCustomTypes(tree).keys())
      for (const file of treeFiles(tree)) {
        if (basename(file) === CUSTOM_TYPES) continue
        const content = withoutNamespaces(readFileSync(file, 'utf-8'))
        for (const [name, body] of declarations(content)) {
          if (customNames.has(name) && !body.startsWith(`${NAMESPACE}.`)) {
            redeclared.push(`${label(file)}: ${name}`)
          }
        }
      }
    }
    assert.equal(
      redeclared.length,
      0,
      `custom types redeclared outside the shared file:\n${redeclared.join('\n')}`
    )
  })

  test('SDK slices carry the same custom types as the shared file', () => {
    const drifted: string[] = []
    let checked = 0
    for (const tree of trees()) {
      const shared = readCustomTypes(tree)
      for (const { file, declared } of slices(tree)) {
        for (const [name, body] of declared) {
          checked++
          const original = shared.get(name)
          if (original === undefined) {
            drifted.push(`${label(file)}: ${name} is not in the shared file`)
          } else if (original !== body) {
            drifted.push(
              `${label(file)}: ${name} differs from the shared file\n    shared: ${original}\n    slice:  ${body}`
            )
          }
        }
      }
    }
    assert.ok(checked > 0, 'no SDK slice carried a custom type to compare')
    assert.equal(
      drifted.length,
      0,
      `SDK slices drifted from the shared custom types:\n${drifted.join('\n')}`
    )
  })

  test('every generated import is relative or a package specifier', () => {
    const absolute: string[] = []
    for (const file of generatedTypeScript(outDir)) {
      const content = readFileSync(file, 'utf-8')
      for (const [, specifier = ''] of content.matchAll(
        /^import [^'"]* from ['"]([^'"]+)['"]/gm
      )) {
        if (specifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(specifier)) {
          absolute.push(`${relative(outDir, file)}: ${specifier}`)
        }
      }
    }
    assert.deepEqual(absolute, [])
  })

  test('the shared file imports the source types its custom types use', () => {
    assert.match(
      readFileSync(join(outDir, CUSTOM_TYPES), 'utf-8'),
      /import type \{ PostalAddress \} from '\.\.\/src\/functions\/custom-types\/postal-address\.types\.js'/
    )
  })
})
