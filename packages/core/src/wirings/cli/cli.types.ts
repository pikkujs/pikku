import {
  CorePikkuMiddleware,
  CoreSingletonServices,
  CoreUserSession,
  PikkuDocs,
  CoreServices,
  CorePikkuRender,
} from '../../types/core.types.js'
import {
  CorePikkuFunction,
  CorePikkuFunctionSessionless,
  CorePikkuPermission,
} from '../../function/functions.types.js'

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
  data: Record<string, any>  // All positionals and options merged
}

/**
 * Runtime CLI program state
 */
export interface CLIProgramState {
  defaultRenderer?: CorePikkuCLIRender<any>
  globalMiddleware: CorePikkuMiddleware[]
  renderers: Record<string, CorePikkuCLIRender<any>>
}

/**
 * CLI command metadata for runtime
 */
export interface CLICommandMeta {
  command?: string
  pikkuFuncName: string
  positionals: CLIPositional[]
  options: Record<string, CLIOption>
  renderName?: string
  description?: string
  docs?: PikkuDocs
  tags?: string[]
  subcommands?: Record<string, CLICommandMeta>
}

/**
 * CLI metadata collection (per program)
 */
export type CLIProgramMeta = {
  program: string
  commands: Record<string, CLICommandMeta>
  globalOptions: Record<string, CLIOption>
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
 * CLI command definition
 */
export interface CoreCLICommand<
  In,
  Out,
  PikkuFunction extends
    | CorePikkuFunction<In, Out, any, any, any>
    | CorePikkuFunctionSessionless<In, Out, any, any, any>,
  PikkuPermission extends CorePikkuPermission<any, any, any>,
  PikkuMiddleware extends CorePikkuMiddleware,
  Options = any,
  Subcommands = any,
> {
  command?: string
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
  PikkuFunction extends
    | CorePikkuFunction<In, Out, any, any, any>
    | CorePikkuFunctionSessionless<In, Out, any, any, any>,
> = PikkuFunction

/**
 * Command definition (either full or shorthand)
 */
export type CLICommandDefinition<
  In,
  Out,
  PikkuFunction extends
    | CorePikkuFunction<In, Out, any, any, any>
    | CorePikkuFunctionSessionless<In, Out, any, any, any>,
  PikkuPermission extends CorePikkuPermission<any, any, any>,
  PikkuMiddleware extends CorePikkuMiddleware,
  Options = any,
  Subcommands = any,
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
  Commands,
  GlobalOptions,
  PikkuMiddleware extends CorePikkuMiddleware,
  GlobalOutput = any,
> {
  program: string
  commands: Commands
  options?: CLIOptions<GlobalOptions>
  middleware?: PikkuMiddleware[]
  render?: CorePikkuCLIRender<GlobalOutput>
  docs?: PikkuDocs
}
