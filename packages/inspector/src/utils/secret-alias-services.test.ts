import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {
  findSecretAliasServices,
  isSecretServiceType,
} from './secret-alias-services.js'

const SECRET_SERVICE = `
interface SecretService {
  getSecret(key: string): Promise<string>
  hasSecret(key: string): Promise<boolean>
  setSecret(key: string, value: unknown): Promise<void>
  deleteSecret(key: string): Promise<void>
  getSecrets(keys: string[]): Promise<Record<string, unknown>>
}
`

const singletonServicesTypeOf = (source: string) => {
  const fileName = '/services.ts'
  const host: ts.CompilerHost = {
    ...ts.createCompilerHost({}),
    getSourceFile: (name, languageVersion) =>
      name === fileName
        ? ts.createSourceFile(name, source, languageVersion, true)
        : undefined,
    fileExists: (name) => name === fileName,
    readFile: (name) => (name === fileName ? source : undefined),
  }
  const program = ts.createProgram([fileName], { noLib: true }, host)
  const checker = program.getTypeChecker()
  const sourceFile = program.getSourceFile(fileName)!
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) &&
      statement.name.text === 'SingletonServices'
  )!
  return {
    checker,
    type: checker.getTypeAtLocation(declaration),
  }
}

describe('findSecretAliasServices', () => {
  test('finds a secret service exposed under another name', () => {
    const { type, checker } = singletonServicesTypeOf(`
      ${SECRET_SERVICE}
      interface SingletonServices {
        secrets: SecretService
        cfg: SecretService
      }
    `)
    assert.deepEqual(findSecretAliasServices(type, checker), ['cfg'])
  })

  test('never reports `secrets` itself', () => {
    const { type, checker } = singletonServicesTypeOf(`
      ${SECRET_SERVICE}
      interface SingletonServices {
        secrets: SecretService
      }
    `)
    assert.deepEqual(findSecretAliasServices(type, checker), [])
  })

  test('leaves ordinary services alone', () => {
    const { type, checker } = singletonServicesTypeOf(`
      ${SECRET_SERVICE}
      interface Logger { info(message: string): void }
      interface SingletonServices {
        secrets: SecretService
        logger: Logger
      }
    `)
    assert.deepEqual(findSecretAliasServices(type, checker), [])
  })

  test('is not fooled by a service that only has getSecret', () => {
    const { type, checker } = singletonServicesTypeOf(`
      ${SECRET_SERVICE}
      interface Partialish { getSecret(key: string): Promise<string> }
      interface SingletonServices {
        secrets: SecretService
        partialish: Partialish
      }
    `)
    assert.deepEqual(findSecretAliasServices(type, checker), [])
  })

  test('sees through an optional service', () => {
    const { type, checker } = singletonServicesTypeOf(`
      ${SECRET_SERVICE}
      interface SingletonServices {
        secrets: SecretService
        cfg?: SecretService
      }
    `)
    assert.deepEqual(findSecretAliasServices(type, checker), ['cfg'])
  })

  test('finds a subtype that adds methods', () => {
    const { type, checker } = singletonServicesTypeOf(`
      ${SECRET_SERVICE}
      interface Scoped extends SecretService { getAllStatus(): Promise<void> }
      interface SingletonServices {
        secrets: SecretService
        scoped: Scoped
      }
    `)
    assert.deepEqual(findSecretAliasServices(type, checker), ['scoped'])
  })

  test('reports every alias, sorted', () => {
    const { type, checker } = singletonServicesTypeOf(`
      ${SECRET_SERVICE}
      interface SingletonServices {
        secrets: SecretService
        zed: SecretService
        alpha: SecretService
      }
    `)
    assert.deepEqual(findSecretAliasServices(type, checker), ['alpha', 'zed'])
  })
})

describe('isSecretServiceType', () => {
  test('refuses a type whose members are not callable', () => {
    const { type, checker } = singletonServicesTypeOf(`
      ${SECRET_SERVICE}
      interface Lookalike {
        getSecret: string
        hasSecret: string
        setSecret: string
        deleteSecret: string
        getSecrets: string
      }
      interface SingletonServices { lookalike: Lookalike }
    `)
    const property = type.getProperty('lookalike')!
    const propertyType = checker.getTypeOfSymbolAtLocation(
      property,
      property.valueDeclaration!
    )
    assert.equal(isSecretServiceType(propertyType, checker), false)
  })
})
