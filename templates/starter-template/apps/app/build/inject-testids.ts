import path from 'node:path'
import type { PluginObj, NodePath, types as BabelTypes } from '@babel/core'

/**
 * Stamp the addresses browser scenarios use, at compile time.
 *
 * Two rules, because a scenario needs to name a control AND, when the same control appears
 * twice on screen, say which one:
 *
 * - **A control** gets `data-testid` = its i18n MESSAGE KEY. Every other address the app
 *   already has is something it is free to change without meaning to: role+accessible-name
 *   reads the RENDERED COPY, which here is a paraglide message, so a scenario written
 *   against it is really asserting a translated string and breaks on a reworded button or a
 *   locale switch. A CSS selector breaks on a redesign. Message TEXT is copy and changes
 *   freely; the message KEY is the control's meaning, and only changes when the control's
 *   meaning does — at which point a scenario naming the old one SHOULD fail.
 * - **A component's root element** gets `data-testid` = its component name, kebab-cased.
 *   Keys are NOT unique — `m.common__save()` is meant to be reused — so the id alone is
 *   ambiguous whenever two forms are open at once. That is not a flaw to design out: this
 *   app's own console steps already handle testids matching several nodes by filtering
 *   (`addon-console.steps.ts`), and pikku's TestIdSelector has `within`/`containing` for
 *   exactly this. Scoping only works if the containers are addressable too, which is what
 *   this second rule provides — `clicks common__save within entry-form`.
 *
 * Deriving both removes the discipline problem rather than policing it: nothing has to be
 * added to a component, and the ids are identical on every build.
 */

/** Mantine's controls plus the native elements, by tag. */
const INTERACTIVE = new Set([
  'Button',
  'ActionIcon',
  'Anchor',
  'NavLink',
  'CloseButton',
  'TextInput',
  'Textarea',
  'PasswordInput',
  'NumberInput',
  'JsonInput',
  'FileInput',
  'PinInput',
  'Select',
  'NativeSelect',
  'MultiSelect',
  'Autocomplete',
  'TagsInput',
  'Checkbox',
  'Radio',
  'Switch',
  'Chip',
  'SegmentedControl',
  'Slider',
  'Rating',
  'ColorInput',
  'DateInput',
  'DatePickerInput',
  'DateTimePicker',
  'TimeInput',
  'button',
  'a',
  'input',
  'textarea',
  'select',
])

/** The compound controls, which arrive as `Menu.Item` rather than a bare identifier. */
const INTERACTIVE_MEMBERS = new Set([
  'Menu.Item',
  'Tabs.Tab',
  'Accordion.Control',
  'Combobox.Option',
])

/**
 * Where a control's meaning is written, most specific first.
 *
 * `aria-label` carries it for the icon-only buttons with no visible text — the same
 * attribute a screen reader needs, so a control this cannot address is usually one a screen
 * reader cannot announce either.
 */
const LABEL_ATTRIBUTES = ['label', 'aria-label', 'placeholder', 'title']

const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

const isInteractive = (tag: string | null): boolean =>
  !!tag && (INTERACTIVE.has(tag) || INTERACTIVE_MEMBERS.has(tag))

const tagName = (node: BabelTypes.JSXOpeningElement['name']): string | null => {
  if (node.type === 'JSXIdentifier') return node.name
  if (node.type === 'JSXMemberExpression') {
    const object = node.object
    if (object.type !== 'JSXIdentifier') return null
    return `${object.name}.${node.property.name}`
  }
  return null
}

/**
 * The paraglide message key behind an expression, e.g. `m.entry__save_label()` → the key.
 *
 * Searches rather than matching one shape, because a label is as often `cond ? m.a() : m.b()`
 * as a bare call. The FIRST key wins: across a conditional the branches are one control
 * saying two things, and an id that changed with state could not be addressed at all.
 */
function messageKey(node: BabelTypes.Node | null | undefined): string | null {
  if (!node) return null
  if (node.type === 'CallExpression') {
    const callee = node.callee
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === 'm' &&
      callee.property.type === 'Identifier'
    ) {
      return callee.property.name
    }
  }
  const nested: Array<BabelTypes.Node | null | undefined> = []
  if (node.type === 'JSXExpressionContainer') nested.push(node.expression)
  if (node.type === 'ConditionalExpression') nested.push(node.consequent, node.alternate)
  if (node.type === 'LogicalExpression') nested.push(node.left, node.right)
  if (node.type === 'TemplateLiteral') nested.push(...node.expressions)
  if (node.type === 'CallExpression') nested.push(...node.arguments)
  for (const child of nested) {
    const key = messageKey(child)
    if (key) return key
  }
  return null
}

/** A literal `name`/`id` — the stable identity a control has when its label is dynamic. */
function literalIdentity(attributes: BabelTypes.JSXOpeningElement['attributes']): string | null {
  for (const attribute of attributes) {
    if (attribute.type !== 'JSXAttribute') continue
    const attributeName = attribute.name.type === 'JSXIdentifier' ? attribute.name.name : null
    if (attributeName !== 'name' && attributeName !== 'id') continue
    if (attribute.value?.type === 'StringLiteral') return attribute.value.value
  }
  return null
}

export interface InjectTestIdsOptions {
  /**
   * Stamp `data-fabric-src="src/routes/app.orders.tsx:42"` beside every testid.
   *
   * Off unless fabric turns it on for the build, because this writes the app's
   * own source layout into markup an end user can read in view-source. It is
   * also the expensive half of the changes panel: one attribute per addressable
   * element, where the panel's own code is one chunk.
   *
   * The path is interned per module — one string constant the elements in that
   * file concatenate their line onto — so a file with forty controls ships its
   * path once rather than forty times.
   */
  sourceAnchors?: boolean
  /** Repo root the stamped paths are relative to. Defaults to the build's cwd. */
  root?: string
}

export default function injectTestIds(
  { types: t }: { types: typeof BabelTypes },
  options: InjectTestIdsOptions = {},
): PluginObj {
  const anchors = options.sourceAnchors === true
  const root = options.root ?? process.cwd()

  let anchorIdentifier: BabelTypes.Identifier | null = null
  let anchorPath: string | null = null
  let anchorUsed = false

  const attributeName = (attribute: BabelTypes.JSXOpeningElement['attributes'][number]) =>
    attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier'
      ? attribute.name.name
      : null

  /**
   * Whether this element is already spoken for. A hand-written id always wins — it is how a
   * list row carries the id of the record it shows, which no static rule could derive. A
   * spread may carry one, and merging into it would need a runtime helper for a case that is
   * already addressable, so leave those to the author too.
   */
  const claimed = (element: BabelTypes.JSXOpeningElement) =>
    element.attributes.some(
      (attribute) =>
        attributeName(attribute) === 'data-testid' || attribute.type === 'JSXSpreadAttribute',
    )

  const stamp = (element: BabelTypes.JSXOpeningElement, value: string) => {
    element.attributes.push(t.jsxAttribute(t.jsxIdentifier('data-testid'), t.stringLiteral(value)))
  }

  /**
   * Anchors go on elements that are ALREADY claimed by a hand-written testid too
   * — knowing an element's name and knowing where its JSX lives are different
   * questions, and the author answering the first does not answer the second.
   */
  const anchor = (element: BabelTypes.JSXOpeningElement) => {
    if (!anchors || !anchorIdentifier) return
    const line = element.loc?.start.line
    if (!line) return
    if (element.attributes.some((attribute) => attributeName(attribute) === 'data-fabric-src')) {
      return
    }
    anchorUsed = true
    element.attributes.push(
      t.jsxAttribute(
        t.jsxIdentifier('data-fabric-src'),
        t.jsxExpressionContainer(
          t.binaryExpression('+', t.cloneNode(anchorIdentifier), t.stringLiteral(`:${line}`)),
        ),
      ),
    )
  }

  /** A component is a PascalCase function — the same rule React itself uses to tell them apart. */
  const componentName = (path: NodePath<BabelTypes.Function>): string | null => {
    const node = path.node
    if (node.type === 'FunctionDeclaration' && node.id) {
      return /^[A-Z]/.test(node.id.name) ? node.id.name : null
    }
    const parent = path.parent
    if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
      return /^[A-Z]/.test(parent.id.name) ? parent.id.name : null
    }
    return null
  }

  return {
    name: 'pikku-inject-testids',
    visitor: {
      Program: {
        enter(program, state) {
          anchorIdentifier = null
          anchorPath = null
          anchorUsed = false
          if (!anchors || !state.filename) return
          anchorPath = path.relative(root, state.filename).split(path.sep).join('/')
          anchorIdentifier = program.scope.generateUidIdentifier('fabricSrc')
        },
        exit(program) {
          if (!anchorUsed || !anchorIdentifier || !anchorPath) return
          program.unshiftContainer(
            'body',
            t.variableDeclaration('const', [
              t.variableDeclarator(anchorIdentifier, t.stringLiteral(anchorPath)),
            ]),
          )
        },
      },

      JSXOpeningElement(path) {
        if (!isInteractive(tagName(path.node.name))) return
        anchor(path.node)
        if (claimed(path.node)) return

        let key: string | null = null
        for (const wanted of LABEL_ATTRIBUTES) {
          for (const attribute of path.node.attributes) {
            if (attributeName(attribute) !== wanted || attribute.type !== 'JSXAttribute') continue
            key = messageKey(attribute.value)
            if (key) break
          }
          if (key) break
        }

        // A button says what it does in its children rather than a label prop.
        if (!key && path.parentPath.node.type === 'JSXElement') {
          for (const child of path.parentPath.node.children) {
            key = messageKey(child)
            if (key) break
          }
        }

        key ??= literalIdentity(path.node.attributes)

        // No key, no id — DELIBERATELY. The alternative is a positional fallback
        // (`today-button-3`) that shifts the moment a control is added above it, turning
        // every scenario using it into a flake. A control with no message key and no `name`
        // has no stable identity to expose, and the fix belongs upstream: give it an
        // `aria-label`, which it needs for a screen reader anyway.
        if (key) stamp(path.node, key)
      },

      Function(path) {
        const name = componentName(path)
        if (!name) return
        const id = kebab(name)

        // Every element this component can RETURN, so a component that renders a loading
        // state and a loaded one is addressable in both. Returns inside a nested function
        // belong to that function (a render prop, a map callback), not to this component.
        path.traverse({
          Function(inner) {
            inner.skip()
          },
          ReturnStatement(statement) {
            const returned = statement.node.argument
            if (returned?.type !== 'JSXElement') return
            anchor(returned.openingElement)
            if (claimed(returned.openingElement)) return
            // A component whose root IS a control (a lone `<Select>` wrapped in nothing)
            // keeps its OWN key — the more specific address, and there is nothing inside it
            // to scope anyway. Without this the container rule would win purely because
            // babel reaches the function before its JSX, and the control would be
            // addressable only by the name of the component wrapping it.
            if (isInteractive(tagName(returned.openingElement.name))) return
            stamp(returned.openingElement, id)
          },
        })
      },
    },
  }
}
