/**
 * Generates type definitions for CLI wirings
 */
export const serializeCLITypes = (
  functionTypesImportPath: string,
  userSessionTypeImport: string,
  userSessionTypeName: string,
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string
) => {
  return `/**

 * CLI-specific type definitions for tree-shaking optimization
 */

import { CoreCLI, wireCLI as wireCLICore, CorePikkuCLIRender, CoreCLICommandConfig } from '@pikku/core/cli'
import type { PikkuFunctionConfig, PikkuMiddleware } from '${functionTypesImportPath}'
${userSessionTypeImport}
${singletonServicesTypeImport}

${singletonServicesTypeName !== 'SingletonServices' ? `type SingletonServices = ${singletonServicesTypeName}` : ''}
${userSessionTypeName !== 'Session' ? `type Session = ${userSessionTypeName}` : ''}

/**
 * Type-safe CLI renderer definition that can access your application's services.
 * Use this to define custom renderers for CLI command output.
 *
 * @template Data - The output data type from the CLI command
 * @template RequiredServices - The services required for this renderer
 */
type PikkuCLIRender<Data, RequiredServices extends SingletonServices = SingletonServices> = CorePikkuCLIRender<Data, RequiredServices, Session>

/**
 * Creates a type-safe CLI renderer with access to your application's singleton services.
 * The renderer receives the full singleton services and output data to format and display results.
 *
 * @template Data - The output data type from the CLI command
 * @template RequiredServices - The minimum services required for type checking (defaults to SingletonServices)
 * @param render - Function that receives singleton services and data to render output
 * @returns A CLI renderer configuration
 *
 * @example
 * \`\`\`typescript
 * const myRenderer = pikkuCLIRender<MyData>(({ logger }, data) => {
 *   logger.info(data.message)
 * })
 * \`\`\`
 */
export const pikkuCLIRender = <Data, RequiredServices extends SingletonServices = SingletonServices>(
  render: (services: SingletonServices, data: Data) => void | Promise<void>
): PikkuCLIRender<Data, RequiredServices> => {
  return render as any
}

/**
 * CLI command configuration with project-specific types.
 * Uses CoreCLICommandConfig from @pikku/core with local middleware and render types.
 */
type CLICommandConfig<Func extends PikkuFunctionConfig<In, Out>, In = any, Out = any, Params extends string = string> = CoreCLICommandConfig<Func, PikkuMiddleware, PikkuCLIRender<any>, Params>

/**
 * Type definition for CLI applications with commands and global options.
 *
 * @template Commands - Type describing the command structure
 * @template GlobalOptions - Type for global CLI options
 */
type CLIWiring<Commands extends Record<string, CoreCLICommandConfig<any, PikkuMiddleware, PikkuCLIRender<any>, any>>, GlobalOptions> = CoreCLI<Commands, GlobalOptions, PikkuMiddleware, PikkuCLIRender<any>>

/**
 * Registers a CLI application with the Pikku framework.
 * Creates command-line interfaces with type-safe commands and options.
 *
 * @template Commands - Type describing the command structure
 * @template GlobalOptions - Type for global CLI options
 * @param cli - CLI definition with program name, commands, and global options
 */
export const wireCLI = <Commands extends Record<string, CoreCLICommandConfig<any, PikkuMiddleware, PikkuCLIRender<any>, any>>, GlobalOptions>(
  cli: CLIWiring<Commands, GlobalOptions>
) => {
  wireCLICore(cli as any)
}

/**
 * Creates a CLI command definition with automatic option inference from the function's input type.
 * This allows TypeScript to automatically derive CLI options from the function signature.
 *
 * @template FuncConfig - The Pikku function config type
 * @template Params - The parameters string literal type
 * @param config - CLI command configuration
 * @returns CLI command configuration with inferred types
 */
export const pikkuCLICommand = <
  FuncConfig extends PikkuFunctionConfig<any, any, any>,
  Params extends string
>(
  config: CLICommandConfig<FuncConfig, any, any, Params>
): CoreCLICommandConfig<FuncConfig, PikkuMiddleware, PikkuCLIRender<any>, string> => {
  return config as any
}
`
}
