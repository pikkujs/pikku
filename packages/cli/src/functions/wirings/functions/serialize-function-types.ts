/**
 * Generates the function authoring surface — the definers every wiring points
 * at and the types they are written against. Middleware, permissions and the
 * bootstrap factories used to live here too; each is its own decision taken at
 * its own time, so each is now its own leaf.
 */
export const serializeFunctionTypes = (
  userSessionTypeImport: string,
  userSessionTypeName: string,
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  wireServicesTypeImport: string,
  wireServicesTypeName: string,
  rpcMapTypeImport: string,
  requiredServicesTypeImport: string,
  configTypeImport: string,
  authTypesImportPath = '../auth/pikku-auth-types.gen.js',
  workflowTypesImport?: string,
  nodeCategories?: string[],
  scopesTypeImport?: string,
  credentialsTypeImport?: string,
  middlewareTypesImportPath = '../middleware/pikku-middleware-types.gen.js',
  { addon = false }: { addon?: boolean } = {}
) => {
  const nodeCategoryType = nodeCategories?.length
    ? nodeCategories.map((c) => `'${c}'`).join(' | ')
    : 'string'
  const workflowImport =
    workflowTypesImport ||
    `import type { TypedWorkflow } from '../workflow/pikku-workflow-types.gen.js'
import type { TypedScenario, TypedPersonas } from '../scenarios/pikku-scenario-types.gen.js'`
  // Falls back to `string` when a project has no scopes codegen, so that
  // `scopes` stays usable rather than resolving to an unbound type name.
  const scopesImport = scopesTypeImport || `type ScopeId = string`
  // Same fallback reasoning as scopes: a project that declares no credentials
  // never has a credentials leaf to import from, and `wire.getCredential` stays
  // callable with an explicit type argument.
  const credentialsImport =
    credentialsTypeImport || `type CredentialsMap = Record<string, unknown>`

  return `/**
 * Core function types for all wirings
 */

import type { PickRequired } from '@pikku/core/utils'
import type { ListInput, ListOutput } from '@pikku/core/function'
import type { CorePermissionGroup } from '@pikku/core/function'
import type { PikkuWire, SecretlessServices } from '@pikku/core/types'
import type {
  CorePikkuFunctionConfig,
  CorePikkuSessionlessFunctionConfig,
  CorePikkuPermission,
} from '@pikku/core/function'
import type { NodeType } from '@pikku/core/node'
import type { PikkuMiddleware } from '${middlewareTypesImportPath}'
import type { PikkuPermission } from '${authTypesImportPath}'
${scopesImport}
${credentialsImport}
import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  CorePikkuFunction,
  CorePikkuFunctionSessionless,
} from '@pikku/core/function'

${userSessionTypeImport}
${singletonServicesTypeImport}
${wireServicesTypeImport}
${rpcMapTypeImport}
${requiredServicesTypeImport}
${workflowImport}

/**
 * The services that live for the process — the ones built once in \`createConfig\`/
 * \`createSingletonServices\` and shared by every request.
 */
${singletonServicesTypeName !== 'SingletonServices' ? `export type SingletonServices = ${singletonServicesTypeName}` : `export type { ${singletonServicesTypeName} as SingletonServices }`}
/**
 * Everything a function is handed as its first argument: the singleton services
 * plus whatever is built per request. This is the type to widen when you add a
 * service.
 */
${wireServicesTypeName !== 'Services' ? `export type Services = ${wireServicesTypeName}` : `export type { ${wireServicesTypeName} as Services }`}
/**
 * The signed-in user as this project defines it. Reached on the wire as
 * \`session\`, and replaced with \`setSession\`.
 */
${userSessionTypeName !== 'Session' ? `export type Session = ${userSessionTypeName}` : `export type { ${userSessionTypeName} as Session }`}

/**
 * The services a wired function actually receives. The inspector records which
 * services each wired \`func\`, \`permissions\` and \`middleware\` destructures and
 * emits them as \`RequiredSingletonServices\`; intersecting that here makes those
 * services **non-optional** at every call site. A service is optional only when
 * nothing destructures it — in which case it is never created either. This is
 * why an \`if (!service)\` guard inside a function body is always dead code.
 *
 * Only the wire-services half lives here. The singleton half is declared by the
 * auth and middleware leaves that use it, because whether a name earns its
 * export is measured rather than chosen: emit declarations for a project and
 * \`WiredServices\` is named by 147 of its \`.d.ts\` files, while the singleton
 * intersection is named by none outside the leaves that declare it. Export the
 * latter and it is a compatibility promise nothing asked for; unexport
 * \`WiredServices\` and every wired module inlines the intersection instead,
 * which asks it to name each member service through a specifier it does not
 * have — 3308 TS2883s. \`--noEmit\` cannot surface any of that, so re-check with
 * \`tsc --declaration --emitDeclarationOnly\` before moving either one.
 */
export type WiredServices = SecretlessServices<RequiredSingletonServices & Services>

/**
 * Inline node configuration for function definitions.
 */
export type NodeConfig = {
  displayName: string
  category: ${nodeCategoryType}
  type: NodeType
  errorOutput?: boolean
}

/**
 * A function that generates a human-readable description of a pending approval action.
 * Used by AI agents to show meaningful approval prompts instead of raw tool arguments.
 *
 * @template In - The input type (same as the function it describes)
 * @template RequiredServices - The services required for this description function
 */
export type PikkuApprovalDescription<In = unknown, RequiredServices extends SecretlessServices<Services> = WiredServices> = (
  services: RequiredServices,
  data: In
) => Promise<string>

/**
 * Factory function for creating approval description functions with tree-shaking support.
 *
 * @example
 * \`\`\`typescript
 * export const deleteTodoApproval = pikkuApprovalDescription(
 *   async ({ todoStore }, { id }) => {
 *     const todo = await todoStore.get(id)
 *     return \\\`Delete todo: "\${todo.title}"\\\`
 *   }
 * )
 * \`\`\`
 */
export const pikkuApprovalDescription = <In = unknown, RequiredServices extends SecretlessServices<Services> = WiredServices>(
  fn: PikkuApprovalDescription<In, RequiredServices>
): PikkuApprovalDescription<In, RequiredServices> => {
  return fn
}

/**
 * A sessionless API function that doesn't require user authentication.
 * Use this for public endpoints, health checks, or operations that don't need user context.
 *
 * @template In - The input type
 * @template Out - The output type that the function returns
 * @template RequiredServices - Services required by this function
 * @template ScenarioOut - Types \`scenario.context\`; only scenarios set it.
 *   Not defaulted to \`Out\`, which would make every ordinary function's wire
 *   type vary with its return type and cost a \`func\` written against the
 *   \`PikkuFunction | PikkuFunctionSessionless\` union its contextual typing.
 */
export type PikkuFunctionSessionless<
  In = unknown,
  Out = never,
  RequiredWires extends keyof PikkuWire = never,
  RequiredServices extends SecretlessServices<Services> = WiredServices,
  ScenarioOut = unknown
> = CorePikkuFunctionSessionless<
    In,
    Out,
    RequiredServices,
    Session,
    PickRequired<PikkuWire<In, Out, false, Session, TypedPikkuRPC, null, any, TypedWorkflow, unknown, TypedScenario<ScenarioOut>, TypedPersonas, CredentialsMap>, RequiredWires>
  >

/**
 * A session-aware API function that requires user authentication.
 * Use this for protected endpoints that need access to user session data.
 *
 * @template In - The input type
 * @template Out - The output type that the function returns
 * @template RequiredServices - Services required by this function
 */
export type PikkuFunction<
  In = unknown,
  Out = never,
  RequiredWires extends keyof PikkuWire = 'session',
  RequiredServices extends SecretlessServices<Services> = WiredServices
> = CorePikkuFunction<
    In,
    Out,
    RequiredServices,
    Session,
    PickRequired<PikkuWire<In, Out, true, Session, TypedPikkuRPC, null, any, TypedWorkflow, unknown, TypedScenario, TypedPersonas, CredentialsMap>, RequiredWires>
  >

/**
 * Helper type to infer the output type from a Standard Schema
 */
export type InferSchemaOutput<T> = T extends StandardSchemaV1<any, infer Output> ? Output : never

/**
 * Configuration object for Pikku functions with optional middleware, permissions, tags, and documentation.
 * This type wraps CorePikkuFunctionConfig with the user's custom types.
 *
 * @template In - The input type
 * @template Out - The output type
 * @template PikkuFunc - The function type (can be narrowed to PikkuFunction or PikkuFunctionSessionless)
 */
export type PikkuFunctionConfig<
  In = unknown,
  Out = unknown,
  RequiredWires extends keyof PikkuWire = never,
  // \`any\` in the ScenarioOut slot: a constraint pinned to one context type
  // would refuse a scenario body, which types its context as its own output.
  PikkuFunc extends PikkuFunction<In, Out, RequiredWires, any> | PikkuFunctionSessionless<In, Out, RequiredWires, any, any> = PikkuFunction<In, Out, RequiredWires> | PikkuFunctionSessionless<In, Out, RequiredWires>,
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = Omit<CorePikkuFunctionConfig<PikkuFunc, PikkuPermission<In>, PikkuMiddleware, InputSchema, OutputSchema, ScopeId>, 'node'> & {
  node?: NodeConfig
}

/**
 * {@link PikkuFunctionConfig} for a function that runs without a session.
 * Has no \`scopes\`: an anonymous caller holds none, so none can ever be met.
 */
type PikkuFunctionSessionlessConfig<
  In = unknown,
  Out = unknown,
  RequiredWires extends keyof PikkuWire = never,
  PikkuFunc extends PikkuFunctionSessionless<In, Out, RequiredWires, any> = PikkuFunctionSessionless<In, Out, RequiredWires>,
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = Omit<CorePikkuSessionlessFunctionConfig<PikkuFunc, PikkuPermission<In>, PikkuMiddleware, InputSchema, OutputSchema>, 'node'> & {
  node?: NodeConfig
}

/**
 * Configuration object for Pikku functions with Zod schema validation.
 * Use this when you want to define input/output schemas using Zod.
 * Types are automatically inferred from the schemas.
 */
type SchemaInferred<S, Fallback = unknown> = S extends StandardSchemaV1
  ? InferSchemaOutput<S>
  : Fallback

/**
 * Schema-overload variant for pikkuFunc. Derived from CorePikkuFunctionConfig
 * so adding a field on the core type automatically propagates here.
 */
type PikkuFunctionConfigWithSchema<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
  RequiredWires extends keyof PikkuWire = never,
  RequiredServices extends SecretlessServices<Services> = WiredServices
> = Omit<
  CorePikkuFunctionConfig<
    | PikkuFunction<SchemaInferred<InputSchema>, SchemaInferred<OutputSchema>, RequiredWires, RequiredServices>
    | PikkuFunctionSessionless<SchemaInferred<InputSchema>, SchemaInferred<OutputSchema>, RequiredWires, RequiredServices>,
    CorePikkuPermission<any>,
    PikkuMiddleware,
    undefined,
    undefined,
    ScopeId
  >,
  'func' | 'input' | 'output' | 'permissions' | 'approvalDescription' | 'node'
> & {
  func:
    | PikkuFunction<SchemaInferred<InputSchema>, SchemaInferred<OutputSchema>, RequiredWires, RequiredServices>
    | PikkuFunctionSessionless<SchemaInferred<InputSchema>, SchemaInferred<OutputSchema>, RequiredWires, RequiredServices>
  input?: InputSchema
  output?: OutputSchema
  node?: NodeConfig
  permissions?: InputSchema extends StandardSchemaV1
    ? CorePermissionGroup<PikkuPermission<InferSchemaOutput<InputSchema>>>
    : undefined
  approvalDescription?: InputSchema extends StandardSchemaV1
    ? PikkuApprovalDescription<InferSchemaOutput<InputSchema>>
    : never
}

/**
 * Creates a Pikku function that can be either session-aware or sessionless.
 * This is the main function wrapper for creating API endpoints.
 *
 * Define the input and output with Zod schemas — the function's types are
 * inferred from them, and the schemas double as runtime validation.
 *
 * @param config - Function definition with \`input\`/\`output\` Zod schemas and \`func\`.
 * @returns The normalized configuration object
 *
 * @example snippet: pikku-func
 */
export function pikkuFunc<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  config: PikkuFunctionConfigWithSchema<InputSchema, OutputSchema, 'session' | 'rpc'>
): PikkuFunctionConfig<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, 'session' | 'rpc'>
export function pikkuFunc<In, Out = unknown>(
  func:
    | PikkuFunction<In, Out, 'session' | 'rpc'>
    | PikkuFunctionConfig<In, Out, 'session' | 'rpc'>
): PikkuFunctionConfig<In, Out, 'session' | 'rpc'>
export function pikkuFunc(func: any) {
  return typeof func === 'function' ? { func } : func
}

/**
 * A \`pikkuFunc\` whose input and output are already the shared list shape —
 * filters, sort, paging in; rows and a total out — so a listing endpoint pages
 * the same way everywhere.
 */
export const pikkuListFunc = <
  F extends Record<string, unknown> = {},
  Row = unknown,
  S extends string = never
>(
  config: PikkuFunctionConfig<
    ListInput<F, S>,
    ListOutput<Row>,
    'session' | 'rpc'
  >
): PikkuFunctionConfig<ListInput<F, S>, ListOutput<Row>, 'session' | 'rpc'> => {
  return pikkuFunc(config)
}

/**
 * Configuration object for sessionless Pikku functions with Zod schema validation.
 */
/**
 * Schema-overload variant for pikkuSessionlessFunc. Derived from
 * CorePikkuSessionlessFunctionConfig to stay in sync with the generic-typed
 * config — so it has no \`scopes\` either.
 */
type PikkuFunctionSessionlessConfigWithSchema<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
  RequiredWires extends keyof PikkuWire = never,
  RequiredServices extends SecretlessServices<Services> = WiredServices
> = Omit<
  CorePikkuSessionlessFunctionConfig<
    PikkuFunctionSessionless<SchemaInferred<InputSchema>, SchemaInferred<OutputSchema>, RequiredWires, RequiredServices>
  >,
  'func' | 'input' | 'output' | 'permissions' | 'approvalDescription' | 'node'
> & {
  func: PikkuFunctionSessionless<
    SchemaInferred<InputSchema>,
    SchemaInferred<OutputSchema>,
    RequiredWires,
    RequiredServices
  >
  input?: InputSchema
  output?: OutputSchema
  node?: NodeConfig
  permissions?: InputSchema extends StandardSchemaV1
    ? CorePermissionGroup<PikkuPermission<InferSchemaOutput<InputSchema>>>
    : undefined
  approvalDescription?: InputSchema extends StandardSchemaV1
    ? PikkuApprovalDescription<InferSchemaOutput<InputSchema>>
    : never
}

/**
 * Creates a sessionless Pikku function that doesn't require user authentication.
 * Use this for public endpoints, webhooks, or background tasks.
 *
 * Define the input and output with Zod schemas — the function's types are
 * inferred from them, and the schemas double as runtime validation.
 *
 * @param config - Function definition with \`input\`/\`output\` Zod schemas and \`func\`.
 * @returns The normalized configuration object
 *
 * @example snippet: pikku-sessionless-func
 */
export function pikkuSessionlessFunc<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
  RequiredServices extends SecretlessServices<Services> = WiredServices
>(
  config: PikkuFunctionSessionlessConfigWithSchema<InputSchema, OutputSchema, 'session' | 'rpc', RequiredServices>
): PikkuFunctionConfig<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, 'session' | 'rpc'>
export function pikkuSessionlessFunc<In, Out = unknown, RequiredServices extends SecretlessServices<Services> = WiredServices>(
  func:
    | PikkuFunctionSessionless<In, Out, 'session' | 'rpc', RequiredServices>
    | PikkuFunctionSessionlessConfig<In, Out, 'session' | 'rpc', PikkuFunctionSessionless<In, Out, 'session' | 'rpc', RequiredServices>>
): PikkuFunctionConfig<In, Out, 'session' | 'rpc'>
export function pikkuSessionlessFunc(func: any) {
  return typeof func === 'function' ? { func } : func
}

/**
 * Creates a function that takes no input and returns no output.
 * Useful for health checks, triggers, or cleanup operations.
 *
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 *
 * @example snippet: pikku-void-func
 */
export const pikkuVoidFunc = (
  func:
    | PikkuFunctionSessionless<void, void, 'session' | 'rpc'>
    | PikkuFunctionSessionlessConfig<void, void, 'session' | 'rpc'>
): PikkuFunctionConfig<void, void, 'session' | 'rpc'> => {
  return typeof func === 'function' ? { func } : func
}

/**
 * References a registered function by name for use in any wiring.
 * Works for both local and addon functions — resolves via RPC at runtime.
 *
 * @template Name - The function name (must be a key in FlattenedRPCMap)
 * @param rpcName - The name of the function to reference
 * @returns A Pikku function config that proxies calls via RPC
 *
 * @example
 * \`\`\`typescript
 * // Use in agent tools
 * tools: [ref('todos:listTodos'), ref('myLocalFunc')]
 *
 * // Use in HTTP wiring
 * wireHTTP({ route: '/greet', method: 'post', func: ref('greet') })
 * \`\`\`
 */
export const ref = <Name extends keyof FlattenedRPCMap>(
  rpcName: Name
): PikkuFunctionConfig<
  FlattenedRPCMap[Name]['input'],
  FlattenedRPCMap[Name]['output'],
  'session' | 'rpc'
> => {
  return {
    func: async (_services: any, data: FlattenedRPCMap[Name]['input'], { rpc }: any) => {
      return rpc.invoke(rpcName, data)
    }
  } as PikkuFunctionConfig<
    FlattenedRPCMap[Name]['input'],
    FlattenedRPCMap[Name]['output'],
    'session' | 'rpc'
  >
}

/**
 * Declares a capability the connected client answers, reachable from any
 * \`wireChannel\` function as \`channel.remote(name, input)\`.
 *
 * There is no \`func\`: this side owns the contract, the client owns the body.
 * The \`description\` is what a person is shown when asked to approve the call,
 * so write it for them rather than for the caller.
 *
 * @example
 * \`\`\`typescript
 * export const localCheckoutOutput = z.object({ sha: z.string(), branch: z.string() })
 *
 * export const localCheckout = pikkuRemoteChannelFunc({
 *   description: 'Read the current commit and branch of your working tree',
 *   output: localCheckoutOutput,
 * })
 * \`\`\`
 */
export function pikkuRemoteChannelFunc<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  config: Omit<
    PikkuFunctionSessionlessConfigWithSchema<InputSchema, OutputSchema, 'session' | 'rpc'>,
    'func'
  >
): PikkuFunctionConfig<SchemaInferred<InputSchema>, SchemaInferred<OutputSchema>, 'session' | 'rpc'> {
  return {
    ...config,
    func: async (_services: any, _data: any, _wire: any) => {
      throw new Error(
        \`\${config.title ?? 'This'} is a remote channel capability and has no local implementation — reach it with channel.remote() on the channel whose client exposes it.\`
      )
    },
  } as any
}


`
}
