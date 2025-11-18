import * as ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs'

export interface ServiceMetadata {
  name: string
  summary: string
  description: string
  package: string
  path: string
  version: string
  interface: string
  expandedProperties: Record<string, string>
}

/**
 * Extract JSDoc comment information from a TypeScript node
 */
function extractJSDoc(
  node: ts.Node,
  sourceFile: ts.SourceFile
): { summary: string; description: string } {
  const jsDocTags = ts.getJSDocTags(node)
  const jsDocComments = ts.getJSDocCommentsAndTags(node)

  let summary = ''
  let description = ''

  // Extract @summary tag
  const summaryTag = jsDocTags.find((tag) => tag.tagName.text === 'summary')
  if (summaryTag && summaryTag.comment) {
    summary =
      typeof summaryTag.comment === 'string'
        ? summaryTag.comment
        : summaryTag.comment.map((c) => c.text).join('')
  }

  // Extract description from JSDoc body (not @description tag, just the body)
  for (const comment of jsDocComments) {
    if (ts.isJSDoc(comment) && comment.comment) {
      const commentText =
        typeof comment.comment === 'string'
          ? comment.comment
          : comment.comment.map((c) => c.text).join('')

      // If we don't have a summary yet, use the first line as summary
      if (!summary && commentText) {
        const lines = commentText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        if (lines.length > 0) {
          summary = lines[0]
          if (lines.length > 1) {
            description = lines.slice(1).join('\n').trim()
          }
        }
      } else {
        description = commentText
      }
      break // Only use the first JSDoc comment
    }
  }

  return { summary, description }
}

/**
 * Serialize a TypeScript type to a string representation
 */
function serializeTypeToString(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker
): string {
  // Get the actual source file where the node is located (might be different from the passed sourceFile)
  const nodeSourceFile = node.getSourceFile()

  // For interfaces and type aliases, get the exact source text from the correct source file
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    return node.getText(nodeSourceFile)
  }

  // If it's a class, extract public members only
  if (ts.isClassDeclaration(node)) {
    return serializePublicClassMembers(node, nodeSourceFile, checker)
  }

  // Fallback: try to get the type and serialize it using the type checker
  const type = checker.getTypeAtLocation(node)
  return checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation)
}

/**
 * Extract public members from a class and serialize them
 */
function serializePublicClassMembers(
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker
): string {
  const className = classNode.name?.text || 'UnnamedClass'
  const publicMembers: string[] = []

  for (const member of classNode.members) {
    // Check if the member is public (no private/protected modifiers)
    const modifiers = ts.canHaveModifiers(member)
      ? ts.getModifiers(member)
      : undefined
    const isPublic = !modifiers?.some(
      (mod) =>
        mod.kind === ts.SyntaxKind.PrivateKeyword ||
        mod.kind === ts.SyntaxKind.ProtectedKeyword
    )

    if (!isPublic) continue

    // Only include methods, properties, and constructors
    if (
      ts.isMethodDeclaration(member) ||
      ts.isPropertyDeclaration(member) ||
      ts.isConstructorDeclaration(member)
    ) {
      // Get the member signature without implementation
      const memberSignature = getMemberSignature(member, sourceFile, checker)
      if (memberSignature) {
        publicMembers.push(memberSignature)
      }
    }
  }

  // Construct a class-like interface showing public API
  return `class ${className} {\n  ${publicMembers.join('\n  ')}\n}`
}

/**
 * Extract a clean signature for a class member (without implementation)
 */
function getMemberSignature(
  member: ts.ClassElement,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker
): string | null {
  if (ts.isPropertyDeclaration(member)) {
    // For properties, get the name and type
    const name = member.name.getText(sourceFile)
    const type = member.type ? member.type.getText(sourceFile) : 'any'
    const optional = member.questionToken ? '?' : ''
    return `${name}${optional}: ${type};`
  }

  if (ts.isMethodDeclaration(member)) {
    // For methods, get the full signature without body
    const name = member.name.getText(sourceFile)
    const typeParams = member.typeParameters
      ? `<${member.typeParameters.map((tp) => tp.getText(sourceFile)).join(', ')}>`
      : ''
    const params = member.parameters
      .map((p) => p.getText(sourceFile))
      .join(', ')
    const returnType = member.type ? member.type.getText(sourceFile) : 'void'
    const optional = member.questionToken ? '?' : ''
    return `${name}${optional}${typeParams}(${params}): ${returnType};`
  }

  if (ts.isConstructorDeclaration(member)) {
    // For constructors, get the parameter list
    const params = member.parameters
      .map((p) => p.getText(sourceFile))
      .join(', ')
    return `constructor(${params});`
  }

  return null
}

/**
 * Find the nearest package.json and extract package name and version
 */
function getPackageInfo(filePath: string): {
  packageName: string
  version: string
} {
  let currentDir = path.dirname(filePath)
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf-8')
        )
        return {
          packageName: packageJson.name || 'unknown',
          version: packageJson.version || '0.0.0',
        }
      } catch (err) {
        // If we can't parse the package.json, continue searching
      }
    }
    currentDir = path.dirname(currentDir)
  }

  return { packageName: 'unknown', version: '0.0.0' }
}

/**
 * Expand a type to show all its properties including inherited ones
 * Returns a Record mapping property names to their type strings
 */
function expandInterfaceProperties(
  type: ts.Type,
  checker: ts.TypeChecker,
  maxDepth: number = 2,
  currentDepth: number = 0,
  visited: Set<ts.Type> = new Set()
): Record<string, string> {
  const result: Record<string, string> = {}

  // Prevent infinite recursion
  if (visited.has(type) || currentDepth >= maxDepth) {
    return result
  }
  visited.add(type)

  // Get all properties (including inherited ones)
  const properties = type.getProperties()

  for (const prop of properties) {
    const propName = prop.getName()
    const propDecl = prop.valueDeclaration || prop.declarations?.[0]

    if (!propDecl) continue

    try {
      // Get the type of this property
      const propType = checker.getTypeOfSymbolAtLocation(prop, propDecl)

      // Check if property is optional
      const isOptional = !!(prop.flags & ts.SymbolFlags.Optional)

      // Serialize the type to string
      let typeString = checker.typeToString(
        propType,
        propDecl,
        ts.TypeFormatFlags.NoTruncation |
          ts.TypeFormatFlags.UseFullyQualifiedType
      )

      // Add undefined suffix for optional properties
      if (isOptional && !typeString.includes('undefined')) {
        typeString = `${typeString} | undefined`
      }

      result[propName] = typeString
    } catch (err) {
      // If we can't get the type for some reason, use 'any'
      result[propName] = 'any'
    }
  }

  return result
}

/**
 * Extract metadata for a service from its TypeScript declaration
 */
export function extractServiceMetadata(
  serviceName: string,
  type: ts.Type,
  checker: ts.TypeChecker,
  rootDir: string
): ServiceMetadata | null {
  // Get the symbol for the service property
  const property = type.getProperty(serviceName)
  if (!property) {
    return null
  }

  // Get the declaration of the service
  const declaration = property.valueDeclaration || property.declarations?.[0]
  if (!declaration) {
    return null
  }

  const sourceFile = declaration.getSourceFile()
  const filePath = sourceFile.fileName

  // Get the type of the service
  const serviceType = checker.getTypeOfSymbolAtLocation(property, declaration)

  // Try to find the actual type declaration (interface/class/type)
  let typeDeclaration: ts.Node | null = null

  if (serviceType.symbol) {
    const typeDecl =
      serviceType.symbol.valueDeclaration ||
      serviceType.symbol.declarations?.[0]
    if (
      typeDecl &&
      (ts.isInterfaceDeclaration(typeDecl) ||
        ts.isClassDeclaration(typeDecl) ||
        ts.isTypeAliasDeclaration(typeDecl))
    ) {
      typeDeclaration = typeDecl
    }
  }

  // Extract JSDoc
  let summary = ''
  let description = ''

  if (typeDeclaration) {
    const jsDoc = extractJSDoc(typeDeclaration, sourceFile)
    summary = jsDoc.summary
    description = jsDoc.description
  } else if (
    ts.isPropertySignature(declaration) ||
    ts.isPropertyDeclaration(declaration)
  ) {
    // Extract JSDoc from the property itself if we couldn't find the type declaration
    const jsDoc = extractJSDoc(declaration, sourceFile)
    summary = jsDoc.summary
    description = jsDoc.description
  }

  // Serialize the type
  let interfaceString = ''
  if (typeDeclaration) {
    interfaceString = serializeTypeToString(
      typeDeclaration,
      sourceFile,
      checker
    )
  } else {
    // Fallback: use the type checker to serialize
    interfaceString = checker.typeToString(
      serviceType,
      declaration,
      ts.TypeFormatFlags.NoTruncation
    )
  }

  // Get package info
  const { packageName, version } = getPackageInfo(filePath)

  // Make path relative to rootDir
  const relativePath = path.relative(rootDir, filePath)

  // Expand the service type to show all properties including inherited ones
  const expandedProperties = expandInterfaceProperties(serviceType, checker)

  return {
    name: serviceName,
    summary,
    description,
    package: packageName,
    path: relativePath,
    version,
    interface: interfaceString,
    expandedProperties,
  }
}

/**
 * Extract metadata for all services in a type
 */
export function extractAllServiceMetadata(
  servicesType: ts.Type,
  checker: ts.TypeChecker,
  rootDir: string
): ServiceMetadata[] {
  const metadata: ServiceMetadata[] = []
  const serviceNames = servicesType
    .getProperties()
    .map((prop) => prop.getName())

  for (const serviceName of serviceNames) {
    const serviceMeta = extractServiceMetadata(
      serviceName,
      servicesType,
      checker,
      rootDir
    )
    if (serviceMeta) {
      metadata.push(serviceMeta)
    }
  }

  return metadata
}
