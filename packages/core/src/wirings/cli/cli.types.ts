import {
  CorePikkuMiddleware,
  CoreSingletonServices,
  CoreUserSession,
  PikkuDocs,
  CoreServices,
  MiddlewareMetadata,
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
 * All CLI programs metadata
 */
export type CLIMeta = Record<string, CLIProgramMeta>

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
  Func extends CorePikkuFunctionConfig<infer FuncType>
    ? FuncType extends
        | CorePikkuFunction<infer Input, any, any, any, any>
        | CorePikkuFunctionSessionless<infer Input, any, any, any, any>
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
 * Extract parameter names from CLI parameter string
 * Example: "<env> [region]" => ["env", "region"]
 */
type ExtractParameterNames<S extends string> = {
  [K in keyof SplitBySpace<S>]: SplitBySpace<S>[K] extends string
    ? StripBrackets<SplitBySpace<S>[K]>
    : never
}

/**
 * Validate that all parameter names are valid keys of the function input
 */
export type ValidateParameters<Params extends string, Input> =
  ExtractParameterNames<Params> extends (infer P)[]
    ? P extends keyof Input
      ? Params
      : never
    : never

/**
 * Extract output type from a Pikku function config type
 */
export type ExtractFunctionOutput<Func> =
  Func extends CorePikkuFunctionConfig<infer FuncType>
    ? FuncType extends
        | CorePikkuFunction<any, infer Output, any, any, any>
        | CorePikkuFunctionSessionless<any, infer Output, any, any, any>
      ? Output
      : never
    : never

/**
 * CLI command configuration that infers options from function input type.
 * This is a helper type for creating type-safe CLI commands.
 */
export interface CoreCLICommandConfig<
  Func,
  PikkuMiddleware extends CorePikkuMiddleware<any> = CorePikkuMiddleware<any>,
  PikkuCLIRender extends CorePikkuCLIRender<any, any, any> = CorePikkuCLIRender<
    any,
    any
  >,
> {
  parameters?: ValidateParameters<string, ExtractFunctionInput<Func>>
  func?: Func
  description?: string
  render?: PikkuCLIRender
  options?: Partial<
    Record<
      keyof ExtractFunctionInput<Func>,
      {
        description?: string
        short?: string
        default?: ExtractFunctionInput<Func>[keyof ExtractFunctionInput<Func>]
      }
    >
  > &
    Record<
      string,
      {
        description?: string
        short?: string
        default?: any
      }
    >
  middleware?: PikkuMiddleware[]
  subcommands?: Record<
    string,
    CoreCLICommandConfig<any, PikkuMiddleware, PikkuCLIRender>
  >
  auth?: boolean
  permissions?: any[]
}

/**
 * CLI command definition
 */
export interface CoreCLICommand<
  In,
  Out,
  PikkuFunction extends CorePikkuFunctionConfig<
    | CorePikkuFunction<In, Out, any, any, any>
    | CorePikkuFunctionSessionless<In, Out, any, any, any>
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
  func: PikkuFunction
  render?: CorePikkuCLIRender<Out>
  description?: string
  options?: CLIOptions<Options>
  middleware?: PikkuMiddleware[]
  permissions?: Record<string, PikkuPermission | PikkuPermission[]>
  auth?: boolean
  docs?: PikkuDocs
  subcommands?: Subcommands
}

/**
 * Shorthand command definition (just a function)
 */
export type CLICommandShorthand<
  In,
  Out,
  PikkuFunction extends CorePikkuFunctionConfig<
    | CorePikkuFunction<In, Out, any, any, any>
    | CorePikkuFunctionSessionless<In, Out, any, any, any>
  >,
> = PikkuFunction

/**
 * Command definition (either full or shorthand)
 */
export type CLICommandDefinition<
  In,
  Out,
  PikkuFunction extends CorePikkuFunctionConfig<
    | CorePikkuFunction<In, Out, any, any, any>
    | CorePikkuFunctionSessionless<In, Out, any, any, any>
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
      PikkuFunction,
      PikkuPermission,
      PikkuMiddleware,
      Options,
      Subcommands
    >
  | CLICommandShorthand<In, Out, PikkuFunction>

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
