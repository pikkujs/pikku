import ts from 'typescript'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  MantineComponentManifest,
  MantineManifestProp,
  MantineMeta,
  MantineTokenScale,
} from '../src/component-meta/types.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUT = join(SCRIPT_DIR, '../src/component-meta/meta.gen.ts')
const DEFAULT_CORE_DIR = join(SCRIPT_DIR, '../node_modules/@mantine/core')
const SKIPPED_PROP_PREFIXES = ['data-', '__']
const SKIPPED_PROP_NAMES = new Set([
  'children',
  'component',
  'renderRoot',
  'ref',
  'key',
])

const TOKEN_SCALES: Array<[RegExp, MantineTokenScale]> = [
  [/\bMantineSpacing\b/, 'spacing'],
  [/\bMantineRadius\b/, 'radius'],
  [/\bMantineFontSize\b/, 'fontSizes'],
  [/\bMantineShadow\b/, 'shadows'],
  [/\bMantineSize\b/, 'size'],
]

const stripWrapping = (value: string): string => {
  let out = value.trim()
  for (const quote of ['`', "'", '"']) {
    if (out.startsWith(quote) && out.endsWith(quote) && out.length > 1) {
      out = out.slice(1, -1).trim()
    }
  }
  return out
}

const CSS_WIDE_KEYWORDS = new Set([
  '-moz-initial',
  'inherit',
  'initial',
  'revert',
  'revert-layer',
  'unset',
])

const unionParts = (type: ts.Type): readonly ts.Type[] =>
  type.isUnion() ? type.types : [type]

const unionStringLiterals = (type: ts.Type): string[] => {
  const literals: string[] = []
  for (const part of unionParts(type)) {
    if (part.isStringLiteral()) literals.push(part.value)
  }
  return [...new Set(literals)]
}

const optionLiterals = (type: ts.Type): string[] =>
  unionStringLiterals(type).filter((literal) => !CSS_WIDE_KEYWORDS.has(literal))

const includesFreeString = (type: ts.Type): boolean =>
  unionParts(type).some(
    (part) =>
      (part.flags & ts.TypeFlags.String) !== 0 ||
      (part.isIntersection() &&
        part.types.some((t) => (t.flags & ts.TypeFlags.String) !== 0))
  )

const isBooleanish = (type: ts.Type): boolean =>
  unionParts(type).every(
    (part) =>
      (part.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !== 0
  )

const isNumberish = (type: ts.Type): boolean =>
  unionParts(type).some(
    (part) =>
      (part.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) !== 0
  )

function extractCore(coreDir: string): MantineMeta {
  const pkg = JSON.parse(
    readFileSync(join(coreDir, 'package.json'), 'utf-8')
  ) as {
    version: string
  }
  const componentsDir = join(coreDir, 'lib', 'components')
  const entries = readdirSync(componentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name,
      file: join(componentsDir, d.name, `${d.name}.d.ts`),
    }))
    .filter((e) => existsSync(e.file))
    .sort((a, b) => a.name.localeCompare(b.name))

  const program = ts.createProgram(
    entries.map((e) => e.file),
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      strict: false,
    }
  )
  const checker = program.getTypeChecker()

  const styleProps = new Map<string, MantineManifestProp>()

  const declarationOf = (symbol: ts.Symbol): ts.Declaration | undefined =>
    symbol.declarations?.[0]

  const typeNodeText = (symbol: ts.Symbol): string => {
    const decl = declarationOf(symbol)
    return decl && ts.isPropertySignature(decl) && decl.type
      ? decl.type.getText()
      : ''
  }

  const classifyProp = (symbol: ts.Symbol): MantineManifestProp | null => {
    const name = symbol.getName()
    if (SKIPPED_PROP_NAMES.has(name)) return null
    if (SKIPPED_PROP_PREFIXES.some((prefix) => name.startsWith(prefix)))
      return null
    const decl = declarationOf(symbol)
    if (!decl) return null

    const type = checker.getTypeOfSymbolAtLocation(symbol, decl)
    const text = typeNodeText(symbol)
    const description =
      ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim() ||
      undefined
    const defaultTag = symbol
      .getJsDocTags(checker)
      .find((tag) => tag.name === 'default')
    const defaultValue = defaultTag
      ? stripWrapping(ts.displayPartsToString(defaultTag.text ?? [])) ||
        undefined
      : undefined

    const base: MantineManifestProp = { name, kind: 'text' }
    if (defaultValue !== undefined) base.default = defaultValue
    if (description !== undefined) base.description = description

    if (type.getCallSignatures().length > 0)
      return { ...base, kind: 'function' }
    if (
      /\bReactNode\b|\bReactElement\b|\bJSX\.Element\b|\bComponentType\b/.test(
        text
      )
    ) {
      return { ...base, kind: 'node' }
    }
    if (/\bMantineColor\b/.test(text)) return { ...base, kind: 'color' }

    const options = optionLiterals(type)
    const freeText = includesFreeString(type) || undefined
    const tokenScale = TOKEN_SCALES.find(([re]) => re.test(text))?.[1]

    if (tokenScale) {
      return {
        ...base,
        kind: 'token',
        tokenScale,
        ...(options.length ? { options } : {}),
        ...(freeText ? { freeText } : {}),
      }
    }
    if (isBooleanish(type)) return { ...base, kind: 'boolean' }
    if (options.length) {
      return {
        ...base,
        kind: 'select',
        options,
        ...(freeText ? { freeText } : {}),
      }
    }
    if (isNumberish(type)) return { ...base, kind: 'number' }
    if ((type.flags & ts.TypeFlags.Object) !== 0 && !freeText)
      return { ...base, kind: 'object' }
    return base
  }

  const components: Record<string, MantineComponentManifest> = {}

  for (const entry of entries) {
    const sourceFile = program.getSourceFile(entry.file)
    if (!sourceFile) continue
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
    if (!moduleSymbol) continue
    const exports = new Map(
      checker
        .getExportsOfModule(moduleSymbol)
        .map((symbol) => [symbol.getName(), symbol])
    )

    const aliasLiterals = (aliasName: string): string[] => {
      const symbol = exports.get(aliasName)
      return symbol
        ? unionStringLiterals(checker.getDeclaredTypeOfSymbol(symbol))
        : []
    }

    const props: MantineManifestProp[] = []
    const propsSymbol = exports.get(`${entry.name}Props`)
    if (propsSymbol) {
      const propsType = checker.getDeclaredTypeOfSymbol(propsSymbol)
      for (const propSymbol of checker.getPropertiesOfType(propsType)) {
        const file = declarationOf(propSymbol)?.getSourceFile().fileName ?? ''
        if (file.includes('/style-props')) {
          if (!styleProps.has(propSymbol.getName())) {
            const styleProp = classifyProp(propSymbol)
            if (styleProp) styleProps.set(styleProp.name, styleProp)
          }
          continue
        }
        if (!file.includes('/lib/components/')) continue
        const prop = classifyProp(propSymbol)
        if (prop) props.push(prop)
      }
    }

    const variants = aliasLiterals(`${entry.name}Variant`)
    const stylesNames = aliasLiterals(`${entry.name}StylesNames`)

    let sizes = aliasLiterals(`${entry.name}Size`)
    if (!sizes.length) {
      sizes = props.find((prop) => prop.name === 'size')?.options ?? []
    }

    const cssVariables: Record<string, string[]> = {}
    const varsSymbol = exports.get(`${entry.name}CssVariables`)
    if (varsSymbol) {
      const varsType = checker.getDeclaredTypeOfSymbol(varsSymbol)
      for (const partSymbol of checker.getPropertiesOfType(varsType)) {
        const decl = declarationOf(partSymbol)
        if (!decl) continue
        cssVariables[partSymbol.getName()] = unionStringLiterals(
          checker.getTypeOfSymbolAtLocation(partSymbol, decl)
        )
      }
    }

    const isEmpty =
      !props.length &&
      !variants.length &&
      !sizes.length &&
      !stylesNames.length &&
      !Object.keys(cssVariables).length
    if (isEmpty) continue

    components[entry.name] = {
      props,
      variants,
      sizes,
      stylesNames,
      cssVariables,
    }
  }

  return {
    mantineVersion: pkg.version,
    styleProps: [...styleProps.values()],
    components,
  }
}

const coreDirs = process.argv.slice(2)
if (!coreDirs.length) coreDirs.push(DEFAULT_CORE_DIR)

const metas: MantineMeta[] = []
for (const coreDir of coreDirs) {
  if (!existsSync(join(coreDir, 'package.json'))) {
    console.error(`skipping ${coreDir}: no @mantine/core install found`)
    continue
  }
  const meta = extractCore(coreDir)
  console.log(
    `extracted @mantine/core@${meta.mantineVersion}: ${Object.keys(meta.components).length} components, ${meta.styleProps.length} style props`
  )
  metas.push(meta)
}

if (!metas.length) {
  console.error(
    'no manifests generated; pass at least one valid @mantine/core dir'
  )
  process.exit(1)
}

metas.sort(
  (a, b) =>
    Number(b.mantineVersion.split('.')[0]) -
    Number(a.mantineVersion.split('.')[0])
)

const banner = [
  '// Generated by scripts/generate-component-meta.ts — do not edit by hand.',
  `// Sources: ${metas.map((m) => `@mantine/core@${m.mantineVersion}`).join(', ')}`,
  "import type { MantineMeta } from './types.js'",
  '',
].join('\n')

writeFileSync(
  OUT,
  `${banner}\nexport const MANTINE_META: MantineMeta[] = ${JSON.stringify(metas, null, 2)}\n`
)
console.log(`wrote ${OUT}`)
