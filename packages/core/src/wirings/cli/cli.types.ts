import {
  CorePikkuMiddleware,
  CoreSingletonServices,
  CoreUserSession,
  PikkuDocs,
  CoreServices,
  MiddlewareMetadata,
  PermissionMetadata,
} from '../../types/core.types.js'
import {
  CorePikkuFunctionConfig,
  CorePikkuPermission,
  CorePikkuFunction,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'
import { PikkuChannel } from '../channel/channel.types.js'

/**
 * CLI option definition
 */
export interface CLIOption<T = any> {
  description: string
  short?: string
  default?: T
  choices?: T[]
  array?: boolean
  required?: boolean
}

/**
 * CLI options collection
 */
export type CLIOptions<T> = {
  [K in keyof T]: CLIOption<T[K]>
}

/**
 * Positional argument definition
 */
export interface CLIPositional {
  name: string
  required: boolean
  variadic?: boolean
}

/**
 * CLI interaction context
 */
export type PikkuCLI = {
  program: string
  command: string[]
  data: Record<string, any> // All positionals and options merged
  channel: PikkuChannel<unknown, unknown>
}

/**
 * Runtime CLI program state
 */
export interface CLIProgramState {
  defaultRenderer?: CorePikkuCLIRender<any>
  middleware: CorePikkuMiddleware[]
  renderers: Record<string, CorePikkuCLIRender<any>>
  commandOptions?: Record<string, Record<string, CLIOption>>
  commandMiddleware?: Record<string, CorePikkuMiddleware[]>
  tags?: string[]
}

/**
 * CLI command metadata for runtime
 */
export interface CLICommandMeta {
  parameters?: string
  pikkuFuncName: string
  positionals: CLIPositional[]
  options: Record<string, CLIOption>
  renderName?: string
  description?: string
  docs?: PikkuDocs
  tags?: string[]
  subcommands?: Record<string, CLICommandMeta>
  middleware?: MiddlewareMetadata[] // Pre-resolved middleware chain (tag + explicit)
  permissions?: PermissionMetadata[] // Pre-resolved permission chain (tag + explicit)
  isDefault?: boolean
}

/**
 * CLI metadata collection (per program)
 */
export type CLIProgramMeta = {
  program: string
  commands: Record<string, CLICommandMeta>
  options: Record<string, CLIOption>
  defaultRenderName?: string
}

/**
 * Renderer metadata for CLI commands
 */
export interface RendererMeta {
  name: string
  exportedName?: string
  services: {
    optimized: boolean
    services: string[]
  }
  filePath: string
}

export type RenderersMeta = Record<string, RendererMeta>

/**
 * All CLI programs metadata
 */
export interface CLIMeta {
  programs: Record<string, CLIProgramMeta>
  renderers: RenderersMeta
}

/**
 * CLI-specific renderer that outputs to console
 */
export type CorePikkuCLIRender<
  Data,
  Services extends CoreSingletonServices = CoreServices,
  Session extends CoreUserSession = CoreUserSession,
> = CorePikkuRender<Data, void, Services, Session>

/**
 * Extract input parameters from a Pikku function config type
 */
export type ExtractFunctionInput<Func> =
  Func extends CorePikkuFunctionConfig<infer FuncType, any, any>
    ? FuncType extends
        | CorePikkuFunction<infer Input, any, any, any>
        | CorePikkuFunctionSessionless<infer Input, any, any, any>
      ? Input
      : never
    : never

/**
 * Strip < > [ ] characters from a string
 */
type StripBrackets<S extends string> = S extends `<${infer Inner}>`
  ? Inner
  : S extends `[${infer Inner}]`
    ? Inner
    : S

/**
 * Split string by spaces
 */
type SplitBySpace<S extends string> = S extends `${infer First} ${infer Rest}`
  ? [First, ...SplitBySpace<Rest>]
  : S extends ''
    ? []
    : [S]

/**
 * Recursively build a tuple by stripping brackets from each element
 */
type BuildParamsTuple<Parts extends readonly string[]> =
  Parts extends readonly [
    infer First extends string,
    ...infer Rest extends string[],
  ]
    ? [StripBrackets<First>, ...BuildParamsTuple<Rest>]
    : []

/**
 * Extract parameter names from CLI parameter string into a tuple
 * Example: "<env> [region]" => ["env", "region"]
 */
type ExtractParameterNames<S extends string> = BuildParamsTuple<SplitBySpace<S>>

/**
 * Check if all elements of a tuple are valid keys of Input
 */
type AllParamsValid<
  Params extends readonly any[],
  Input,
> = Params extends readonly [infer First, ...infer Rest]
  ? First extends keyof Input
    ? AllParamsValid<Rest, Input>
    : false
  : true

/**
 * Validate that all parameter names are valid keys of the function input
 */
export type ValidateParameters<Params extends string, Input> =
  AllParamsValid<ExtractParameterNames<Params>, Input> extends true
    ? Params
    : never

/**
 * Extract output type from a Pikku function config type
 */
export type ExtractFunctionOutput<Func> =
  Func extends CorePikkuFunctionConfig<infer FuncType, any, any>
    ? FuncType extends
        | CorePikkuFunction<any, infer Output, any, any>
        | CorePikkuFunctionSessionless<any, infer Output, any, any>
      ? Output
      : never
    : never

/**
 * CLI command configuration that infers options from function input type.
 * This is a helper type for creating type-safe CLI commands.
 */
export type CoreCLICommandConfig<
  FuncConfig,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
  PikkuCLIRender extends CorePikkuCLIRender<any, any, any> = CorePikkuCLIRender<
    any,
    any
  >,
  Params extends string = string,
> = {
  parameters?: ValidateParameters<Params, ExtractFunctionInput<FuncConfig>>
  func?: FuncConfig
  description?: string
  render?: PikkuCLIRender
  options?: {
    [K in keyof ExtractFunctionInput<FuncConfig>]?: {
      description?: string
      short?: string
      default?: ExtractFunctionInput<FuncConfig>[K]
    }
  }
  middleware?: PikkuMiddleware[]
  subcommands?: Record<
    string,
    CoreCLICommandConfig<any, PikkuMiddleware, PikkuCLIRender, any>
  >
  auth?: boolean
  permissions?: any[]
  isDefault?: boolean
}

/**
 * CLI command definition
 */
export interface CoreCLICommand<
  In,
  Out,
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    | CorePikkuFunction<In, Out, any, any>
    | CorePikkuFunctionSessionless<In, Out, any, any>
  >,
  PikkuPermission extends CorePikkuPermission<any, any, any>,
  PikkuMiddleware extends CorePikkuMiddleware,
  Options = any,
  Subcommands extends Record<
    string,
    CoreCLICommandConfig<any, any, any>
  > = Record<string, CoreCLICommandConfig<any, any, any>>,
> {
  parameters?: string
  func: PikkuFunctionConfig
  render?: CorePikkuCLIRender<Out>
  description?: string
  options?: CLIOptions<Options>
  middleware?: PikkuMiddleware[]
  permissions?: Record<string, PikkuPermission | PikkuPermission[]>
  auth?: boolean
  docs?: PikkuDocs
  subcommands?: Subcommands
  isDefault?: boolean
}

/**
 * Shorthand command definition (just a function)
 */
export type CLICommandShorthand<
  In,
  Out,
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    | CorePikkuFunction<In, Out, any, any>
    | CorePikkuFunctionSessionless<In, Out, any, any>
  >,
> = PikkuFunctionConfig

/**
 * Command definition (either full or shorthand)
 */
export type CLICommandDefinition<
  In,
  Out,
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    | CorePikkuFunction<In, Out, any, any>
    | CorePikkuFunctionSessionless<In, Out, any, any>
  >,
  PikkuPermission extends CorePikkuPermission<any, any, any>,
  PikkuMiddleware extends CorePikkuMiddleware,
  Options = any,
  Subcommands extends Record<
    string,
    CoreCLICommandConfig<any, any, any>
  > = Record<string, CoreCLICommandConfig<any, any, any>>,
> =
  | CoreCLICommand<
      In,
      Out,
      PikkuFunctionConfig,
      PikkuPermission,
      PikkuMiddleware,
      Options,
      Subcommands
    >
  | CLICommandShorthand<In, Out, PikkuFunctionConfig>

/**
 * CLI wiring configuration
 */
export interface CoreCLI<
  Commands extends Record<string, CoreCLICommandConfig<any, any, any>>,
  Options,
  PikkuMiddleware,
  PikkuCLIRender,
> {
  program: string
  description?: string
  commands: Commands
  options?: CLIOptions<Options>
  middleware?: PikkuMiddleware[]
  render?: PikkuCLIRender
  docs?: PikkuDocs
  tags?: string[]
}

/**
 * Generic renderer type that can transform data into any output format.
 * Can be used across different wirings for flexible output handling.
 *
 * @template Data - The input data type to be rendered
 * @template Output - The output type after rendering
 * @template Services - The services available to the renderer
 * @template Session - The user session type
 */
export type CorePikkuRender<
  Data,
  Output,
  Services extends CoreSingletonServices = CoreServices,
  Session extends CoreUserSession = CoreUserSession,
> = (
  services: Services,
  data: Data,
  session?: Session
) => Output | Promise<Output>
