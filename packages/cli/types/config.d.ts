import { InspectorFilters } from '@pikku/inspector'
import { OpenAPISpecInfo } from '../src/functions/wirings/http/openapi-spec-generator.ts'
import { PikkuWiringTypes } from '@pikku/core'

export interface PikkuCLICoreOutputFiles {
  // Base directory
  outDir: string

  // Schema and types
  schemaDirectory: string
  typesDeclarationFile: string

  // Function definitions
  functionsFile: string
  functionsMetaFile: string
  functionsMetaMinFile: string
  functionTypesFile: string

  // HTTP
  httpWiringsFile: string
  httpWiringMetaFile: string
  httpMapDeclarationFile: string
  httpTypesFile: string

  // Channels
  channelsWiringFile: string
  channelsWiringMetaFile: string
  channelsMapDeclarationFile: string
  channelsTypesFile: string

  // RPC Internal
  rpcInternalWiringMetaFile: string
  rpcInternalMapDeclarationFile: string

  // RPC Exposed
  rpcMapDeclarationFile: string

  // Schedulers
  schedulersWiringFile: string
  schedulersWiringMetaFile: string
  schedulersTypesFile: string

  // Queue processors
  queueWorkersWiringFile: string
  queueWorkersWiringMetaFile: string
  queueMapDeclarationFile: string
  queueTypesFile: string

  // MCP
  mcpWiringsFile: string
  mcpWiringsMetaFile: string
  mcpTypesFile: string

  // CLI
  cliWiringsFile: string
  cliWiringMetaFile: string
  cliBootstrapFile: string
  cliTypesFile: string

  // Services
  servicesFile: string

  // Middleware
  middlewareFile: string

  // Application bootstrap
  bootstrapFile: string
  bootstrapFiles: Record<PikkuWiringTypes, string>
}

export type PikkuCLIInput = {
  $schema?: string

  extends?: string

  rootDir: string
  srcDirectories: string[]
  packageMappings: Record<string, string>
  supportsImportAttributes: boolean

  configDir: string
  tsconfig: string

  nextBackendFile?: string
  nextHTTPFile?: string
  fetchFile?: string
  websocketFile?: string
  rpcWiringsFile?: string
  queueWiringsFile?: string
  mcpJsonFile?: string

  openAPI?: {
    outputFile: string
    additionalInfo: OpenAPISpecInfo
  }

  cli?: {
    entrypoints?: Record<
      string,
      | string
      | { type: 'cli'; path: string }
      | {
          type: 'channel'
          name?: string
          route?: string
          wirePath: string
          path?: string
        }
      | Array<
          | string
          | { type: 'cli'; path: string }
          | {
              type: 'channel'
              name?: string
              route?: string
              wirePath: string
              path?: string
            }
        >
    >
  }

  middlewareServices?: string[]

  schemasFromTypes?: string[]

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles

export type PikkuCLIConfig = {
  $schema?: string

  extends?: string

  rootDir: string
  srcDirectories: string[]
  packageMappings: Record<string, string>
  supportsImportAttributes: boolean

  configFile?: string
  tags?: string[]
  types?: string[]

  configDir: string
  tsconfig: string

  nextBackendFile?: string
  nextHTTPFile?: string
  fetchFile?: string
  websocketFile?: string
  rpcWiringsFile?: string
  queueWiringsFile?: string
  mcpJsonFile?: string

  openAPI?: {
    outputFile: string
    additionalInfo: OpenAPISpecInfo
  }

  cli?: {
    entrypoints?: Record<
      string,
      | string
      | { type: 'cli'; path: string }
      | {
          type: 'channel'
          name?: string
          route?: string
          wirePath: string
          path?: string
        }
      | Array<
          | string
          | { type: 'cli'; path: string }
          | {
              type: 'channel'
              name?: string
              route?: string
              wirePath: string
              path?: string
            }
        >
    >
  }

  middlewareServices?: string[]

  schemasFromTypes?: string[]

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles
