/**
 * Type constraint: every definer an app writes is reachable from `#pikku`
 *
 * An app developer imports from `#pikku`. Reaching past it to `@pikku/core` is
 * the smell that says the generator is not emitting something it should. These
 * were exactly that: `defineSecret` and `defineScope` arrived through the types
 * hub, while `defineCredential` had no definer file at all and `defineVariable`
 * had one the hub never re-exported. `cors` is middleware an app wires like any
 * other, and `InvalidOriginError` is what it throws — an app that catches the
 * one needs to be able to name the other. `MiddlewarePriority` names the
 * ordering the generated `pikkuMiddleware` config accepts.
 *
 * The import is the assertion: `#pikku` is a generated file, so a name that is
 * not emitted is a compile error here rather than a silent fallback.
 */

import {
  cors,
  defineCredential,
  defineScope,
  defineSecret,
  defineVariable,
  InvalidOriginError,
} from '#pikku'

void cors
void defineCredential
void defineScope
void defineSecret
void defineVariable
void InvalidOriginError

/**
 * The metadata shapes travel with their definer — a manifest is unreadable
 * without a name for what is in it.
 */
import type {
  CoreCredential,
  CoreSecret,
  CoreVariable,
  CredentialDefinitionMeta,
  MiddlewarePriority,
  SecretDefinitionMeta,
  VariableDefinitionMeta,
} from '#pikku'

export type _MiddlewarePriority = MiddlewarePriority
export type _CoreCredential = CoreCredential
export type _CoreSecret = CoreSecret
export type _CoreVariable = CoreVariable
export type _CredentialDefinitionMeta = CredentialDefinitionMeta
export type _SecretDefinitionMeta = SecretDefinitionMeta
export type _VariableDefinitionMeta = VariableDefinitionMeta
