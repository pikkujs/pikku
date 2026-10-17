import type ts from 'typescript'
import type { InspectorServiceTypes, InspectorState } from '../types.js'
import { extractTypeKeys } from './type-utils.js'
import { resolveCoreType } from './resolve-core-type.js'
import { findSecretAliasServices } from './secret-alias-services.js'

/**
 * Reads the checker's view of the SingletonServices and Services types into
 * plain names, so the shared finalize phase can aggregate services and refuse
 * secret aliases without a `ts.Type` in hand.
 */
export const resolveServiceTypes = (
  state: Pick<
    InspectorState,
    | 'typesLookup'
    | 'singletonServicesTypeImportMap'
    | 'wireServicesTypeImportMap'
  >,
  checker: ts.TypeChecker
): InspectorServiceTypes => {
  const singletonServicesType = resolveCoreType(
    state.typesLookup,
    state.singletonServicesTypeImportMap
  )
  const servicesType = resolveCoreType(
    state.typesLookup,
    state.wireServicesTypeImportMap
  )
  return {
    singletonServices: singletonServicesType
      ? extractTypeKeys(singletonServicesType).sort()
      : null,
    services: servicesType ? extractTypeKeys(servicesType) : null,
    secretAliases: singletonServicesType
      ? findSecretAliasServices(singletonServicesType, checker)
      : [],
  }
}
