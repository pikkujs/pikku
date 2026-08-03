import * as ts from 'typescript'
import { findPiiPaths } from './check-pii-output.js'
import { doesTypeExtendsCore } from './does-type-extend-core-type.js'

export type SecretSinkViolation = {
  /** How the value reaches the outside world, e.g. `logger.info`. */
  sink: string
  /** Dotted path to the secret inside the argument, or `<argument>` when bare. */
  path: string
  /** Position of the offending argument, for the diagnostic message. */
  line: number
}

/**
 * A method that writes its arguments somewhere a secret must never land, keyed
 * by the core interface that owns it. `'*'` means every method on the type is a
 * sink, which is true of a logger.
 */
const SINKS: Array<{ coreType: string; methods: '*' | string[] }> = [
  { coreType: 'Logger', methods: '*' },
  { coreType: 'QueueService', methods: ['add'] },
  { coreType: 'EmailService', methods: ['send'] },
  { coreType: 'WebhookService', methods: ['send'] },
]

/**
 * Finds revealed vault secrets that flow into a sink.
 *
 * `SecretValue` is nominally typed, so the type system alone stops it reaching
 * any of these. `.reveal()` is the deliberate escape hatch, and it hands back
 * `Secret<T>` — the erasable classification brand. That brand is what this scan
 * follows, which means it catches the revealed value both inline
 * (`logger.info(s.reveal())`) and through a local binding, because the local's
 * inferred type carries the brand too.
 *
 * The brand is optional by design, so an explicit annotation (`const t: string =
 * s.reveal()`) erases it and this scan goes quiet. That is the documented limit
 * of a structural marker: it catches the mistake, not someone determined to
 * silence it.
 *
 * Sinks are matched on the receiver's resolved core interface, which means the
 * scan needs the services parameter to be typed. Real projects get that from
 * the generated `#pikku` factory; a hand-rolled file that calls the raw core
 * factory without annotating its services leaves the parameter `any`, and an
 * `any` receiver matches nothing.
 */
export function findRevealedSecretSinks(
  checker: ts.TypeChecker,
  handler: ts.Node
): SecretSinkViolation[] {
  const violations: SecretSinkViolation[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const sink = describeSink(checker, node.expression)
      if (sink) {
        for (const arg of node.arguments) {
          const found = findSecretExpression(checker, arg)
          if (found) {
            violations.push({
              sink,
              path: found.getText(),
              line:
                found
                  .getSourceFile()
                  .getLineAndCharacterOfPosition(found.getStart()).line + 1,
            })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(handler)

  return violations
}

/**
 * Finds the first expression inside a sink argument whose own type carries the
 * secret brand, and returns it so the diagnostic can quote it.
 *
 * This walks the argument rather than typing it whole, because an object
 * literal in an argument position is contextually typed by the parameter — for
 * a guarded sink that parameter is `Safe<M>`, and resolving the literal against
 * it drops the optional brand before it can be read. Each inner expression
 * (`token.reveal()`, or a reference to a local holding it) carries its own type
 * regardless of the surrounding context, so reading those is what actually
 * sees the secret.
 */
function findSecretExpression(
  checker: ts.TypeChecker,
  node: ts.Node
): ts.Expression | undefined {
  // Descend first, so an object literal wrapping the secret reports the
  // expression that actually holds it (`token.reveal()`) rather than the whole
  // literal. Nothing inside a `SecretValue` receiver is itself branded, so a
  // bare `token.reveal()` still falls through to the self-check below.
  for (const child of node.getChildren()) {
    // A property name is not a value, and typing it re-resolves the property.
    if (ts.isPropertyAssignment(node) && child === node.name) continue
    const found = findSecretExpression(checker, child)
    if (found) return found
  }

  if (ts.isExpression(node) && !ts.isStringLiteralLike(node)) {
    const type = checker.getTypeAtLocation(node)
    const isSecret = findPiiPaths(checker, type).some(
      (f) => f.classification === 'secret'
    )
    if (isSecret) return node
  }

  return undefined
}

/**
 * Names the sink a call writes to, or undefined when the call is not one.
 * `console` is matched by identifier because it is a global with no Pikku type;
 * everything else is matched on its resolved core interface so a renamed
 * service or a decorator still counts.
 */
function describeSink(
  checker: ts.TypeChecker,
  callee: ts.PropertyAccessExpression
): string | undefined {
  const method = callee.name.text
  const receiver = callee.expression

  if (ts.isIdentifier(receiver) && receiver.text === 'console') {
    return `console.${method}`
  }

  const receiverType = checker.getTypeAtLocation(receiver)
  for (const { coreType, methods } of SINKS) {
    if (methods !== '*' && !methods.includes(method)) continue
    if (doesTypeExtendsCore(receiverType, checker, new Set(), coreType)) {
      return `${receiver.getText()}.${method}`
    }
  }

  return undefined
}
