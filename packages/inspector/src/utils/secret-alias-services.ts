import type ts from 'typescript'

const SECRET_SERVICE_METHODS = [
  'getSecret',
  'hasSecret',
  'setSecret',
  'deleteSecret',
  'getSecrets',
]

/** Whether a type structurally satisfies `SecretService`. */
export const isSecretServiceType = (
  type: ts.Type,
  checker: ts.TypeChecker
): boolean => {
  const nonNullable = checker.getNonNullableType(type)
  return SECRET_SERVICE_METHODS.every((method) => {
    const property = nonNullable.getProperty(method)
    if (!property) {
      return false
    }
    const declaration = property.valueDeclaration ?? property.declarations?.[0]
    if (!declaration) {
      return false
    }
    const propertyType = checker.getTypeOfSymbolAtLocation(
      property,
      declaration
    )
    return propertyType.getCallSignatures().length > 0
  })
}

/**
 * Singleton service names, other than `secrets`, whose type is a
 * `SecretService`.
 */
export const findSecretAliasServices = (
  singletonServicesType: ts.Type,
  checker: ts.TypeChecker
): string[] => {
  const aliases: string[] = []
  for (const property of singletonServicesType.getProperties()) {
    const name = property.getName()
    if (name === 'secrets') {
      continue
    }
    const declaration = property.valueDeclaration ?? property.declarations?.[0]
    if (!declaration) {
      continue
    }
    const type = checker.getTypeOfSymbolAtLocation(property, declaration)
    if (isSecretServiceType(type, checker)) {
      aliases.push(name)
    }
  }
  return aliases.sort()
}
