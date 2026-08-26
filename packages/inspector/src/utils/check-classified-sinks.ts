import * as ts from 'typescript'
import { findPiiPaths } from './check-pii-output.js'
import { doesTypeExtendsCore } from './does-type-extend-core-type.js'

export type SinkClassification = 'secret' | 'pii'

export type SinkViolation = {
  /** How the value reaches the outside world, e.g. `logger.info`. */
  sink: string
  /** Dotted path to the secret inside the argument, or `<argument>` when bare. */
  path: string
  /** Position of the offending argument, for the diagnostic message. */
  line: number
  /** Which brand was found, so the caller can pick the diagnostic. */
  classification: SinkClassification
}

/**
 * A method that writes its arguments somewhere a classified value must never
 * land, keyed by the core interface that owns it. `'*'` means every method on
 * the type is a sink, which is true of a logger.
 *
 * `rejects` differs per sink because the two brands leak differently. A vault
 * secret is wrong everywhere: no sink has a legitimate reason to receive one.
 * PII is wrong only where it leaves the operator's control, or lands somewhere
 * never designed to hold it:
 *
 *   - a log is read far more widely than the record it came from, is usually
 *     shipped to a third-party aggregator, and is retained long past the
 *     lifetime of any consent — so PII does not belong in one;
 *   - a webhook posts to somebody else's server, which is the same disclosure
 *     with a different transport;
 *   - an email is addressed to the data subject, and their own name in it is
 *     the point;
 *   - an audit is a record in the operator's own database, and naming who did
 *     what is usually the legal requirement rather than a breach of it;
 *   - a queue payload stays on the operator's own infrastructure and is
 *     consumed by their own worker.
 *
 * `private` is deliberately absent everywhere: it marks a value that is not
 * public, which is a statement about who may read the row — not a claim that
 * writing it down is a disclosure.
 */
const SINKS: Array<{
  coreType: string
  methods: '*' | string[]
  rejects: SinkClassification[]
}> = [
  { coreType: 'Logger', methods: '*', rejects: ['secret', 'pii'] },
  { coreType: 'WebhookService', methods: ['send'], rejects: ['secret', 'pii'] },
  { coreType: 'QueueService', methods: ['add'], rejects: ['secret'] },
  { coreType: 'EmailService', methods: ['send'], rejects: ['secret'] },
  {
    coreType: 'AuditService',
    methods: ['audit', 'write'],
    rejects: ['secret'],
  },
  { coreType: 'AuditLog', methods: ['write'], rejects: ['secret'] },
]

/** `console` has no Pikku type, and is read as widely as any logger. */
const CONSOLE_REJECTS: SinkClassification[] = ['secret', 'pii']

/**
 * Finds revealed vault secrets — and, for the sinks that reject them, PII
 * columns — that flow into a sink.
 *
 * `SecretValue` is nominally typed, so the type system alone stops it reaching
 * any of these. `.reveal()` is the deliberate escape hatch, and it hands back
 * `Secret<T>` — the erasable classification brand. That brand is what this scan
 * follows, which means it catches the revealed value both inline
 * (`logger.info(s.reveal())`) and through a local binding, because the local's
 * inferred type carries the brand too.
 *
 * PII arrives by the same route without a `.reveal()`: `Pii<T>` is the brand the
 * generated row types carry, so a column read straight out of the database keeps
 * it through a local binding and into the call.
 *
 * The brand is optional by design, so an explicit annotation (`const t: string =
 * s.reveal()`, or `const email: string = user.email`) erases it and this scan
 * goes quiet. That is the documented limit
 * of a structural marker: it catches the mistake, not someone determined to
 * silence it.
 *
 * Sinks are matched on the receiver's resolved core interface, which means the
 * scan needs the services parameter to be typed. Real projects get that from
 * the generated `#pikku` factory; a hand-rolled file that calls the raw core
 * factory without annotating its services leaves the parameter `any`, and an
 * `any` receiver matches nothing.
 */
export function findClassifiedSinks(
  checker: ts.TypeChecker,
  handler: ts.Node
): SinkViolation[] {
  const violations: SinkViolation[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const sink = describeSink(checker, node.expression)
      if (sink) {
        for (const arg of node.arguments) {
          const found = findClassifiedExpression(checker, arg, sink.rejects)
          if (found) {
            violations.push({
              sink: sink.name,
              path: found.node.getText(),
              line:
                found.node
                  .getSourceFile()
                  .getLineAndCharacterOfPosition(found.node.getStart()).line +
                1,
              classification: found.classification,
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
 * Finds the first expression inside a sink argument whose own type carries one
 * of the brands this sink rejects, and returns it so the diagnostic can quote
 * it.
 *
 * This walks the argument rather than typing it whole, because an object
 * literal in an argument position is contextually typed by the parameter — for
 * a guarded sink that parameter is `Safe<M>`, and resolving the literal against
 * it drops the optional brand before it can be read. Each inner expression
 * (`token.reveal()`, or a reference to a local holding it) carries its own type
 * regardless of the surrounding context, so reading those is what actually
 * sees the secret.
 */
function findClassifiedExpression(
  checker: ts.TypeChecker,
  node: ts.Node,
  rejects: SinkClassification[],
  /**
   * The node is only being read to reach a property of it, so its own type says
   * nothing about what the call receives. Without this, `user.userId` reports
   * the row's `email` column: the walk types the `user` receiver on its way
   * down, and a row type is branded wherever any of its columns are.
   */
  isReceiver = false
): { node: ts.Expression; classification: SinkClassification } | undefined {
  // Descend first, so an object literal wrapping the secret reports the
  // expression that actually holds it (`token.reveal()`) rather than the whole
  // literal. Nothing inside a `SecretValue` receiver is itself branded, so a
  // bare `token.reveal()` still falls through to the self-check below.
  for (const child of node.getChildren()) {
    // A property name is not a value, and typing it re-resolves the property.
    if (ts.isPropertyAssignment(node) && child === node.name) continue
    const childIsReceiver =
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)) &&
      child === node.expression
    const found = findClassifiedExpression(
      checker,
      child,
      rejects,
      childIsReceiver
    )
    if (found) return found
  }

  if (!isReceiver && ts.isExpression(node) && !ts.isStringLiteralLike(node)) {
    const type = checker.getTypeAtLocation(node)
    /* `secret` outranks `pii` when a value somehow carries both, so the caller
       reports the more serious of the two rather than whichever came first. */
    for (const classification of ['secret', 'pii'] as const) {
      if (!rejects.includes(classification)) continue
      const hit = findPiiPaths(checker, type).some(
        (f) => f.classification === classification
      )
      if (hit) return { node, classification }
    }
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
): { name: string; rejects: SinkClassification[] } | undefined {
  const method = callee.name.text
  const receiver = callee.expression

  if (ts.isIdentifier(receiver) && receiver.text === 'console') {
    return { name: `console.${method}`, rejects: CONSOLE_REJECTS }
  }

  const receiverType = checker.getTypeAtLocation(receiver)
  for (const { coreType, methods, rejects } of SINKS) {
    if (methods !== '*' && !methods.includes(method)) continue
    if (doesTypeExtendsCore(receiverType, checker, new Set(), coreType)) {
      return { name: `${receiver.getText()}.${method}`, rejects }
    }
  }

  return undefined
}
