import type { Secret } from './data-classification.js'

declare const secretValueBrand: unique symbol

export const REDACTED = '[secret]'

/** Runtime marker, resilient to duplicate copies of core. */
const SECRET_VALUE = Symbol.for('pikku.secretValue')

const NODE_INSPECT = Symbol.for('nodejs.util.inspect.custom')

export class SecretCoercionError extends Error {
  constructor() {
    super(
      `A secret was coerced to a string, which would write it out in the clear. Unwrap it deliberately with .reveal() at the point it reaches the wire.`
    )
    this.name = 'SecretCoercionError'
  }
}

/**
 * A vault secret. Nominal, so it is not assignable to `string` and every
 * concretely-typed sink rejects it; `.reveal()` is the one way out, and every
 * call is a deliberate, greppable disclosure.
 *
 * The revealed value carries the erasable `Secret<T>` classification brand, so
 * the inspector can still follow it one hop past the call.
 *
 * Structured serialization redacts to `[secret]` — an audit or log write must
 * stay honest about the field without crashing the request. String coercion
 * throws, because a template literal or concatenation is always a leak.
 */
export class SecretValue<T = string> {
  declare readonly [secretValueBrand]: true
  readonly [SECRET_VALUE] = true

  readonly #value: T

  constructor(value: T) {
    this.#value = value
  }

  reveal(): Secret<T> {
    return this.#value as Secret<T>
  }

  toJSON(): string {
    return REDACTED
  }

  [NODE_INSPECT](): string {
    return REDACTED
  }

  toString(): never {
    throw new SecretCoercionError()
  }

  [Symbol.toPrimitive](): never {
    throw new SecretCoercionError()
  }
}

export const createSecretValue = <T>(value: T): SecretValue<T> =>
  new SecretValue(value)

export const isSecretValue = (value: unknown): value is SecretValue<unknown> =>
  typeof value === 'object' && value !== null && SECRET_VALUE in value

type IsAny<T> = 0 extends 1 & T ? true : false

type Passthrough =
  | Function
  | Date
  | RegExp
  | Error
  | ArrayBuffer
  | ArrayBufferView

/**
 * Rejects a `SecretValue` anywhere in `T`, however deeply nested, by collapsing
 * it to `never`.
 *
 * For sinks whose parameters are `any`, `unknown` or a free generic — loggers,
 * queue payloads, channel messages — where nominality alone cannot help.
 * `any` is passed through untouched: it cannot be guarded, and collapsing it
 * would reject every legitimate call.
 *
 * `Promise`, `Map` and `Set` are recursed into rather than passed through. A
 * mapped type cannot reach what they hold — mapping their keys yields their
 * methods, not their contents — so treating them as opaque let a secret ride
 * through inside one. `Promise` is the case that bites: `getSecret()` returns
 * `Promise<SecretValue<T>>`, so a forgotten `await` would otherwise log a
 * secret.
 */
export type Safe<T> =
  IsAny<T> extends true
    ? T
    : [Extract<T, SecretValue<any>>] extends [never]
      ? T extends Promise<infer V>
        ? Promise<Safe<V>>
        : T extends Map<infer K, infer V>
          ? Map<Safe<K>, Safe<V>>
          : T extends Set<infer V>
            ? Set<Safe<V>>
            : T extends Passthrough
              ? T
              : T extends object
                ? { [K in keyof T]: Safe<T[K]> }
                : T
      : never
