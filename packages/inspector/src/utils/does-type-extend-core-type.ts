import * as ts from 'typescript'

export const doesTypeExtendsCore = (
  type: ts.Type,
  checker: ts.TypeChecker,
  visitedTypes: Set<ts.Type>,
  coreType: string
): boolean => {
  if (!type || !checker) return false

  // Avoid infinite recursion by checking if we've already visited this type
  if (visitedTypes.has(type)) {
    return false
  }
  visitedTypes.add(type)

  const typeSymbol = type.getSymbol()
  if (typeSymbol) {
    // Check if the type is the core type
    if (typeSymbol.getName() === coreType) {
      return true
    }

    // For interface and class types, check their base types
    if (type.isClassOrInterface()) {
      const baseTypes = type.getBaseTypes() || []
      for (const baseType of baseTypes) {
        if (doesTypeExtendsCore(baseType, checker, visitedTypes, coreType)) {
          return true
        }
      }
    }
  }

  // For type aliases, get the aliased type
  if (type.aliasSymbol) {
    const aliasedType = checker.getDeclaredTypeOfSymbol(type.aliasSymbol)
    if (doesTypeExtendsCore(aliasedType, checker, visitedTypes, coreType)) {
      return true
    }
  }

  // For union and intersection types, check all constituent types
  if (type.isUnionOrIntersection()) {
    for (const subType of type.types) {
      if (doesTypeExtendsCore(subType, checker, visitedTypes, coreType)) {
        return true
      }
    }
  }

  return false
}
